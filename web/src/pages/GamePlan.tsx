import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMyScouting, getScouting } from '../lib/db'
import { generateGamePlans } from '../scouting/planGenerator'
import { narrator } from '../scouting/audioNarrator'
import type { GamePlan, PlayerScouting } from '../scouting/types'
import { STYLE_EMOJI, STYLE_LABEL, WEAKNESS_LABEL } from '../scouting/types'
import { TacticalBoard3D, CameraMode } from '../components/TacticalBoard3D'
import { SCENARIOS } from '../tactics/scenarios'

export function GamePlanPage() {
  const { opponentId } = useParams<{ opponentId: string }>()
  const nav = useNavigate()
  const [me, setMe] = useState<PlayerScouting | null>(null)
  const [opp, setOpp] = useState<PlayerScouting | null>(null)
  const [plans, setPlans] = useState<GamePlan[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [speakProgress, setSpeakProgress] = useState(0)

  // 3D ビジュアル
  const [tMs, setTMs] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [camera, setCamera] = useState<CameraMode>('DRONE')

  useEffect(() => {
    if (!opponentId) return
    const load = async () => {
      const [mine, theirs] = await Promise.all([
        getMyScouting(),
        getScouting(opponentId),
      ])
      if (!mine) {
        nav('/scouting', { replace: true })
        return
      }
      setMe(mine)
      setOpp(theirs ?? null)
      if (theirs) {
        const ps = generateGamePlans(mine, theirs)
        setPlans(ps)
        if (ps[0]) setActivePlanId(ps[0].id)
      }
    }
    load()
  }, [opponentId, nav])

  // 音声状態購読
  useEffect(() => {
    return narrator.subscribe(s => {
      setSpeaking(s.speaking)
      setSpeakProgress(s.progress)
    })
  }, [])

  // 3D 再生ループ
  const activePlan = plans.find(p => p.id === activePlanId) ?? null
  const scenarioId = activePlan?.scenarioIds[0]
  const scenario = scenarioId
    ? SCENARIOS.find(s => s.id === scenarioId) ?? SCENARIOS[0]
    : SCENARIOS[0]

  useEffect(() => {
    if (!playing) return
    let last: number | null = null
    let raf = 0
    const step = (now: number) => {
      if (last === null) last = now
      const dt = now - last
      last = now
      setTMs(t => {
        const nt = t + dt
        if (nt > scenario.durationMs + 1200) return 0
        return Math.min(scenario.durationMs, nt)
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, scenario.durationMs])

  // プラン切替で頭出し
  useEffect(() => { setTMs(0) }, [activePlanId])

  // アンマウントで音声停止
  useEffect(() => () => { narrator.stop() }, [])

  if (!me || !opp) {
    return <div className="p-8 text-center text-gray-400">読み込み中...</div>
  }

  return (
    <div className="max-w-md mx-auto p-3 space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">必勝プラン</h1>
          <p className="text-xs text-gray-400">
            {STYLE_EMOJI[me.style]} {me.name} vs {STYLE_EMOJI[opp.style]} {opp.name}
          </p>
        </div>
      </header>

      {/* 相性サマリ */}
      <div className="bg-court-card rounded-xl p-3">
        <div className="flex items-center justify-around text-center">
          <div className="flex-1">
            <div className="text-3xl">{STYLE_EMOJI[me.style]}</div>
            <div className="text-xs text-court-accent font-bold mt-1">{me.name}</div>
            <div className="text-xs text-gray-400">{STYLE_LABEL[me.style]}</div>
          </div>
          <div className="text-court-warning text-xl font-black">VS</div>
          <div className="flex-1">
            <div className="text-3xl">{STYLE_EMOJI[opp.style]}</div>
            <div className="text-xs text-court-danger font-bold mt-1">{opp.name}</div>
            <div className="text-xs text-gray-400">{STYLE_LABEL[opp.style]}</div>
          </div>
        </div>
        {opp.weaknesses.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="text-xs text-court-warning font-bold mb-1">相手の主要弱点</div>
            <div className="flex flex-wrap gap-1">
              {opp.weaknesses.map((w, i) => (
                <span key={w} className="text-xs bg-red-900 text-white px-2 py-0.5 rounded">
                  {i + 1}. {WEAKNESS_LABEL[w]}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* プラン選択タブ */}
      {plans.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {plans.map(pl => (
            <button key={pl.id} onClick={() => setActivePlanId(pl.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold ${
                activePlanId === pl.id ? 'bg-court-accent text-white' : 'bg-court-card text-gray-300'
              }`}>
              {pl.name.replace(/^[^：]+：/, '').slice(0, 20)}
              <span className="ml-1 text-court-warning">
                {Math.round(pl.confidence * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}

      {activePlan && (
        <>
          {/* プラン概要 */}
          <div className="bg-gradient-to-br from-emerald-900 to-court-card rounded-xl p-4">
            <div className="text-court-warning font-bold mb-1">{activePlan.name}</div>
            <div className="text-sm text-white/90 leading-relaxed">{activePlan.summary}</div>
          </div>

          {/* 3D ビジュアル */}
          <div className="space-y-2">
            <div className="text-xs text-gray-400">📺 3D シミュレーション</div>
            <TacticalBoard3D
              scenario={scenario}
              tMs={tMs}
              cameraMode={camera}
            />
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setPlaying(p => !p)}
                className="bg-court-accent text-white font-bold py-1.5 rounded text-sm">
                {playing ? '⏸' : '▶'}
              </button>
              <button onClick={() => setCamera('DRONE')}
                className={`py-1.5 rounded text-xs font-bold ${
                  camera === 'DRONE' ? 'bg-court-info text-white' : 'bg-court-card text-gray-300'
                }`}>
                🛸 俯瞰
              </button>
              <button onClick={() => setCamera('POV')}
                className={`py-1.5 rounded text-xs font-bold ${
                  camera === 'POV' ? 'bg-court-info text-white' : 'bg-court-card text-gray-300'
                }`}>
                👁 一人称
              </button>
            </div>
          </div>

          {/* 配球ステップ */}
          <div>
            <div className="text-xs text-gray-400 mb-2">3 手先までの配球ルート</div>
            <div className="space-y-2">
              {activePlan.steps.map(s => (
                <div key={s.order} className="bg-court-card rounded-lg p-3 flex gap-3">
                  <div className="text-court-warning text-2xl font-black w-8">{s.order}</div>
                  <div className="flex-1">
                    <div className="text-sm text-white leading-relaxed">{s.instruction}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 音声プレビュー */}
          <div className="bg-blue-950/60 rounded-xl p-3 space-y-2">
            <div className="text-court-info font-bold text-sm">🎧 試合直前メンタル・プレビュー</div>
            <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
              {activePlan.narration}
            </div>
            {narrator.isSupported() ? (
              <>
                <div className="w-full h-1.5 bg-court-card rounded overflow-hidden">
                  <div className="bg-court-info h-full transition-all"
                    style={{ width: `${Math.round(speakProgress * 100)}%` }} />
                </div>
                <div className="flex gap-2">
                  {!speaking ? (
                    <button onClick={() => narrator.speak(activePlan.narration)}
                      className="flex-1 bg-court-info text-white font-bold py-2 rounded text-sm active:scale-95">
                      ▶ 音声で再生
                    </button>
                  ) : (
                    <button onClick={() => narrator.stop()}
                      className="flex-1 bg-red-700 text-white font-bold py-2 rounded text-sm active:scale-95">
                      ⏹ 停止
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-500">
                ※ お使いのブラウザでは音声合成が利用できません
              </div>
            )}
          </div>

          {/* 警告 */}
          {activePlan.caveats.length > 0 && (
            <div className="bg-yellow-950/60 rounded-xl p-3">
              <div className="text-court-warning font-bold text-xs mb-1">⚠️ 注意点</div>
              <ul className="text-xs text-white/90 space-y-0.5">
                {activePlan.caveats.map((c, i) => (
                  <li key={i}>・{c}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
