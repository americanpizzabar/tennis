import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Point2D } from '../lib/homography'
import {
  trackVideo, phaseAt, type TrackResult, type BouncePoint,
} from '../lib/ballTracker'
import { detectCourtFromVideo } from '../lib/courtDetector'

/**
 * テニス特化・弾道トレーサー（フェーズ1：動画解析）。
 *
 * フロー：① 動画アップロード → ② コート 4 隅キャリブレーション
 *        → ③ 自動解析 → ④ ネオン弾道つきで再生
 */

type Phase = 'UPLOAD' | 'CALIBRATE' | 'ANALYZING' | 'PLAY'

const CORNER_LABELS = [
  '左下（自陣ベースライン左角）',
  '左上（敵陣ベースライン左角）',
  '右上（敵陣ベースライン右角）',
  '右下（自陣ベースライン右角）',
]

const TRAIL_COLORS = {
  FLIGHT: '#00E5FF',   // サイバーブルー
  NET: '#FFEA00',      // ネット通過＝黄
  BOUNCE: '#FF2D95',   // バウンド＝蛍光ピンク
  RECEIVE: '#B14CFF',  // バウンド後＝紫（点線）
}

export function BallTracerPage() {
  const nav = useNavigate()
  const [phase, setPhase] = useState<Phase>('UPLOAD')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [courtType, setCourtType] = useState<'SINGLES' | 'DOUBLES'>('SINGLES')
  const [corners, setCorners] = useState<Point2D[]>([])
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<TrackResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [trailMode, setTrailMode] = useState<'FULL' | 'COMET'>('COMET')

  const [autoDetectMsg, setAutoDetectMsg] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const calibVideoRef = useRef<HTMLVideoElement>(null)
  const urlRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)

  // ── ファイル ──
  const onFile = (file: File) => {
    if (!file.type.startsWith('video/')) { setError('動画ファイルを選んでください'); return }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(file)
    urlRef.current = url
    setVideoUrl(url)
    setCorners([])
    setResult(null)
    setError(null)
    setAutoDetectMsg(null)
    setPhase('CALIBRATE')
  }
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  // ── コート自動検出 ──
  const runAutoDetect = () => {
    const v = videoRef.current
    if (!v || v.readyState < 2) {
      setAutoDetectMsg('⏳ 動画の読み込みを待っています…')
      return
    }
    const det = detectCourtFromVideo(v)
    if (det && det.confidence >= 0.25) {
      setCorners(det.corners)
      setAutoDetectMsg(`✅ コートを自動検出しました（信頼度 ${(det.confidence * 100).toFixed(0)}%）。ズレている場合はタップで修正できます。`)
    } else {
      setAutoDetectMsg('⚠️ 自動検出できませんでした。コート全体と白線が見えるフレームで再試行するか、手動で 4 隅をタップしてください。')
    }
  }

  // CALIBRATE に入ったら自動検出をデフォルト実行
  useEffect(() => {
    if (phase !== 'CALIBRATE') return
    const v = videoRef.current
    if (!v) return
    const tryDetect = () => { runAutoDetect() }
    if (v.readyState >= 2) {
      // 最初のフレームが描画できる状態
      tryDetect()
    } else {
      v.addEventListener('loadeddata', tryDetect, { once: true })
      return () => v.removeEventListener('loadeddata', tryDetect)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, videoUrl])

  // ── キャリブレーション クリック（手動修正） ──
  const onCalibClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setAutoDetectMsg(null)
    setCorners(prev => prev.length < 4 ? [...prev, [x, y]] : [[x, y]])
  }

  // ── 解析開始 ──
  const startAnalysis = async () => {
    if (corners.length !== 4 || !videoRef.current) return
    setPhase('ANALYZING')
    setProgress(0)
    setError(null)
    try {
      const v = videoRef.current
      v.muted = true
      // メタデータ確実化
      if (v.readyState < 1) {
        await new Promise<void>((res, rej) => {
          v.addEventListener('loadedmetadata', () => res(), { once: true })
          v.addEventListener('error', () => rej(new Error('動画ロード失敗')), { once: true })
        })
      }
      const r = await trackVideo(v, {
        courtType, corners,
        onProgress: setProgress,
      })
      if (r.track.length < 3) {
        throw new Error('ボールをほとんど検出できませんでした。明るく・ボールがはっきり映る動画でお試しください。')
      }
      setResult(r)
      setPhase('PLAY')
      v.currentTime = 0
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setPhase('CALIBRATE')
    }
  }

  // ── 再生＋オーバーレイ描画ループ ──
  useEffect(() => {
    if (phase !== 'PLAY' || !result) return
    const v = videoRef.current
    const cv = overlayRef.current
    if (!v || !cv) return
    const ctx = cv.getContext('2d')!

    const draw = () => {
      const w = v.clientWidth, h = v.clientHeight
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
      ctx.clearRect(0, 0, w, h)
      drawTracer(ctx, result, v.currentTime, w, h, trailMode)
      drawBounces(ctx, result, v.currentTime, w, h)
      drawNetPopup(ctx, result, v.currentTime, w, h)
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [phase, result, trailMode])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  const stats = useMemo(() => result ? summarize(result) : null, [result])

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">弾道トレーサー</h1>
          <p className="text-xs text-gray-400">動画からボールの軌跡を検出 → ネオン弾道を描画</p>
        </div>
      </header>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-sm">⚠️ {error}</div>
      )}

      {phase === 'UPLOAD' && (
        <div className="space-y-3">
          <div className="bg-blue-950/60 rounded-xl p-3 text-xs leading-relaxed">
            🎾 三脚で後方から撮影したラリー動画がベスト（60fps 推奨）。
            ボールがはっきり映り、コートの 4 隅が見える動画を選んでください。
            <br /><br />
            解析はすべて端末内で行われます（動画は外部送信されません）。
          </div>
          <UploadBox onFile={onFile} />
        </div>
      )}

      {phase === 'CALIBRATE' && videoUrl && (
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

          <div className="text-sm font-bold text-court-warning">📐 コートの 4 隅（自動検出 → タップで修正可）</div>
          {autoDetectMsg && (
            <div className={`rounded-lg px-3 py-2 text-xs ${autoDetectMsg.startsWith('✅') ? 'bg-emerald-900/50 text-emerald-200' : 'bg-yellow-900/50 text-yellow-200'}`}>
              {autoDetectMsg}
            </div>
          )}
          <div className="relative bg-black rounded-xl overflow-hidden aspect-video cursor-crosshair"
            onClick={onCalibClick}>
            <video ref={videoRef} src={videoUrl} playsInline muted controls
              className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
            <CornerOverlay corners={corners} />
            {corners.length > 0 && corners.length < 4 && (
              <div className="absolute top-2 left-2 right-2 bg-yellow-900/70 rounded px-2 py-1 text-xs text-court-warning">
                ⚠️ 「{CORNER_LABELS[corners.length]}」をタップ（{corners.length + 1}/4）
              </div>
            )}
          </div>
          {/* 解析用の隠し video（再生走査に使う、calib と別参照にすると面倒なので同一を使う） */}
          <div className="flex gap-2">
            <button onClick={runAutoDetect}
              className="flex-1 bg-court-info text-white text-sm font-bold py-2 rounded-lg active:scale-95">
              🤖 自動検出
            </button>
            <button onClick={() => { setCorners([]); setAutoDetectMsg(null) }}
              className="flex-1 bg-court-card text-court-danger text-sm font-bold py-2 rounded-lg">
              ↶ 手動でやり直し
            </button>
            <button onClick={startAnalysis} disabled={corners.length !== 4}
              className="flex-1 bg-green-700 disabled:bg-gray-700 text-white text-sm font-bold py-2 rounded-lg active:scale-95">
              ▶ 弾道を解析
            </button>
          </div>
          <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
            💡 コートの 4 隅は白線から自動検出されます。ズレている場合は動画を一時停止し、
            ①左下 → ②左上 → ③右上 → ④右下 の順にタップして修正してください。
            別のフレームで「🤖 自動検出」を再実行することもできます。
          </div>
          <video ref={calibVideoRef} className="hidden" />
        </div>
      )}

      {phase === 'ANALYZING' && (
        <div className="space-y-4 py-8 text-center">
          <div className="text-5xl animate-pulse">🎾</div>
          <div className="text-white font-bold">ボールを追跡中…</div>
          <div className="w-full bg-court-card rounded-full h-3 overflow-hidden">
            <div className="bg-gradient-to-r from-cyan-400 to-pink-500 h-full transition-all"
              style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="text-xs text-gray-400">{Math.round(progress * 100)}%</div>
          <div className="text-[10px] text-gray-500">
            HSV 色フィルタ＋連結成分でフレームごとにボールを検出しています
          </div>
        </div>
      )}

      {phase === 'PLAY' && result && (
        <div className="space-y-3">
          <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
            <video ref={videoRef} src={videoUrl ?? undefined} playsInline muted loop
              className="absolute inset-0 w-full h-full object-contain"
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={togglePlay}
              className="flex-1 bg-court-accent text-white font-bold py-2 rounded-lg text-sm">
              {playing ? '⏸ 一時停止' : '▶ 再生'}
            </button>
            <button onClick={() => setTrailMode(m => m === 'COMET' ? 'FULL' : 'COMET')}
              className="px-3 py-2 bg-court-card text-court-info text-xs rounded-lg">
              {trailMode === 'COMET' ? '☄️ 彗星' : '🌈 全軌跡'}
            </button>
          </div>

          {/* スタッツ */}
          {stats && (
            <div className="bg-court-card rounded-xl p-3 grid grid-cols-3 text-center text-xs">
              <Cell label="検出点" value={`${stats.points}`} />
              <Cell label="バウンド" value={`${stats.bounces}`} />
              <Cell label="IN 率" value={stats.inRate != null ? `${stats.inRate}%` : '—'} />
            </div>
          )}

          {/* バウンド一覧 */}
          {result.bounces.length > 0 && (
            <div className="bg-court-card rounded-xl p-3 space-y-1.5">
              <div className="text-xs text-gray-400">バウンド一覧（タップでジャンプ）</div>
              {result.bounces.map((b, i) => (
                <button key={i}
                  onClick={() => { if (videoRef.current) { videoRef.current.currentTime = b.tSec; videoRef.current.pause() } }}
                  className="w-full flex items-center gap-2 bg-court-surface/60 rounded-lg px-2 py-1.5 text-left">
                  <span className={`w-2.5 h-2.5 rounded-full ${b.verdict === 'IN' ? 'bg-court-accent' : b.verdict === 'OUT' ? 'bg-court-danger' : 'bg-gray-500'}`} />
                  <div className="flex-1 text-xs">
                    <span className="font-bold">{verdictLabel(b.verdict)}</span>
                    <span className="text-gray-400"> ・ {spinLabel(b.spin)} ・ {b.tSec.toFixed(2)}s</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">
                    ({b.courtX.toFixed(1)}, {b.courtZ.toFixed(1)})
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
            💡 単一カメラのため高さ（Z 軸）は近似です。正確なネット通過高度やスピン量は
            「📡 マルチアングル同期撮影 → 🛰 3D 弾道変換」の 2 視点三角測量をご利用ください。
          </div>

          <button onClick={() => { setPhase('UPLOAD'); setResult(null) }}
            className="w-full bg-court-card text-gray-300 font-bold py-2 rounded-xl text-sm">
            別の動画を解析する
          </button>
        </div>
      )}
    </div>
  )
}

// ── 描画 ───────────────────────────────────────────────
function drawTracer(
  ctx: CanvasRenderingContext2D, result: TrackResult, tSec: number,
  w: number, h: number, mode: 'FULL' | 'COMET',
) {
  const track = result.track
  if (track.length < 2) return
  // 現在時刻までの点（COMET は直近 0.8s だけ）
  const windowSec = mode === 'COMET' ? 0.8 : Infinity
  const pts = track.filter(p => p.tSec <= tSec + 0.001 && p.tSec >= tSec - windowSec)
  if (pts.length < 2) return

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const phaseHere = phaseAt(result, b.tSec)
    const color = TRAIL_COLORS[phaseHere]
    // 速度（画像内）でライン太さを変える
    const speed = Math.hypot(b.x - a.x, b.y - a.y)
    const width = Math.max(1.5, Math.min(7, speed * 600))
    // 残像フェード（古いほど透明）
    const age = (tSec - b.tSec)
    const alpha = mode === 'COMET' ? Math.max(0.05, 1 - age / windowSec) : 0.85

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = 12
    // RECEIVE フェーズは点線
    if (phaseHere === 'RECEIVE') ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.moveTo(a.x * w, a.y * h)
    ctx.lineTo(b.x * w, b.y * h)
    ctx.stroke()
    ctx.restore()
  }

  // 先頭（現在ボール）に光球
  const head = pts[pts.length - 1]
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = TRAIL_COLORS[phaseAt(result, head.tSec)]
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(head.x * w, head.y * h, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawBounces(
  ctx: CanvasRenderingContext2D, result: TrackResult, tSec: number, w: number, h: number,
) {
  for (const b of result.bounces) {
    if (b.tSec > tSec + 0.001) continue
    const age = tSec - b.tSec
    if (age > 2.5) continue   // 2.5s で消える
    const color = b.verdict === 'IN' ? '#00E676' : b.verdict === 'OUT' ? '#FF1744' : '#9E9E9E'
    const grow = Math.min(1, age / 0.4)
    const radius = 8 + grow * 22
    const alpha = Math.max(0, 1 - age / 2.5)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.shadowColor = color
    ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.arc(b.x * w, b.y * h, radius, 0, Math.PI * 2)
    ctx.stroke()
    // ラベル
    if (age < 1.5) {
      ctx.globalAlpha = Math.max(0, 1 - age / 1.5)
      ctx.fillStyle = color
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(verdictLabel(b.verdict), b.x * w, b.y * h - radius - 6)
    }
    ctx.restore()
  }
}

function drawNetPopup(
  ctx: CanvasRenderingContext2D, result: TrackResult, tSec: number, w: number, h: number,
) {
  for (const nc of result.netCrossings) {
    if (nc.tSec > tSec + 0.001) continue
    const age = tSec - nc.tSec
    if (age > 1.6) continue
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

// ── 小物 ───────────────────────────────────────────────
function UploadBox({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="bg-court-card rounded-xl p-4">
      <input ref={inputRef} type="file" accept="video/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        className="hidden" />
      <button onClick={() => inputRef.current?.click()}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-4 rounded-xl active:scale-95">
        📁 ラリー動画を選ぶ
      </button>
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

function verdictLabel(v: BouncePoint['verdict']): string {
  return v === 'IN' ? 'IN ✓' : v === 'OUT' ? 'OUT ✕' : '判定不可'
}
function spinLabel(s: BouncePoint['spin']): string {
  switch (s) {
    case 'TOPSPIN': return 'トップスピン'
    case 'SLICE': return 'スライス'
    case 'FLAT': return 'フラット'
    default: return 'スピン不明'
  }
}

function summarize(result: TrackResult) {
  const known = result.bounces.filter(b => b.verdict !== 'UNKNOWN')
  const inCount = known.filter(b => b.verdict === 'IN').length
  return {
    points: result.track.length,
    bounces: result.bounces.length,
    inRate: known.length > 0 ? Math.round((inCount / known.length) * 100) : null,
  }
}
