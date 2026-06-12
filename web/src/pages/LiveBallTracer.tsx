import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Point2D } from '../lib/homography'
import { buildVideoToCourt } from '../lib/homography'
import {
  LiveBallTracker, type LiveBounce, type LiveNetCross, type LivePoint,
} from '../lib/liveBallTracker'
import {
  listCameras, backCameras, openCamera, getZoomCapability, applyHardwareZoom,
  type CameraDeviceInfo, type ZoomCapability,
} from '../lib/camera'

/**
 * フェーズ2：ライブカメラ即時弾道トレーサー。
 *
 * ① カメラ起動 → ② コート 4 隅キャリブレーション → ③ ライブ追跡 & 描画
 * 録画と同時に解析できる（MediaRecorder で実映像も保存可）。
 */

type Phase = 'CAMERA_INIT' | 'CALIBRATE' | 'LIVE'

const CORNER_LABELS = [
  '左下（自陣ベースライン左角）',
  '左上（敵陣ベースライン左角）',
  '右上（敵陣ベースライン右角）',
  '右下（自陣ベースライン右角）',
]

const TRAIL_COLORS = {
  FLIGHT: '#00E5FF',
  NET: '#FFEA00',
  BOUNCE: '#FF2D95',
  RECEIVE: '#B14CFF',
}

function pickVideoMime(): string {
  const cands = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  for (const c of cands) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  return ''
}

