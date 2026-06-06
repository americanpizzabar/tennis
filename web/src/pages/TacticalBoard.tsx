import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TacticalBoard3D, CameraMode } from '../components/TacticalBoard3D'
import {
  SCENARIOS, scenariosByCategory, mirrorScenarioForLefty,
} from '../tactics/scenarios'
import { CATEGORY_LABEL } from '../tactics/types'
import type { Scenario, ScenarioCategory } from '../tactics/types'
import { currentBeats } from '../tactics/interpolate'

export function TacticalBoardPage() {
  const nav = useNavigate()
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].id)
  const [tMs, setTMs] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [camera, setCamera] = useState<CameraMode>('DRONE')
  const [povRole, setPovRole] = useState<'YOU' | 'PARTNER' | 'OPP1' | 'OPP2'>('YOU')
  const [oppLefty, setOppLefty] = useState(false)
  const [showLegend, setShowLegend] = useState(true)

  const rawScenario = useMemo(
    () => SCENARIOS.find(s => s.id === scenarioId) ?? SCENARIOS[0],
    [scenarioId]
  )
  const scenario = useMemo(
    () => (oppLefty && rawScenario.rightHandedAssumption ? mirrorScenarioForLefty(rawScenario) : rawScenario),
    [rawScenario, oppLefty]
  )

  // 再生ループ
  const rafRef = useRef<number | null>(null)
  const lastFrameMs = useRef<number | null>(null)
  useEffect(() => {
    if (!playing) {
      lastFrameMs.current = null
      return
    }
    const step = (now: number) => {
      if (lastFrameMs.current === null) lastFrameMs.current = now
      const dt = now - lastFrameMs.current
      lastFrameMs.current = now
      setTMs(t => {
        const nt = t + dt * speed
        if (nt >= scenario.durationMs) {
          // 1 秒 hold して頭に戻る
          if (nt > scenario.durationMs + 1500) return 0
          return scenario.durationMs
        }
        return nt
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [playing, speed, scenario.durationMs])

  // シナリオ変更で頭出し
  useEffect(() => {
    setTMs(0)
    setPlaying(true)
  }, [scenarioId])

  const categorized = useMemo(() => scenariosByCategory(), [])
  const beat = currentBeats(scenario.beats, tMs)

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-32">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">3D 戦術ボード</h1>
          <p className="text-xs text-gray-400">ドローン視点とプレイヤー視点で戦術を立体的に学ぶ</p>
        </div>
      </header>

      <TacticalBoard3D
        scenario={scenario}
        tMs={tMs}
        cameraMode={camera}
        povRole={povRole}
        pressureLevel={computePressure(scenario, tMs)}
        onPlayerTap={(role) => {
          setPovRole(role)
          setCamera('POV')
        }}
        onPinchOut={() => setCamera('DRONE')}
      />

      {/* タイトル */}
      <div>
        <div className="font-bold text-base">{scenario.title}</div>
        <div className="text-xs text-gray-400">{scenario.subtitle}</div>
      </div>

      {/* ナレーション */}
      {beat && (
        <div
          className={`rounded-xl p-3 transition-colors ${
            beat.emphasized ? 'bg-yellow-900/40 border border-court-warning' : 'bg-court-card'
          }`}
        >
          <div className="text-court-warning text-xs font-bold mb-1">💡 解説</div>
          <div className="text-sm leading-relaxed">{beat.text}</div>
        </div>
      )}

      {/* シーク＋再生 */}
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <input
          type="range"
          min={0}
          max={scenario.durationMs}
          value={Math.min(tMs, scenario.durationMs)}
          onChange={e => { setPlaying(false); setTMs(Number(e.target.value)) }}
          className="w-full"
        />
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{(Math.min(tMs, scenario.durationMs) / 1000).toFixed(1)}秒</span>
          <span>/ {(scenario.durationMs / 1000).toFixed(1)}秒</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying(p => !p)}
            className="flex-1 bg-court-accent text-white font-bold py-2 rounded-lg active:scale-95 transition"
          >
            {playing ? '⏸ 一時停止' : '▶ 再生'}
          </button>
          <button
            onClick={() => { setTMs(0); setPlaying(true) }}
            className="px-3 py-2 bg-court-surface text-white rounded-lg"
          >
            ⏮
          </button>
        </div>
        {/* 速度 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">速度</span>
          {[0.25, 0.5, 1, 2].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className={`flex-1 text-xs py-1 rounded ${
                speed === s ? 'bg-court-info text-white font-bold' : 'bg-court-surface text-gray-300'
              }`}>
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* カメラ切替 */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setCamera('DRONE')}
          className={`rounded-xl py-2 text-sm font-bold ${
            camera === 'DRONE' ? 'bg-court-accent text-white' : 'bg-court-card text-gray-300'
          }`}>
          🛸 ドローン視点
        </button>
        <button onClick={() => setCamera('POV')}
          className={`rounded-xl py-2 text-sm font-bold ${
            camera === 'POV' ? 'bg-court-accent text-white' : 'bg-court-card text-gray-300'
          }`}>
          👁 プレイヤー視点
        </button>
      </div>

      {/* POV ロール切替（POV モード時のみ） */}
      {camera === 'POV' && (
        <div className="bg-court-card rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-2">誰の視線でコートを見る？</div>
          <div className="grid grid-cols-2 gap-2">
            {scenario.players.map(pl => (
              <button key={pl.role}
                onClick={() => setPovRole(pl.role as any)}
                className={`rounded-lg py-2 px-2 text-xs ${
                  povRole === pl.role ? 'bg-court-info text-white font-bold' : 'bg-court-surface text-gray-300'
                }`}>
                {pl.role === 'YOU' && '👤 '}
                {pl.role === 'PARTNER' && '🧑‍🤝‍🧑 '}
                {(pl.role === 'OPP1' || pl.role === 'OPP2') && '🎯 '}
                {pl.label.slice(0, 12)}
              </button>
            ))}
          </div>
          {scenario.pressureRange && (
            <div className="text-xs text-court-warning mt-2">
              ⚡ プレッシャー演出：シーンの一部でトンネル視野・FOV 圧縮を適用
            </div>
          )}
        </div>
      )}

      {/* オプション */}
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <label className="flex items-center justify-between text-sm">
          <span className="text-white">対戦相手は左利き</span>
          <input type="checkbox" checked={oppLefty} onChange={e => setOppLefty(e.target.checked)} />
        </label>
        <button
          onClick={() => setShowLegend(v => !v)}
          className="text-xs text-court-info"
        >
          {showLegend ? '凡例を隠す ▲' : '凡例を表示 ▼'}
        </button>
        {showLegend && (
          <div className="text-xs text-gray-300 space-y-1 pt-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
              <span>あなた（黄色いリング付き）</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
              <span>パートナー（ダブルス時）</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
              <span>相手選手</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-red-400 border border-red-200"></span>
              <span>デンジャーゾーン（ボールが飛来しやすいエリア）</span>
            </div>
          </div>
        )}
      </div>

      {/* シナリオ選択 */}
      <div className="space-y-3">
        <h2 className="font-bold text-sm">シナリオを選ぶ</h2>
        {Array.from(categorized.entries()).map(([cat, list]) => (
          <ScenarioCategorySection
            key={cat}
            category={cat}
            scenarios={list}
            selected={scenarioId}
            onSelect={setScenarioId}
          />
        ))}
      </div>

      {/* 目標 */}
      <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/90 leading-relaxed">
        🎯 <strong>学習目標</strong>：{scenario.goal}
        {scenario.proReference && (
          <div className="mt-1 text-court-info">📚 {scenario.proReference}</div>
        )}
      </div>
    </div>
  )
}

function computePressure(scenario: Scenario, tMs: number): number {
  const r = scenario.pressureRange
  if (!r) return 0
  if (tMs < r.startMs || tMs > r.endMs) return 0
  const span = r.endMs - r.startMs
  const inside = (tMs - r.startMs) / Math.max(1, span)
  // ピークを中央に
  return 1 - Math.abs(inside - 0.5) * 2
}

function ScenarioCategorySection({ category, scenarios, selected, onSelect }: {
  category: ScenarioCategory; scenarios: Scenario[];
  selected: string; onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-court-surface rounded-xl p-3">
      <div className="text-xs text-gray-400 mb-2">{CATEGORY_LABEL[category]}</div>
      <div className="space-y-1">
        {scenarios.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left rounded-lg p-2 ${
              selected === s.id ? 'bg-court-accent text-white' : 'bg-court-card text-gray-200'
            }`}
          >
            <div className="text-sm font-bold">{s.title}</div>
            <div className={`text-xs ${selected === s.id ? 'text-white/80' : 'text-gray-400'}`}>
              {s.subtitle}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
