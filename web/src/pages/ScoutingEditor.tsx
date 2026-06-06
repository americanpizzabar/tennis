import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getScouting, saveScouting, deleteScouting } from '../lib/db'
import {
  RATING_FIELDS, STYLE_DESCRIPTION, STYLE_EMOJI, STYLE_LABEL,
  WEAKNESS_LABEL, newScouting,
} from '../scouting/types'
import type { BackhandType, DominantHand, PlayerScouting, ShotRatings, WeaknessZone } from '../scouting/types'
import { buildRadarStats, classifyStyle } from '../scouting/styleClassifier'

export function ScoutingEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [search] = useSearchParams()
  const isMeNew = search.get('me') === '1'
  const nav = useNavigate()

  const [p, setP] = useState<PlayerScouting | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  // 読み込み or 新規
  useEffect(() => {
    if (id) {
      getScouting(id).then(s => setP(s ?? newScoutingWithId(isMeNew)))
    } else {
      setP(newScoutingWithId(isMeNew))
    }
  }, [id, isMeNew])

  // スタイル自動判定（編集中も常時更新）
  const styleResult = useMemo(() => p ? classifyStyle(p) : null, [p])
  useEffect(() => {
    if (!p || !styleResult) return
    if (p.style !== styleResult.style) {
      setP({ ...p, style: styleResult.style })
    }
  }, [p, styleResult])

  if (!p) {
    return <div className="p-8 text-center text-gray-400">読み込み中...</div>
  }

  const setRating = (key: keyof ShotRatings, value: number) => {
    setP({ ...p, ratings: { ...p.ratings, [key]: value }, updatedAt: Date.now() })
  }

  const toggleWeakness = (w: WeaknessZone) => {
    const exists = p.weaknesses.includes(w)
    const next = exists
      ? p.weaknesses.filter(x => x !== w)
      : [...p.weaknesses, w].slice(0, 3)
    setP({ ...p, weaknesses: next, updatedAt: Date.now() })
  }

  const save = async () => {
    await saveScouting({ ...p, updatedAt: Date.now() })
    nav(-1)
  }

  // RATING_FIELDS をグループ毎にまとめる
  const groups = new Map<string, typeof RATING_FIELDS>()
  for (const f of RATING_FIELDS) {
    if (!groups.has(f.group)) groups.set(f.group, [])
    groups.get(f.group)!.push(f)
  }

  return (
    <div className="max-w-md mx-auto p-3 space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <h1 className="font-bold flex-1">
          {p.isMe ? '🎾 自分のプロファイル' : '🔍 対戦相手スカウティング'}
        </h1>
        {id && (
          <button onClick={() => setConfirmDel(true)} className="text-court-danger text-xl">🗑</button>
        )}
      </header>

      {/* 基本情報 */}
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <input
          type="text"
          value={p.name}
          onChange={e => setP({ ...p, name: e.target.value })}
          placeholder="名前"
          className="w-full bg-court-surface border border-gray-700 rounded px-3 py-2 text-white"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-gray-400 mb-1">利き手</div>
            <div className="flex gap-1">
              {(['RIGHT', 'LEFT'] as DominantHand[]).map(h => (
                <button key={h} onClick={() => setP({ ...p, hand: h })}
                  className={`flex-1 py-1.5 rounded text-sm ${
                    p.hand === h ? 'bg-court-info text-white font-bold' : 'bg-court-surface text-gray-300'
                  }`}>
                  {h === 'RIGHT' ? '右' : '左'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">バックハンド</div>
            <div className="flex gap-1">
              {(['ONE_HANDED', 'TWO_HANDED'] as BackhandType[]).map(b => (
                <button key={b} onClick={() => setP({ ...p, backhandType: b })}
                  className={`flex-1 py-1.5 rounded text-xs ${
                    p.backhandType === b ? 'bg-court-info text-white font-bold' : 'bg-court-surface text-gray-300'
                  }`}>
                  {b === 'ONE_HANDED' ? '片手' : '両手'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* スタイル判定結果 */}
      {styleResult && (
        <div className="bg-blue-950/60 rounded-xl p-3">
          <div className="text-xs text-court-info font-bold mb-1">🤖 スタイル自動判定</div>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{STYLE_EMOJI[styleResult.style]}</span>
            <div className="flex-1">
              <div className="font-bold text-base">{STYLE_LABEL[styleResult.style]}</div>
              <div className="text-xs text-gray-300">{STYLE_DESCRIPTION[styleResult.style]}</div>
            </div>
            <div className="text-court-warning text-sm font-bold">
              {Math.round(styleResult.score * 100)}%
            </div>
          </div>
        </div>
      )}

      {/* レーダーチャート（簡易） */}
      <RadarChart p={p} />

      {/* 弱点（最大 3 個） */}
      <div className="bg-court-card rounded-xl p-3">
        <div className="text-xs text-gray-400 mb-2">
          主要な弱点（最大 3 個）
        </div>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(WEAKNESS_LABEL) as WeaknessZone[]).map(w => {
            const sel = p.weaknesses.includes(w)
            const idx = p.weaknesses.indexOf(w)
            return (
              <button key={w} onClick={() => toggleWeakness(w)}
                className={`text-xs py-2 px-2 rounded text-left ${
                  sel ? 'bg-red-900 text-white font-bold' : 'bg-court-surface text-gray-300'
                }`}>
                {sel && <span className="text-court-warning mr-1">{idx + 1}.</span>}
                {WEAKNESS_LABEL[w]}
              </button>
            )
          })}
        </div>
      </div>

      {/* 星評価グループ */}
      {Array.from(groups.entries()).map(([group, fields]) => (
        <div key={group} className="bg-court-card rounded-xl p-3 space-y-3">
          <div className="text-court-warning font-bold text-sm">{group}</div>
          {fields.map(f => (
            <RatingRow
              key={f.key}
              label={f.label}
              value={p.ratings[f.key]}
              onChange={(v) => setRating(f.key, v)}
            />
          ))}
        </div>
      ))}

      {/* ノート */}
      <div className="bg-court-card rounded-xl p-3">
        <div className="text-xs text-gray-400 mb-1">ノート（自由記述）</div>
        <textarea
          value={p.notes}
          onChange={e => setP({ ...p, notes: e.target.value })}
          placeholder="例：プレッシャーで頭が真っ白になる／バック側に追い込むと感情的になる…"
          rows={3}
          className="w-full bg-court-surface border border-gray-700 rounded px-3 py-2 text-sm text-white resize-none"
        />
      </div>

      <button onClick={save}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl active:scale-95 transition">
        💾 保存
      </button>

      {confirmDel && p.id && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setConfirmDel(false)}>
          <div className="bg-court-surface rounded-xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">スカウティング記録を削除</h3>
            <p className="text-sm text-gray-300">「{p.name}」のスカウティングを削除しますか？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDel(false)} className="px-3 py-1.5 text-sm text-gray-300">
                キャンセル
              </button>
              <button onClick={async () => {
                await deleteScouting(p.id)
                nav('/scouting', { replace: true })
              }} className="px-3 py-1.5 text-sm bg-red-700 text-white rounded">削除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function newScoutingWithId(isMe: boolean): PlayerScouting {
  const p = newScouting(isMe)
  p.id = Math.random().toString(36).slice(2) + Date.now().toString(36)
  return p
}

function RatingRow({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-300 flex-1">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange(n)}
            className="text-xl leading-none"
            aria-label={`${n}`}
          >
            {n <= value ? '★' : '☆'}
          </button>
        ))}
      </div>
    </div>
  )
}

function RadarChart({ p }: { p: PlayerScouting }) {
  const stats = buildRadarStats(p)
  const size = 260
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 30
  const angleStep = (Math.PI * 2) / stats.length

  // 多角形
  const points = stats.map((s, i) => {
    const a = -Math.PI / 2 + i * angleStep
    const rr = r * (s.value / 100)
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]
  })
  const path = points.map((pt, i) => (i === 0 ? 'M' : 'L') + pt.join(',')).join(' ') + 'Z'

  // グリッド円
  const grids = [0.25, 0.5, 0.75, 1].map(k => k * r)

  return (
    <div className="bg-court-card rounded-xl p-3 flex flex-col items-center">
      <div className="text-xs text-gray-400 mb-2">能力レーダー</div>
      <svg width={size} height={size}>
        {grids.map((g, i) => (
          <circle key={i} cx={cx} cy={cy} r={g}
            fill="none" stroke="#2a3e2a" strokeWidth={1} />
        ))}
        {stats.map((s, i) => {
          const a = -Math.PI / 2 + i * angleStep
          return (
            <line key={i} x1={cx} y1={cy}
              x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r}
              stroke="#2a3e2a" strokeWidth={1} />
          )
        })}
        <path d={path}
          fill="rgba(76,175,80,0.3)"
          stroke="#4CAF50" strokeWidth={2} />
        {stats.map((s, i) => {
          const a = -Math.PI / 2 + i * angleStep
          const lx = cx + Math.cos(a) * (r + 16)
          const ly = cy + Math.sin(a) * (r + 16)
          return (
            <text key={i} x={lx} y={ly}
              fill="#ddd" fontSize={11} fontWeight="bold"
              textAnchor="middle" dominantBaseline="middle">
              {s.label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