export function LiveBallTracerPage() {
  const nav = useNavigate()
  const [phase, setPhase] = useState<Phase>('CAMERA_INIT')
  const [courtType, setCourtType] = useState<'SINGLES' | 'DOUBLES'>('SINGLES')
  const [corners, setCorners] = useState<Point2D[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<{ url: string; mime: string } | null>(null)
  const [trailMode, setTrailMode] = useState<'COMET' | 'FULL'>('COMET')

  // スタッツ
  const [fps, setFps] = useState(0)
  const [bounceCount, setBounceCount] = useState(0)
  const [inRate, setInRate] = useState<number | null>(null)
  const [latestVerdict, setLatestVerdict] = useState<LiveBounce | null>(null)
  const [latestNet, setLatestNet] = useState<LiveNetCross | null>(null)

  // カメラ列挙＋ズーム
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined)
  const [zoomCap, setZoomCap] = useState<ZoomCapability>({ supported: false, min: 1, max: 1, step: 0.1, current: 1 })
  const [digitalZoom, setDigitalZoom] = useState(1)   // ハードズーム非対応時の CSS フォールバック

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackerRef = useRef<LiveBallTracker | null>(null)
  const startTimeRef = useRef(performance.now())
  const rafRef = useRef<number | null>(null)
  const lastFpsTickRef = useRef(performance.now())
  const fpsCounterRef = useRef(0)
  const inRef = useRef({ total: 0, in: 0 })
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // ── カメラ起動 / 切替 ──
  const openWith = async (deviceId?: string) => {
    setError(null)
    try {
      // 既存ストリームを止める
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      const stream = await openCamera({
        deviceId, facingMode: deviceId ? undefined : 'environment',
        audio: true, width: 1280, height: 720,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => { /* autoplay 制限時は無視 */ })
      }
      // ズーム能力を更新
      setZoomCap(getZoomCapability(stream))
      setDigitalZoom(1)
      const t = stream.getVideoTracks()[0]
      const realId = t?.getSettings().deviceId
      setActiveDeviceId(realId)
      // カメラ一覧（許可後にラベルが取れる）
      const cams = await listCameras()
      setCameras(backCameras(cams))
      if (phase === 'CAMERA_INIT') setPhase('CALIBRATE')
    } catch (e: any) {
      setError('カメラへのアクセスに失敗：' + (e?.message ?? String(e)))
    }
  }

  // 初回マウントでカメラを開く
  useEffect(() => {
    openWith()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const mr = mrRef.current
      if (mr && mr.state !== 'inactive') { try { mr.stop() } catch { /* noop */ } }
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── ズーム適用 ──
  const setZoom = async (z: number) => {
    if (zoomCap.supported) {
      const ok = await applyHardwareZoom(streamRef.current, z)
      if (ok) {
        setZoomCap(c => ({ ...c, current: z }))
        return
      }
    }
    // ハードウェアズーム非対応 → CSS scale（解析座標も補正が必要なため簡易扱い）
    setDigitalZoom(z)
  }

  // ── キャリブクリック ──
  const onCalibClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== 'CALIBRATE') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setCorners(prev => prev.length < 4 ? [...prev, [x, y]] : [[x, y]])
  }

  // ── 追跡開始 ──
  const startLive = () => {
    if (corners.length !== 4) return
    const H = buildVideoToCourt(corners, courtType)
    inRef.current = { total: 0, in: 0 }
    setBounceCount(0); setInRate(null); setLatestVerdict(null); setLatestNet(null)
    trackerRef.current = new LiveBallTracker(H, courtType, {
      onBounce: (b) => {
        setBounceCount(c => c + 1)
        setLatestVerdict(b)
        if (b.verdict !== 'UNKNOWN') {
          inRef.current.total++
          if (b.verdict === 'IN') inRef.current.in++
          setInRate(Math.round((inRef.current.in / inRef.current.total) * 100))
        }
      },
      onNetCross: (n) => setLatestNet(n),
    })
    startTimeRef.current = performance.now()
    setPhase('LIVE')
  }

  // ── ライブループ ──
  useEffect(() => {
    if (phase !== 'LIVE') return
    const v = videoRef.current
    const cv = overlayRef.current
    if (!v || !cv) return
    const ctx = cv.getContext('2d')!

    const useRVFC = typeof (v as any).requestVideoFrameCallback === 'function'

    const tickStats = () => {
      const now = performance.now()
      fpsCounterRef.current++
      if (now - lastFpsTickRef.current > 500) {
        const f = (fpsCounterRef.current * 1000) / (now - lastFpsTickRef.current)
        setFps(Math.round(f))
        lastFpsTickRef.current = now
        fpsCounterRef.current = 0
      }
    }

    const process = () => {
      if (!trackerRef.current) return
      const tSec = (performance.now() - startTimeRef.current) / 1000
      trackerRef.current.feed(v, tSec)
      // 描画
      const w = v.clientWidth, h = v.clientHeight
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
      ctx.clearRect(0, 0, w, h)
      drawLive(ctx, trackerRef.current, tSec, w, h, trailMode)
      tickStats()
    }

    if (useRVFC) {
      const onFrame = () => {
        process()
        if (phase !== 'LIVE') return
        ;(v as any).requestVideoFrameCallback(onFrame)
      }
      ;(v as any).requestVideoFrameCallback(onFrame)
    } else {
      const loop = () => {
        process()
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [phase, trailMode])

  // ── 録画開始/停止 ──
  const startRec = () => {
    const stream = streamRef.current
    if (!stream) return
    chunksRef.current = []
    if (recordedBlob) { URL.revokeObjectURL(recordedBlob.url); setRecordedBlob(null) }
    const mime = pickVideoMime()
    try {
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(stream)
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const actualMime = mr.mimeType || mime || 'video/webm'
        const blob = new Blob(chunksRef.current, { type: actualMime })
        setRecordedBlob({ url: URL.createObjectURL(blob), mime: actualMime })
      }
      mr.start(250)
      mrRef.current = mr
      setRecording(true)
    } catch (e: any) {
      setError('録画開始に失敗：' + (e?.message ?? String(e)))
    }
  }
  const stopRec = () => {
    const mr = mrRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    mrRef.current = null
    setRecording(false)
  }
  useEffect(() => () => { if (recordedBlob) URL.revokeObjectURL(recordedBlob.url) }, [recordedBlob])

  // ── UI ──
  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">ライブ弾道トレーサー</h1>
          <p className="text-xs text-gray-400">三脚固定でリアルタイムにボールの軌跡を描画</p>
        </div>
        {phase === 'LIVE' && (
          <span className="text-[10px] font-bold bg-court-card px-2 py-1 rounded text-court-accent">
            {fps} fps
          </span>
        )}
      </header>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-sm">⚠️ {error}</div>
      )}

      {/* 共通の映像コンテナ：CAMERA_INIT のうちもマウント維持（前のバグ防止） */}
      <div className={`relative bg-black rounded-xl overflow-hidden aspect-video ${phase === 'CALIBRATE' ? 'cursor-crosshair' : ''}`}
        onClick={onCalibClick}>
        <video ref={videoRef} playsInline muted autoPlay
          style={{ transform: `scale(${digitalZoom})`, transformOrigin: 'center center' }}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
        <canvas ref={overlayRef}
          style={{ transform: `scale(${digitalZoom})`, transformOrigin: 'center center' }}
          className="absolute inset-0 w-full h-full pointer-events-none" />

        {phase === 'CAMERA_INIT' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center space-y-2">
              <div className="text-5xl animate-pulse">📷</div>
              <div className="text-white text-sm">カメラを起動中…</div>
            </div>
          </div>
        )}

        {phase === 'CALIBRATE' && <CornerOverlay corners={corners} />}
        {phase === 'CALIBRATE' && corners.length < 4 && (
          <div className="absolute top-2 left-2 right-2 bg-yellow-900/80 rounded px-2 py-1 text-xs text-court-warning">
            ⚠️ 「{CORNER_LABELS[corners.length]}」をタップ（{corners.length + 1}/4）
          </div>
        )}

        {phase === 'LIVE' && recording && (
          <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1 flex items-center gap-1">
            <span className="w-2 h-2 bg-court-danger rounded-full animate-pulse" />
            <span className="text-court-danger text-xs font-bold">● REC</span>
          </div>
        )}
        {phase === 'LIVE' && latestVerdict && <VerdictBadge b={latestVerdict} />}
        {phase === 'LIVE' && latestNet && (
          <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-1 text-xs font-bold text-court-warning">
            ネット通過：約{latestNet.heightM.toFixed(2)}m
          </div>
        )}
      </div>

      {/* カメラ選択 ＋ ズーム（CALIBRATE と LIVE で共通表示） */}
      {phase !== 'CAMERA_INIT' && (
        <CameraControls
          cameras={cameras}
          activeId={activeDeviceId}
          onSwitch={(id) => openWith(id)}
          zoomCap={zoomCap}
          digitalZoom={digitalZoom}
          onZoom={setZoom}
        />
      )}

      {/* CALIBRATE 操作 */}
      {phase === 'CALIBRATE' && (
        <div className="space-y-3">
          <div className="bg-court-card rounded-xl p-3">
            <div className="text-xs text-gray-400 mb-2">コート種別</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCourtType('SINGLES')}
                className={`py-2 rounded text-sm font-bold ${courtType === 'SINGLES' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'}`}>
                シングルス
              </button>
              <button onClick={() => setCourtType('DOUBLES')}
                className={`py-2 rounded text-sm font-bold ${courtType === 'DOUBLES' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'}`}>
                ダブルス
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCorners([])}
              className="flex-1 bg-court-card text-court-danger text-sm font-bold py-2 rounded-lg">
              ↶ やり直し
            </button>
            <button onClick={startLive} disabled={corners.length !== 4}
              className="flex-1 bg-green-700 disabled:bg-gray-700 text-white text-sm font-bold py-2 rounded-lg active:scale-95">
              ▶ 追跡開始
            </button>
          </div>
          <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
            💡 スマホを<b>三脚で固定</b>してください。コートの 4 隅が映る位置から後方撮影がベスト。
            順番：①左下 → ②左上 → ③右上 → ④右下（自陣→敵陣）。
          </div>
        </div>
      )}

      {/* LIVE 操作 */}
      {phase === 'LIVE' && (
        <div className="space-y-3">
          <div className="bg-court-card rounded-xl p-3 grid grid-cols-3 text-center text-xs">
            <Cell label="バウンド" value={`${bounceCount}`} />
            <Cell label="IN 率" value={inRate != null ? `${inRate}%` : '—'} />
            <Cell label="FPS" value={`${fps}`} />
          </div>

          <div className="flex gap-2">
            <button onClick={() => setTrailMode(m => m === 'COMET' ? 'FULL' : 'COMET')}
              className="flex-1 bg-court-card text-court-info text-xs py-2 rounded-lg">
              {trailMode === 'COMET' ? '☄️ 彗星' : '🌈 全軌跡'}
            </button>
            {!recording ? (
              <button onClick={startRec}
                className="flex-1 bg-court-danger text-white font-bold py-2 rounded-lg active:scale-95">
                ⏺ 録画開始
              </button>
            ) : (
              <button onClick={stopRec}
                className="flex-1 bg-red-700 text-white font-bold py-2 rounded-lg active:scale-95">
                ⏹ 録画停止
              </button>
            )}
            <button onClick={() => trackerRef.current?.reset()}
              className="px-3 bg-court-card text-court-warning text-xs py-2 rounded-lg">
              ↻ リセット
            </button>
          </div>

          {recordedBlob && (
            <div className="bg-court-card rounded-xl p-3 space-y-2">
              <div className="text-xs text-gray-400">録画した実映像</div>
              <video controls src={recordedBlob.url}
                className="w-full rounded-lg bg-black" />
              <a href={recordedBlob.url} download={`tracer-${Date.now()}.${recordedBlob.mime.includes('mp4') ? 'mp4' : 'webm'}`}
                className="block w-full bg-court-info text-white text-center text-sm font-bold py-2 rounded-lg">
                📥 動画を保存
              </a>
            </div>
          )}

          <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
            💡 弾道はコート 4 隅のキャリブから推定しています。スマホを動かすとズレるので
            三脚固定推奨。激しい背景・蛍光緑のフェンス等は誤検出の原因になります。
          </div>

          <button onClick={() => { setPhase('CALIBRATE'); setCorners([]) }}
            className="w-full bg-court-card text-gray-300 text-sm py-2 rounded-xl">
            ⚙️ 再キャリブレーション
          </button>
        </div>
      )}
    </div>
  )
}

