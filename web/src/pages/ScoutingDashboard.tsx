import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllScoutings, getMyScouting } from '../lib/db'
import type { PlayerScouting } from '../scouting/types'
import { STYLE_EMOJI, STYLE_LABEL } from '../scouting/types'

export function ScoutingDashboardPage() {
  const nav = useNavigate()
  const [me, setMe] = useState<PlayerScouting | null>(null)
  const [opponents, setOpponents] = useState<PlayerScouting[]>([])

  const reload = async () => {
    const all = await getAllScoutings()
    setMe(all.find(p => p.isMe) ?? null)
    setOpponents(all.filter(p => !p.isMe))
  }
  useEffect(() => { reload() }, [])

  return (
    <div className="max-w-md mx-auto p-3 space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">タクティクス・コア</h1>
          <p className="text-xs text-gray-400">自分と相手をスカウティングしてプランを生成</p>
        </div>
      </header>

      <div className="bg-blue-950/60 rounded-xl p-3 text-xs leading-relaxed">
        💡 自分のプロファイルと、対戦相手のスカウティングを入力すると、AI が相性ベースの必勝プランを自動生成します。
        相手プロファイルは試合のたびに編集・追加可能。
      </div>

      {/* 自分 */}
      <section>
        <h2 className="font-bold text-sm mb-2 flex items-center gap-2">
          <span className="text-court-accent">🎾 自分</span>
        </h2>
        {me ? (
          <PlayerCard p={me} onClick={() => nav(`/scouting/edit/${me.id}`)} accent="green" />
        ) : (
          <button onClick={() => nav('/scouting/new?me=1')}
            className="w-full bg-court-card rounded-xl p-4 text-left active:scale-[0.98] transition border border-dashed border-court-accent/50">
            <div className="font-bold text-court-accent">＋ 自分のプロファイルを作成</div>
            <div className="text-xs text-gray-400">あなたの能力値とスタイルを登録</div>
          </button>
        )}
      </section>

      {/* 相手一覧 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm">🔍 対戦相手</h2>
          <button onClick={() => nav('/scouting/new')}
            className="text-court-accent text-sm">＋ 追加</button>
        </div>
        {opponents.length === 0 ? (
          <div className="bg-court-card rounded-xl p-4 text-center text-sm text-gray-400">
            対戦相手はまだ登録されていません
          </div>
        ) : (
          <div className="space-y-2">
            {opponents.map(o => (
              <PlayerCard key={o.id} p={o}
                onClick={() => nav(`/scouting/edit/${o.id}`)} accent="red" />
            ))}
          </div>
        )}
      </section>

      {/* プラン生成への動線 */}
      {me && opponents.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-sm">🎯 必勝プランを生成</h2>
          <div className="text-xs text-gray-400 mb-2">対戦相手を選んでプランへ</div>
          <div className="space-y-1">
            {opponents.map(o => (
              <button key={o.id}
                onClick={() => nav(`/plan/${o.id}`)}
                className="w-full bg-gradient-to-r from-emerald-800 to-court-card rounded-lg p-3 text-left flex items-center gap-2 active:scale-[0.98] transition">
                <span className="text-xl">{STYLE_EMOJI[o.style]}</span>
                <div className="flex-1">
                  <div className="font-bold text-sm">vs {o.name}</div>
                  <div className="text-xs text-gray-400">プランを表示 →</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PlayerCard({ p, onClick, accent }: {
  p: PlayerScouting; onClick: () => void; accent: 'green' | 'red';
}) {
  const accentClass = accent === 'green'
    ? 'border-court-accent/40'
    : 'border-court-danger/40'
  return (
    <button onClick={onClick}
      className={`w-full bg-court-card rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition border ${accentClass} text-left`}>
      <span className="text-3xl">{STYLE_EMOJI[p.style]}</span>
      <div className="flex-1">
        <div className="font-bold text-sm">{p.name}</div>
        <div className="text-xs text-gray-400">
          {STYLE_LABEL[p.style]} ・ {p.hand === 'RIGHT' ? '右利き' : '左利き'} ・
          {p.backhandType === 'ONE_HANDED' ? '片手BH' : '両手BH'}
        </div>
        {p.weaknesses.length > 0 && (
          <div className="text-xs text-court-warning mt-1">
            弱点: {p.weaknesses.slice(0, 2).join(' / ')}
          </div>
        )}
      </div>
      <span className="text-gray-500">›</span>
    </button>
  )
}
