import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  applyHomography, buildVideoToCourt, invertHomography,
} from '../lib/homography'
import { detectCourtFromVideo } from '../lib/courtDetector'
import type { Mat3, Point2D } from '../lib/homography'
import { TacticalBoard3D, CameraMode } from '../components/TacticalBoard3D'
import type { BallKey, DangerZoneKey, PlayerKey, Scenario, TargetGateKey } from '../tactics/types'

type Phase = 'UPLOAD' | 'CALIBRATE' | 'MARK' | 'PREVIEW'

interface MarkedSample {
  tSec: number
  videoX: number  // 0-1
  videoY: number  // 0-1
  courtX: number  // meters
  courtZ: number  // meters
  type: 'YOU' | 'OPP' | 'BALL'
}

/** 4 隅の通称。 */
const CORNER_LABELS = ['左下（自陣ベースライン左角）', '左上（敵陣ベースライン左角）', '右上（敵陣ベースライン右角）', '右下（自陣ベースライン右角）']

export function VideoToScenarioPage() {
  const nav = useNavigate()
  const [phase, setPhase] = useState<Phase>('UPLOAD')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [corners, setCorners] = useState<Point2D[]>([])
  const [courtType] = useState<'SINGLES' | 'DOUBLES'>('DOUBLES')
  const [H, setH] = useState<Mat3 | null>(null)
  const [Hinv, setHinv] = useState<Mat3 | null>(null)
  const [marks, setMarks] = useState<MarkedSample[]>([])
  const [markType, setMarkType] = useState<'YOU' | 'OPP' | 'BALL'>('YOU')
  const [previewScenario, setPreviewScenario] = useState<Scenario | null>(null)
  const [previewT, setPreviewT] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(true)
  const [previewCam] = useState<CameraMode>('DRONE')

  const onFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('動画ファイルを選んでください')
      return
    }
    const url = URL.createObjectURL(file)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(url)
    setCorners([])
    setH(null)
    setHinv(null)
    setMarks([])
    setPhase('CALIBRATE')
  }

  // ホモグラフィ計算
  useEffect(() => {
    if (corners.length === 4) {
      const Hm = buildVideoToCourt(corners, courtType)
      if (Hm) {
        setH(Hm)
        setHinv(invertHomography(Hm))
      }
    }
  }, [corners, courtType])

  // クリック→キャリブレーション or マーク
  const handleVideoClick = (e: React.MouseEvent) => {
    const el = overlayRef.current
    if (!el || !videoRef.current) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (phase === 'CALIBRATE') {
      if (corners.length < 4) {
        setCorners([...corners, [x, y]])
      } else {
        // やり直し
        setCorners([[x, y]])
      }
    } else if (phase === 'MARK' && H) {
      const t = videoRef.current.currentTime
      const [cx, cz] = applyHomography(H, x, y)
      setMarks([...marks, { tSec: t, videoX: x, videoY: y, courtX: cx, courtZ: cz, type: markType }])
    }
  }

  const proceedToMark = () => {
    if (corners.length === 4 && H) {
      setPhase('MARK')
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.pause()
      }
    }
  }

  const finalizePreview = () => {
    const sc = buildScenarioFromMarks(marks)
    setPreviewScenario(sc)
    setPhase('PREVIEW')
  }

  // プレビュー再生ループ
  useEffect(() => {
    if (phase !== 'PREVIEW' || !previewScenario || !previewPlaying) return
    let raf = 0
    let last: number | null = null
    const step = (now: number) => {
      if (last === null) last = now
      const dt = now - last
      last = now
      setPreviewT(t => {
        const nt = t + dt
        if (nt > (previewScenario.durationMs + 1200)) return 0
        return Math.min(previewScenario.durationMs, nt)
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [phase, previewScenario, previewPlaying])

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">動画→3D 戦術変換</h1>
          <p className="text-xs text-gray-400">実動画から実位置を逆算して 3D 再現</p>
        </div>
      </header>

      {phase === 'UPLOAD' && (
        <div className="space-y-3">
          <div className="bg-blue-950/60 rounded-xl p-3 text-xs leading-relaxed">
            🎬 試合や練習を撮影した動画を読み込ませると、コートの 4 隅をタップするだけで
            動画内の位置を実コート座標に逆算します（ホモグラフィ投影変換）。
            <br /><br />
            プレイヤーの動きやボール着弾点を時系列でマークすれば、3D 戦術ボードで再現できます。
          </div>
          <UploadBox onFile={onFile} />
        </div>
      )}

      {(phase === 'CALIBRATE' || phase === 'MARK') && videoUrl && (
        <>
          <div ref={overlayRef} className="relative bg-black rounded-xl overflow-hidden"
            onClick={handleVideoClick} style={{ cursor: 'crosshair' }}>
            <video
              ref={videoRef}
              src={videoUrl}
              controls={phase === 'MARK'}
              playsInline
              muted
              className="w-full aspect-video object-contain"
            />
            {/* オーバーレイ：四隅 + ライン */}
            <CornerOverlay corners={corners} marks={phase === 'MARK' ? marks : []} />
            {/* コート格子（H が出ていればプレビュー） */}
            {Hinv && phase === 'CALIBRATE' && corners.length === 4 && (
              <CourtGridPreview Hinv={Hinv} />
            )}
            {phase === 'CALIBRATE' && corners.length < 4 && (
              <div className="absolute top-2 left-2 right-2 bg-yellow-900/70 rounded px-2 py-1 text-xs text-court-warning">
                ⚠️ 「{CORNER_LABELS[corners.length]}」をタップしてください（{corners.length + 1}/4）
              </div>
            )}
            {phase === 'MARK' && (
              <div className="absolute top-2 left-2 right-2 bg-black/70 rounded px-2 py-1 text-xs text-white">
                動画を一時停止して位置をタップ → 自動的に時刻と座標が記録されます
              </div>
            )}
          </div>

          {phase === 'CALIBRATE' && (
            <div className="space-y-2">
              <div className="bg-court-card rounded-xl p-3 text-xs">
                <div className="text-court-warning font-bold mb-1">📐 コートの 4 隅（自動検出 → タップ修正可）</div>
                順番：①左下 → ②左上 → ③右上 → ④右下（自陣→敵陣の順）<br />
                やり直す場合はそのまま再度タップで初期化されます。
              </div>
              <button onClick={() => {
                const v = videoRef.current
                if (!v) return
                const det = detectCourtFromVideo(v)
                if (det && det.confidence >= 0.25) setCorners(det.corners)
                else alert('コートの自動検出に失敗しました。白線がよく見えるフレームで再試行するか、手動でタップしてください。')
              }}
                className="w-full bg-court-info text-white font-bold py-2 rounded-xl active:scale-95">
                🤖 コートを自動検出
              </button>
              {corners.length === 4 && H && (
                <button onClick={proceedToMark}
                  className="w-full bg-green-700 text-white font-bold py-3 rounded-xl active:scale-95">
                  ✅ キャリブレーション完了 → プレイヤー/ボールをマークする
                </button>
              )}
            </div>
          )}

          {phase === 'MARK' && (
            <>
              <div className="bg-court-card rounded-xl p-3 space-y-2">
                <div className="text-xs text-gray-400">マークの種別を選択：</div>
                <div className="grid grid-cols-3 gap-2">
                  <MarkTypeButton label="👤 自分" cur={markType} val="YOU" onClick={setMarkType} color="text-court-accent" />
                  <MarkTypeButton label="🎯 相手" cur={markType} val="OPP" onClick={setMarkType} color="text-court-danger" />
                  <MarkTypeButton label="🎾 ボール" cur={markType} val="BALL" onClick={setMarkType} color="text-court-warning" />
                </div>
                <div className="text-xs text-gray-300">
                  記録済み: 自分 {marks.filter(m => m.type === 'YOU').length} ・
                  相手 {marks.filter(m => m.type === 'OPP').length} ・
                  ボール {marks.filter(m => m.type === 'BALL').length}
                </div>
                {marks.length > 0 && (
                  <button onClick={() => setMarks(marks.slice(0, -1))}
                    className="text-xs text-court-danger">↶ 直前のマークを取り消し</button>
                )}
              </div>
              {marks.length >= 4 && (
                <button onClick={finalizePreview}
                  className="w-full bg-court-info text-white font-bold py-3 rounded-xl active:scale-95">
                  ▶ 3D で再生してみる
                </button>
              )}
            </>
          )}
        </>
      )}

      {phase === 'PREVIEW' && previewScenario && (
        <div className="space-y-3">
          <TacticalBoard3D
            scenario={previewScenario}
            tMs={previewT}
            cameraMode={previewCam}
          />
          <div className="flex gap-2">
            <button onClick={() => setPreviewPlaying(p => !p)}
              className="flex-1 bg-court-accent text-white font-bold py-2 rounded-lg text-sm">
              {previewPlaying ? '⏸ 一時停止' : '▶ 再生'}
            </button>
            <button onClick={() => setPreviewT(0)}
              className="px-3 py-2 bg-court-surface text-white rounded-lg">⏮</button>
            <button onClick={() => setPhase('MARK')}
              className="px-3 py-2 bg-court-surface text-white rounded-lg">マークに戻る</button>
          </div>
          <input type="range" min={0} max={previewScenario.durationMs}
            value={previewT}
            onChange={e => { setPreviewPlaying(false); setPreviewT(Number(e.target.value)) }}
            className="w-full" />
          <div className="bg-court-card rounded-xl p-3 text-xs space-y-1">
            <div className="text-court-accent font-bold">✅ 動画から実コート座標に変換完了</div>
            <div className="text-gray-300">
              {marks.length} 個のサンプルから {previewScenario.durationMs}ms のシナリオを生成しました。
              実距離・実時間ベースで 3D 再現されています。
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UploadBox({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="bg-court-card rounded-xl p-4">
      <input ref={inputRef} type="file" accept="video/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        className="hidden" />
      <button onClick={() => inputRef.current?.click()}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-4 rounded-xl active:scale-95">
        📁 動画ファイルを選ぶ
      </button>
      <div className="text-xs text-gray-400 mt-3 leading-relaxed">
        ヒント：コート全体が映る位置から撮影された動画がベスト。
        観客席や後方コートからの俯瞰映像、または横からのアングルが推奨。
      </div>
    </div>
  )
}

function CornerOverlay({ corners, marks }: { corners: Point2D[]; marks: MarkedSample[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 56" preserveAspectRatio="none">
        {/* 4 隅 */}
        {corners.map((c, i) => (
          <g key={i}>
            <circle cx={c[0] * 100} cy={c[1] * 56} r={1.5}
              fill="#F9A825" stroke="white" strokeWidth={0.3} />
            <text x={c[0] * 100} y={c[1] * 56 - 2.5}
              fill="white" fontSize={2.5} fontWeight="bold" textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
        {/* 線でつなぐ */}
        {corners.length === 4 && (
          <polygon points={corners.map(c => `${c[0] * 100},${c[1] * 56}`).join(' ')}
            fill="rgba(249,168,37,0.15)" stroke="#F9A825" strokeWidth={0.3} strokeDasharray="1.5,1" />
        )}
        {/* マーク */}
        {marks.map((m, i) => {
          const color = m.type === 'YOU' ? '#4CAF50' : m.type === 'OPP' ? '#EF5350' : '#FFEB3B'
          return (
            <circle key={i} cx={m.videoX * 100} cy={m.videoY * 56} r={1.2}
              fill={color} stroke="white" strokeWidth={0.2} opacity={0.85} />
          )
        })}
      </svg>
    </div>
  )
}

/** 計算したホモグラフィの逆行列を使って、コートのライン格子を動画上にオーバーレイ。 */
function CourtGridPreview({ Hinv }: { Hinv: Mat3 }) {
  // コート格子点
  const lines: Array<[number, number][]> = []
  // ベースライン × 2
  lines.push([[-5.485, -11.885], [5.485, -11.885]])
  lines.push([[-5.485, 11.885], [5.485, 11.885]])
  // ネット
  lines.push([[-5.485, 0], [5.485, 0]])
  // サイドライン × 2
  lines.push([[-5.485, -11.885], [-5.485, 11.885]])
  lines.push([[5.485, -11.885], [5.485, 11.885]])
  // サービスライン × 2
  lines.push([[-4.115, -6.4], [4.115, -6.4]])
  lines.push([[-4.115, 6.4], [4.115, 6.4]])
  // センターサービス
  lines.push([[0, -6.4], [0, 6.4]])

  const projected = lines.map(([a, b]) => {
    const pa = applyHomography(Hinv, a[0], a[1])
    const pb = applyHomography(Hinv, b[0], b[1])
    return { a: pa, b: pb }
  })

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1 1" preserveAspectRatio="none">
      {projected.map(({ a, b }, i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
          stroke="#00e676" strokeWidth={0.003} opacity={0.7} />
      ))}
    </svg>
  )
}

function MarkTypeButton({ label, cur, val, onClick, color }: {
  label: string; cur: string; val: any; onClick: (v: any) => void; color: string;
}) {
  return (
    <button onClick={() => onClick(val)}
      className={`py-2 rounded text-xs font-bold ${
        cur === val ? `bg-white/20 ${color}` : 'bg-court-surface text-gray-300'
      }`}>
      {label}
    </button>
  )
}

/** マーク列からシナリオを構築。 */
function buildScenarioFromMarks(marks: MarkedSample[]): Scenario {
  const youMarks = marks.filter(m => m.type === 'YOU').sort((a, b) => a.tSec - b.tSec)
  const oppMarks = marks.filter(m => m.type === 'OPP').sort((a, b) => a.tSec - b.tSec)
  const ballMarks = marks.filter(m => m.type === 'BALL').sort((a, b) => a.tSec - b.tSec)

  const allTimes = marks.map(m => m.tSec)
  const minT = Math.min(...allTimes, 0)
  const maxT = Math.max(...allTimes, 1)
  const durationMs = Math.max(2000, Math.round((maxT - minT) * 1000))

  const playerKeys = (ms: MarkedSample[]): PlayerKey[] =>
    ms.map(m => ({
      tMs: Math.round((m.tSec - minT) * 1000),
      pos: [m.courtX, m.courtZ] as [number, number],
    }))

  const ballKeys: BallKey[] = ballMarks.map(m => ({
    tMs: Math.round((m.tSec - minT) * 1000),
    pos: [m.courtX, 0.5 + Math.random() * 1.5, m.courtZ],
  }))

  // 最低 2 キーフレームを保証
  const padKeys = (ks: PlayerKey[], fallbackZ: number): PlayerKey[] => {
    if (ks.length === 0) {
      return [
        { tMs: 0, pos: [0, fallbackZ] },
        { tMs: durationMs, pos: [0, fallbackZ] },
      ]
    }
    if (ks.length === 1) {
      return [ks[0], { tMs: durationMs, pos: ks[0].pos }]
    }
    return ks
  }

  const dz: DangerZoneKey[] = []
  const tg: TargetGateKey[] = []

  return {
    id: 'video_imported',
    category: 'SINGLES_PATTERN',
    title: '動画から変換したシナリオ',
    subtitle: `${marks.length} 個のマークから ${(durationMs / 1000).toFixed(1)} 秒の再現`,
    goal: '撮影動画の実際の動きを 3D 空間で再構築。実距離・実速度を反映。',
    durationMs,
    ballPath: ballKeys.length > 0 ? ballKeys : [
      { tMs: 0, pos: [0, 0.5, -10] }, { tMs: durationMs, pos: [0, 0.5, 10] },
    ],
    players: [
      {
        id: 'you', label: 'あなた', side: 'NEAR', color: '#4CAF50', role: 'YOU',
        keyframes: padKeys(playerKeys(youMarks), -10),
      },
      {
        id: 'opp', label: '相手', side: 'FAR', color: '#EF5350', role: 'OPP1',
        keyframes: padKeys(playerKeys(oppMarks), 10),
      },
    ],
    dangerZones: dz,
    beats: [
      { tMs: 0, text: '動画から逆算した実コート上の動きを 3D 再生中です。' },
    ],
    targetGates: tg,
    visionConesOf: 'ALL',
  }
}