// ── 描画 ───────────────────────────────────────────────
function drawLive(
  ctx: CanvasRenderingContext2D, tracker: LiveBallTracker, tSec: number,
  w: number, h: number, mode: 'COMET' | 'FULL',
) {
  const pts: LivePoint[] = tracker.getPoints()
  if (pts.length >= 2) {
    const windowSec = mode === 'COMET' ? 0.8 : 3.0
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      if (tSec - b.tSec > windowSec) continue
      const speed = Math.hypot(b.x - a.x, b.y - a.y)
      const width = Math.max(1.5, Math.min(7, speed * 600))
      const age = tSec - b.tSec
      const alpha = Math.max(0.08, 1 - age / windowSec)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = TRAIL_COLORS.FLIGHT
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.shadowColor = TRAIL_COLORS.FLIGHT
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.moveTo(a.x * w, a.y * h)
      ctx.lineTo(b.x * w, b.y * h)
      ctx.stroke()
      ctx.restore()
    }
    // 先頭に光球
    const head = pts[pts.length - 1]
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = TRAIL_COLORS.FLIGHT
    ctx.shadowBlur = 20
    ctx.beginPath()
    ctx.arc(head.x * w, head.y * h, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // バウンドリング
  for (const b of tracker.getBounces()) {
    const age = tSec - b.tSec
    if (age < 0 || age > 2.0) continue
    const color = b.verdict === 'IN' ? '#00E676' : b.verdict === 'OUT' ? '#FF1744' : '#9E9E9E'
    const grow = Math.min(1, age / 0.4)
    const radius = 8 + grow * 22
    const alpha = Math.max(0, 1 - age / 2.0)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.shadowColor = color
    ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.arc(b.x * w, b.y * h, radius, 0, Math.PI * 2)
    ctx.stroke()
    if (age < 1.0) {
      ctx.globalAlpha = Math.max(0, 1 - age / 1.0)
      ctx.fillStyle = color
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(b.verdict === 'IN' ? 'IN ✓' : b.verdict === 'OUT' ? 'OUT ✕' : '?', b.x * w, b.y * h - radius - 6)
    }
    ctx.restore()
  }

  // ネット通過ポップアップ
  for (const nc of tracker.getNetCrossings()) {
    const age = tSec - nc.tSec
    if (age < 0 || age > 1.6) continue
    const alpha = Math.max(0, 1 - age / 1.6)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#FFEA00'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 3
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    const text = `ネット上 約${nc.heightM.toFixed(2)}m`
    const x = nc.x * w, y = nc.y * h - 14
    ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
    ctx.restore()
  }
}

function VerdictBadge({ b }: { b: LiveBounce }) {
  const isIn = b.verdict === 'IN'
  const isOut = b.verdict === 'OUT'
  const cls = isIn ? 'bg-emerald-700 text-white' : isOut ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-200'
  const label = isIn ? 'IN ✓' : isOut ? 'OUT ✕' : '判定不可'
  return (
    <div className={`absolute top-2 right-2 ${cls} rounded-lg px-3 py-1.5 font-black animate-pulse`}>
      <div className="text-sm">{label}</div>
      <div className="text-[9px] opacity-80">
        {b.spin === 'TOPSPIN' ? 'トップスピン' : b.spin === 'SLICE' ? 'スライス' : b.spin === 'FLAT' ? 'フラット' : ''}
      </div>
    </div>
  )
}

function CornerOverlay({ corners }: { corners: Point2D[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 56" preserveAspectRatio="none">
        {corners.map((c, i) => (
          <g key={i}>
            <circle cx={c[0] * 100} cy={c[1] * 56} r={1.5}
              fill="#F9A825" stroke="white" strokeWidth={0.3} />
            <text x={c[0] * 100} y={c[1] * 56 - 2.5}
              fill="white" fontSize={2.5} fontWeight="bold" textAnchor="middle">{i + 1}</text>
          </g>
        ))}
        {corners.length === 4 && (
          <polygon points={corners.map(c => `${c[0] * 100},${c[1] * 56}`).join(' ')}
            fill="rgba(249,168,37,0.15)" stroke="#F9A825" strokeWidth={0.3} strokeDasharray="1.5,1" />
        )}
      </svg>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-black text-court-accent">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}

function CameraControls({ cameras, activeId, onSwitch, zoomCap, digitalZoom, onZoom }: {
  cameras: CameraDeviceInfo[]
  activeId?: string
  onSwitch: (id?: string) => void
  zoomCap: ZoomCapability
  digitalZoom: number
  onZoom: (z: number) => void
}) {
  const HINT_LABEL: Record<CameraDeviceInfo['hint'], string> = {
    ULTRA_WIDE: '🌐 超広角',
    WIDE: '📐 広角',
    STANDARD: '📷 標準',
    TELE: '🔭 望遠',
  }
  // 表示用：ハードズームがあれば current、無ければ digitalZoom
  const currentZoom = zoomCap.supported ? zoomCap.current : digitalZoom
  const zoomMin = zoomCap.supported ? zoomCap.min : 1
  const zoomMax = zoomCap.supported ? zoomCap.max : 3
  const zoomStep = zoomCap.supported ? zoomCap.step : 0.1

  return (
    <div className="bg-court-card rounded-xl p-3 space-y-2">
      {/* カメラ切替 */}
      {cameras.length > 1 && (
        <div>
          <div className="text-xs text-gray-400 mb-1">カメラ（広角／標準／望遠を切替）</div>
          <div className="grid grid-cols-2 gap-2">
            {cameras.map(c => (
              <button key={c.deviceId} onClick={() => onSwitch(c.deviceId)}
                className={`py-2 px-2 rounded text-xs font-bold text-left ${
                  c.deviceId === activeId ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'
                }`}>
                <div>{HINT_LABEL[c.hint]}</div>
                <div className="text-[9px] opacity-70 truncate">{c.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {cameras.length <= 1 && (
        <div className="text-[10px] text-gray-500">
          この端末からは追加カメラを検出できませんでした。
          {/* iOS Safari 等では enumerateDevices が制限されることがあります */}
        </div>
      )}

      {/* ズーム */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>
            {zoomCap.supported ? '🔍 光学ズーム' : '🔍 デジタルズーム（CSS）'}
          </span>
          <span className="font-mono text-court-info">{currentZoom.toFixed(1)}×</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onZoom(Math.max(zoomMin, currentZoom - zoomStep))}
            className="w-9 h-9 bg-court-surface text-white rounded text-lg active:scale-95">−</button>
          <input type="range"
            min={zoomMin} max={zoomMax} step={zoomStep}
            value={currentZoom}
            onChange={e => onZoom(Number(e.target.value))}
            className="flex-1 accent-court-accent" />
          <button onClick={() => onZoom(Math.min(zoomMax, currentZoom + zoomStep))}
            className="w-9 h-9 bg-court-surface text-white rounded text-lg active:scale-95">＋</button>
          <button onClick={() => onZoom(1)}
            className="px-2 h-9 bg-court-surface text-court-info text-xs rounded">1×</button>
        </div>
        {!zoomCap.supported && (
          <div className="text-[10px] text-gray-500 mt-1">
            この端末は光学ズーム非対応。CSS で見た目だけ拡大します（解析精度は変化なし）。
          </div>
        )}
      </div>
    </div>
  )
}
