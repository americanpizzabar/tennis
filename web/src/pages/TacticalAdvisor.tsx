import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CATEGORY_NAME, SITUATIONS, TACTIC_CATEGORY_NAME,
  recommendTactics,
} from '../data/tactics'
import type { SituationCategory } from '../data/tactics'

export function TacticalAdvisorPage() {
  const nav = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const recommended = useMemo(
    () => recommendTactics(Array.from(selected), 6),
    [selected],
  )

  const cats: SituationCategory[] = ['SCORE', 'ROLE', 'OPPONENT', 'SELF', 'ENV', 'MODE', 'PHASE']

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">戦術アドバイザー</h1>
          <p className="text-xs text-gray-400">状況タグを選ぶとプロの戦術を提案</p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            className="text-court-danger text-xs"
          >リセット</button>
        )}
      </header>

      {selected.size === 0 ? (
        <div className="bg-court-card rounded-xl p-3 text-xs text-gray-300">
          ℹ️ 下から状況タグを選ぶと、プロが実際に使う戦術がスコア順で表示されます。
        </div>
      ) : (
        <div className="bg-blue-900/40 rounded-xl p-3 text-xs">
          <span className="text-court-info font-bold">選択中: {selected.size}項目</span>
        </div>
      )}

      {recommended.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-court-warning font-bold">🎯 上位の戦術（{recommended.length}件）</h2>
          {recommended.map(({ tactic, score, matchedTriggers }) => (
            <div
              key={tactic.id}
              className="bg-court-card rounded-xl p-3 border border-court-accent/30"
              onClick={() => setExpanded(expanded === tactic.id ? null : tactic.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{tactic.emoji}</span>
                <div className="flex-1">
                  <div className="font-bold text-sm">{tactic.title}</div>
                  <div className="text-xs text-gray-400">{tactic.shortDesc}</div>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-gray-800 text-court-warning text-xs rounded">
                    {TACTIC_CATEGORY_NAME[tactic.category]}
                  </span>
                </div>
                <div className="px-2 py-1 bg-blue-900 text-white text-xs font-bold rounded">
                  {Math.round(score * 100)}%
                </div>
              </div>
              {expanded === tactic.id && (
                <div className="mt-3 space-y-2 text-xs">
                  <Detail label="🎓 プロの参考" accent="text-court-warning" body={tactic.proReference} />
                  <Detail label="📋 実行ステップ" accent="text-court-accent"
                    body={tactic.executionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')} />
                  <Detail label="✅ 使うべき場面" accent="text-court-info" body={tactic.whenToUse} />
                  <Detail label="⚠️ 避けるべき場面" accent="text-court-danger" body={tactic.whenNotToUse} />
                  {matchedTriggers.length > 0 && (
                    <div className="text-court-accent">
                      マッチ: {matchedTriggers.map(t =>
                        SITUATIONS.find(s => s.id === t)?.ja ?? t).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <hr className="border-white/10" />

      <div className="text-white font-bold text-sm">現在の状況を選んでください（複数可）</div>

      {cats.map(cat => (
        <div key={cat} className="bg-court-surface rounded-xl p-3">
          <div className="text-gray-400 text-xs font-bold mb-2">{CATEGORY_NAME[cat]}</div>
          <div className="flex flex-wrap gap-2">
            {SITUATIONS.filter(s => s.category === cat).map(s => (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1 border transition ${
                  selected.has(s.id)
                    ? 'bg-green-700 border-court-accent text-white font-bold'
                    : 'bg-court-card border-transparent text-gray-300'
                }`}
              >
                <span>{s.emoji}</span>
                <span>{s.ja}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Detail({ label, accent, body }: { label: string; accent: string; body: string }) {
  return (
    <div>
      <div className={`${accent} font-bold mb-1`}>{label}</div>
      <div className="text-white/90 whitespace-pre-line leading-relaxed">{body}</div>
    </div>
  )
}
