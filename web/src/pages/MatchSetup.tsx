import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMatchStore } from '../store/matchStore'
import type { DeuceRule, DominantHand, PartnerProfile, PlayerLevel } from '../types/match'
import { DEUCE_RULE_INFO, LEVEL_LABEL } from '../types/match'

export function MatchSetupPage() {
  const nav = useNavigate()
  const matchType = useMatchStore(s => s.matchType)
  const setup = useMatchStore(s => s.setup)

  const [oppName, setOppName] = useState('')
  const [oppLevel, setOppLevel] = useState<PlayerLevel>('INTERMEDIATE')
  const [oppHand, setOppHand] = useState<DominantHand>('RIGHT')
  const [partner, setPartner] = useState<PartnerProfile>({ name: '', level: 'INTERMEDIATE', hand: 'RIGHT' })
  const [opp2, setOpp2] = useState<PartnerProfile>({ name: '', level: 'INTERMEDIATE', hand: 'RIGHT' })
  const [deuceRule, setDeuceRule] = useState<DeuceRule>('STANDARD_AD')

  const start = () => {
    setup({
      opponentName: oppName.trim() || '相手選手',
      opponentLevel: oppLevel,
      opponentHand: oppHand,
      partner: { ...partner, name: partner.name.trim() || 'パートナー' },
      opponent2: { ...opp2, name: opp2.name.trim() || '相手選手 2' },
      deuceRule,
    })
    nav('/match')
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <h1 className="text-lg font-bold">試合前セットアップ</h1>
      </header>

      <PlayerSection
        label={matchType === 'DOUBLES' ? '相手選手 1' : '相手選手'}
        name={oppName} setName={setOppName}
        level={oppLevel} setLevel={setOppLevel}
        hand={oppHand} setHand={setOppHand}
        accent="bg-red-900/40 border-red-700/50 text-red-200"
      />

      {matchType === 'DOUBLES' && (
        <>
          <PlayerSection
            label="相手選手 2"
            name={opp2.name} setName={(v) => setOpp2(p => ({ ...p, name: v }))}
            level={opp2.level} setLevel={(v) => setOpp2(p => ({ ...p, level: v }))}
            hand={opp2.hand} setHand={(v) => setOpp2(p => ({ ...p, hand: v }))}
            accent="bg-red-900/40 border-red-700/50 text-red-200"
          />
          <PlayerSection
            label="パートナー（味方）"
            name={partner.name} setName={(v) => setPartner(p => ({ ...p, name: v }))}
            level={partner.level} setLevel={(v) => setPartner(p => ({ ...p, level: v }))}
            hand={partner.hand} setHand={(v) => setPartner(p => ({ ...p, hand: v }))}
            accent="bg-green-900/40 border-green-700/50 text-green-200"
          />
        </>
      )}

      <div className="bg-court-card rounded-xl p-3">
        <div className="text-xs text-gray-400 mb-2">デュースルール</div>
        <div className="space-y-1">
          {(Object.keys(DEUCE_RULE_INFO) as DeuceRule[]).map(r => (
            <button
              key={r}
              onClick={() => setDeuceRule(r)}
              className={`w-full text-left rounded-lg px-3 py-2 ${
                deuceRule === r ? 'bg-blue-900/60 border border-court-info' : 'bg-court-surface'
              }`}
            >
              <div className={`text-sm font-bold ${deuceRule === r ? 'text-white' : 'text-gray-300'}`}>
                {DEUCE_RULE_INFO[r].ja}
              </div>
              <div className="text-xs text-gray-400">{DEUCE_RULE_INFO[r].desc}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={start}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl active:scale-95 transition"
      >
        試合開始！
      </button>
    </div>
  )
}

function PlayerSection(p: {
  label: string; name: string; setName: (v: string) => void;
  level: PlayerLevel; setLevel: (v: PlayerLevel) => void;
  hand: DominantHand; setHand: (v: DominantHand) => void;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border-2 p-3 space-y-2 ${p.accent}`}>
      <div className="font-bold text-sm">{p.label}</div>
      <input
        type="text"
        value={p.name}
        onChange={(e) => p.setName(e.target.value)}
        placeholder="名前（任意）"
        className="w-full bg-court-surface border border-gray-700 rounded px-3 py-2 text-sm text-white"
      />
      <div className="text-xs text-gray-400">レベル</div>
      <div className="grid grid-cols-5 gap-1">
        {(Object.keys(LEVEL_LABEL) as PlayerLevel[]).map(lv => (
          <button
            key={lv}
            onClick={() => p.setLevel(lv)}
            className={`text-xs py-1.5 rounded ${
              p.level === lv ? 'bg-white/20 text-white font-bold' : 'bg-court-surface text-gray-300'
            }`}
          >
            {LEVEL_LABEL[lv]}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-400">利き手</div>
      <div className="grid grid-cols-2 gap-2">
        {(['RIGHT', 'LEFT'] as DominantHand[]).map(h => (
          <button
            key={h}
            onClick={() => p.setHand(h)}
            className={`py-2 rounded text-sm ${
              p.hand === h ? 'bg-white/20 text-white font-bold' : 'bg-court-surface text-gray-300'
            }`}
          >
            {h === 'RIGHT' ? '右利き' : '左利き'}
          </button>
        ))}
      </div>
    </div>
  )
}
