import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAllLessonReports, getLessonReport, deleteLessonReport } from '../lib/db'
import { SHOT_EMOJI, SHOT_LABEL } from '../data/idealForms'
import type { LessonReport, SavedFrame } from '../types/lesson'
import { LM, SKELETON_EDGES } from '../lib/poseDetector'

export function LessonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [report, setReport] = useState<LessonReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparable, setComparable] = useState<LessonReport[]>([])
  const [compareWith, setCompareWith] = useState<LessonReport | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const r = await getLessonReport(id)
      setReport(r ?? null)
      setLoading(false)
      if (r) {
        const all = await getAllLessonReports()
        setComparable(all.filter(x => x.shot === r.shot && x.lessonId !== r.lessonId))
      }
    }
    load()
  }, [id])

  if (loading) return <div className="p-8 text-center text-gray-400">読み込み中...</div>
  if (!report) {
    return (
      <div className="p-8 text-center">
        <div className="text-gray-400 mb-4">レッスン記録が見つかりません</div>
        <button onClick={() => nav('/lessons')} className="text-court-accent">レッスン一覧へ</button>
      </div>
    )
  }

  const scoreColor =
    report.overallScore >= 80 ? 'text-court-accent'
    : report.overallScore >= 60 ? 'text-court-warning'
    : 'text-court-danger'

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <h1 className="text-lg font-bold flex-1">診断結果</h1>
        <button onClick={() => setConfirmDel(true)} className="text-court-danger text-xl">🗑</button>
      </header>

      {/* スコア */}
      <div className="bg-court-card rounded-xl p-4 flex items-center gap-3">
        <div className="text-5xl">{SHOT_EMOJI[report.shot]}</div>
        <div className="flex-1">
          <div className="font-bold text-lg">{SHOT_LABEL[report.shot]}</div>
          <div className="text-xs text-gray-400">
            {report.swingCount} スイング ・ {report.durationSeconds}秒 ・
            {' '}{new Date(report.createdAt).toLocaleString('ja-JP')}
          </div>
        </div>
        <div className="text-center">
          <div className={`${scoreColor} text-4xl font-black leading-none`}>
            {report.overallScore}
          </div>
          <div className="text-xs text-gray-400">/ 100</div>
        </div>
      </div>

      {/* AI 3行まとめ */}
      <div className="bg-blue-950/60 rounded-xl p-3">
        <div className="text-court-warning text-xs font-bold mb-2">🤖 AI コーチング</div>
        {report.coachingText.split('\n').filter(l => l.trim()).map((l, i) => (
          <div key={i} className="text-sm text-white/90 leading-relaxed">{l.trim()}</div>
        ))}
      </div>

      {/* スロー再生 */}
      <TrajectorySlowMo frames={report.frames} side={report.side}
        compareFrames={compareWith?.frames ?? []} />

      {/* 打点ばらつき散布図 */}
      {report.impactPoints.length > 0 && (
        <ImpactScatter points={report.impactPoints} />
      )}

      {/* 過去比較 */}
      {comparable.length > 0 && (
        <div className="bg-court-card rounded-xl p-3">
          <div className="text-court-info font-bold text-sm mb-2">🔄 過去の自分と比較</div>
          <div className="text-xs text-gray-400 mb-2">同じショットの過去レッスンを選ぶと各項目の差分を表示</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <ComparisonChip label="比較なし" selected={!compareWith}
              onClick={() => setCompareWith(null)} />
            {comparable.map(c => {
              const date = new Date(c.createdAt)
              const label = `${date.getMonth() + 1}/${date.getDate()} (${c.overallScore})`
              return (
                <ComparisonChip key={c.lessonId} label={label}
                  selected={compareWith?.lessonId === c.lessonId}
                  onClick={() => setCompareWith(c)} />
              )
            })}
          </div>
        </div>
      )}

      {/* チェックポイント */}
      <div>
        <h2 className="font-bold text-sm mb-2">🎯 重要チェックポイント</h2>
        <div className="space-y-2">
          {report.checkpoints.map((cp) => {
            const compCp = compareWith?.checkpoints.find(c => c.id === cp.id)
            return (
              <CheckpointCard key={cp.id} cp={cp} compareScore={compCp?.score} />
            )
          })}
        </div>
      </div>

      {/* ドリル */}
      <div>
        <h2 className="font-bold text-sm mb-2">📋 明日のためのドリル</h2>
        <div className="space-y-2">
          {report.drills.map((d, i) => (
            <div key={i} className="bg-court-card rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-green-700 text-white text-xs px-2 py-0.5 rounded font-bold">
                  優先{d.priority}
                </span>
                <span className="font-bold text-sm">{d.title}</span>
              </div>
              <p className="text-xs text-white/90 leading-relaxed">{d.description}</p>
              <p className="text-xs text-gray-400 mt-1">理由：{d.reason}</p>
              <p className="text-xs text-court-accent mt-1 font-bold">
                🎾 {d.reps}球 ・ 約{d.minutes}分
              </p>
            </div>
          ))}
        </div>
      </div>

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setConfirmDel(false)}>
          <div className="bg-court-surface rounded-xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">レッスン記録を削除</h3>
            <p className="text-sm text-gray-300">この診断結果を削除しますか？元に戻せません。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDel(false)} className="px-3 py-1.5 text-sm text-gray-300">
                キャンセル
              </button>
              <button onClick={async () => {
                await deleteLessonReport(report.lessonId)
                nav('/lessons', { replace: true })
              }} className="px-3 py-1.5 text-sm bg-red-700 text-white rounded">
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ComparisonChip({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${
        selected ? 'bg-blue-700 text-white' : 'bg-court-surface text-gray-300'
      }`}>
      {label}
    </button>
  )
}

function CheckpointCard({ cp, compareScore }: {
  cp: LessonReport['checkpoints'][number]; compareScore?: number;
}) {
  const [open, setOpen] = useState(false)
  const color = cp.score >= 80 ? 'text-court-accent' : cp.score >= 60 ? 'text-court-warning' : 'text-court-danger'
  const diff = compareScore !== undefined ? cp.score - compareScore : undefined
  return (
    <div className="bg-court-card rounded-xl p-3" onClick={() => setOpen(!open)}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="font-bold text-sm">{cp.nameJa}</div>
          <div className="text-xs text-gray-400">{cp.phase}</div>
        </div>
        {diff !== undefined && (
          <div className={`text-sm font-bold ${diff >= 0 ? 'text-court-accent' : 'text-court-danger'}`}>
            {diff >= 0 ? '+' : ''}{diff}
          </div>
        )}
        <div className={`${color} text-2xl font-black`}>{cp.score}</div>
      </div>
      {/* バー */}
      <div className="mt-2 h-1.5 bg-court-bg rounded overflow-hidden">
        <div className={`h-full rounded ${color.replace('text-', 'bg-')}`}
          style={{ width: `${cp.score}%` }} />
      </div>
      {open && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-gray-400">計測: {cp.measuredText}　理想: {cp.idealText}</div>
          <div className="text-xs text-white/90 leading-relaxed">{cp.adviceJa}</div>
        </div>
      )}
    </div>
  )
}

function ImpactScatter({ points }: { points: LessonReport['impactPoints'] }) {
  return (
    <div className="bg-court-card rounded-xl p-3">
      <div className="text-court-warning font-bold text-sm mb-2">🎯 打点のばらつき</div>
      <div className="relative bg-emerald-900 rounded-lg aspect-square overflow-hidden">
        {/* 中心十字 */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/40" />
        {points.map((p, i) => (
          <div key={i}
            className="absolute rounded-full bg-court-accent border border-white"
            style={{
              left: `calc(${50 + p.relX * 100}% - 5px)`,
              top: `calc(${50 + p.relY * 100}% - 5px)`,
              width: 10, height: 10, opacity: 0.85,
            }}
          />
        ))}
      </div>
      <div className="text-xs text-gray-400 mt-2">
        {points.length} スイングの打点を体中心相対で表示。
        密集していれば一貫性が高い。
      </div>
    </div>
  )
}

function TrajectorySlowMo({ frames, side, compareFrames }: {
  frames: SavedFrame[];
  side: 'RIGHT' | 'LEFT';
  compareFrames: SavedFrame[];
}) {
  const [playing, setPlaying] = useState(false)
  const [frameIdx, setFrameIdx] = useState(0)
  const [speed, setSpeed] = useState(1)
  const maxIdx = Math.max(0, frames.length - 1)

  useEffect(() => {
    if (!playing) return
    const interval = 60 / speed
    const tid = window.setInterval(() => {
      setFrameIdx(i => (i + 1) % Math.max(1, frames.length))
    }, interval)
    return () => clearInterval(tid)
  }, [playing, speed, frames.length])

  const wristKey = side === 'RIGHT' ? LM.RIGHT_WRIST : LM.LEFT_WRIST

  return (
    <div className="bg-court-card rounded-xl p-3">
      <div className="text-court-warning font-bold text-sm mb-2">
        🎬 骨格スロー再生 ＋ 軌道
      </div>
      <div className="relative bg-court-bg rounded-lg aspect-video overflow-hidden">
        <svg viewBox="0 0 100 56" className="w-full h-full" preserveAspectRatio="none">
          {/* 軌道（手首） */}
          {drawTrajectory(frames, wristKey, frameIdx, '#4CAF50')}
          {compareFrames.length > 0 && drawTrajectory(compareFrames, wristKey,
            Math.min(frameIdx, compareFrames.length - 1), '#42A5F5')}
          {/* 現在の骨格 */}
          {frames[frameIdx] && drawSkeletonSVG(frames[frameIdx], '#4CAF50', 1)}
          {compareFrames.length > 0 && compareFrames[Math.min(frameIdx, compareFrames.length - 1)] &&
            drawSkeletonSVG(compareFrames[Math.min(frameIdx, compareFrames.length - 1)], '#42A5F5', 0.5)}
        </svg>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => setPlaying(!playing)}
          className="text-court-accent text-xl px-2">{playing ? '⏸' : '▶'}</button>
        <input type="range" min={0} max={maxIdx} value={frameIdx}
          onChange={e => { setFrameIdx(Number(e.target.value)); setPlaying(false) }}
          className="flex-1" />
        <span className="text-xs text-gray-400 w-12 text-right">
          {frameIdx + 1}/{frames.length}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-400">速度</span>
        {[1, 0.5, 0.25].map(s => (
          <button key={s} onClick={() => setSpeed(s)}
            className={`text-xs px-2 py-0.5 rounded ${
              speed === s ? 'bg-court-accent text-white font-bold' : 'bg-court-bg text-gray-300'
            }`}>
            {s}x
          </button>
        ))}
        {compareFrames.length > 0 && (
          <span className="text-xs text-court-info ml-auto">青：過去比較</span>
        )}
      </div>
      {frames.length === 0 && (
        <div className="text-xs text-gray-500 mt-2">フレームデータがありません</div>
      )}
    </div>
  )
}

function drawTrajectory(frames: SavedFrame[], wristKey: number, upto: number, color: string) {
  const pts: string[] = []
  for (let i = 0; i <= Math.min(upto, frames.length - 1); i++) {
    const p = frames[i]?.lm[wristKey]
    if (!p) continue
    pts.push(`${p[0] * 100},${p[1] * 56}`)
  }
  if (pts.length < 2) return null
  return (
    <polyline points={pts.join(' ')} fill="none" stroke={color}
      strokeWidth={0.5} opacity={0.9} />
  )
}

function drawSkeletonSVG(frame: SavedFrame, color: string, alpha: number) {
  return (
    <g opacity={alpha}>
      {SKELETON_EDGES.map(([a, b], i) => {
        const pa = frame.lm[a]; const pb = frame.lm[b]
        if (!pa || !pb) return null
        return (
          <line key={i}
            x1={pa[0] * 100} y1={pa[1] * 56}
            x2={pb[0] * 100} y2={pb[1] * 56}
            stroke={color} strokeWidth={0.4}
          />
        )
      })}
      {Object.entries(frame.lm).map(([k, p]) => (
        <circle key={k} cx={p[0] * 100} cy={p[1] * 56} r={0.6}
          fill={color} />
      ))}
    </g>
  )
}
