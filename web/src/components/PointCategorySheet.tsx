import { useState } from 'react'
import type { PointCategory, StrokeType } from '../types/match'
import { CATEGORY_INFO, STROKE_LABEL } from '../types/match'

interface Props {
  winnerIsPlayer: boolean
  gameScore: string
  pointScore: string
  wasBreakPoint: boolean
  playerWasServing: boolean
  firstFaulted: boolean
  onRecordFirstFault: () => void
  onConfirm: (cat: PointCategory, stroke: StrokeType, rally: number) => void
  onCancel: () => void
}

export function PointCategorySheet(p: Props) {
  const [stroke, setStroke] = useState<StrokeType>('UNKNOWN')
  const [rally, setRally] = useState(1)

  const cats: PointCategory[] = p.winnerIsPlayer
    ? ['ACE', 'SERVICE_WINNER', 'WINNER', 'NET_WINNER', 'FORCED_ERROR', 'NORMAL']
    : ['ACE', 'DOUBLE_FAULT', 'WINNER', 'UNFORCED_ERROR', 'FORCED_ERROR', 'NORMAL']

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
      onClick={p.onCancel}
    >
      <div
        className="w-full max-w-md bg-court-surface rounded-t-2xl p-4 space-y-3 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-lg font-bold ${p.winnerIsPlayer ? 'text-court-accent' : 'text-court-danger'}`}>
              {p.winnerIsPlayer ? '✅ 自分のポイント' : '❌ 相手のポイント'}
            </div>
            <div className="text-xs text-gray-400">
              {p.gameScore}　{p.pointScore}
              {p.wasBreakPoint && '　🛡️ ブレークポイント'}
            </div>
          </div>
          <button onClick={p.onCancel} className="text-gray-400 text-sm px-2 py-1">
            キャンセル
          </button>
        </div>

        {p.playerWasServing && !p.firstFaulted ? (
          <button
            onClick={p.onRecordFirstFault}
            className="w-full border border-court-warning/50 text-court-warning rounded-lg py-2 text-sm"
          >
            ⊖ 先に 1st サーブをフォルトしていた場合はタップ
          </button>
        ) : p.firstFaulted ? (
          <div className="bg-court-warning/20 text-court-warning text-xs px-3 py-1.5 rounded">
            📝 1st フォルト記録済み（このポイントは 2nd サーブ）
          </div>
        ) : null}

        <div>
          <div className="text-xs text-gray-400 mb-2">ポイントの種類</div>
          <div className="grid grid-cols-2 gap-2">
            {cats.map(c => (
              <button
                key={c}
                onClick={() => p.onConfirm(c, stroke, rally)}
                className="flex items-center gap-2 bg-court-card hover:bg-emerald-900 rounded-lg p-3 text-left transition"
              >
                <span className="text-xl">{CATEGORY_INFO[c].emoji}</span>
                <span className="text-sm font-bold text-white">{CATEGORY_INFO[c].ja}</span>
              </button>
            ))}
          </div>
        </div>

        <hr className="border-white/10" />

        <div>
          <div className="text-xs text-gray-400 mb-1">ストローク種別（任意）</div>
          <div className="grid grid-cols-5 gap-1">
            {(['FOREHAND', 'BACKHAND', 'VOLLEY', 'SMASH', 'SERVE'] as StrokeType[]).map(st => (
              <button
                key={st}
                onClick={() => setStroke(st)}
                className={`text-xs py-2 rounded ${
                  stroke === st ? 'bg-court-info text-white font-bold' : 'bg-court-card text-gray-300'
                }`}
              >
                {STROKE_LABEL[st]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">ラリー数: {rally} 球</span>
          <div className="flex gap-2">
            <button onClick={() => setRally(r => Math.max(1, r - 1))} className="w-9 h-9 border border-white/20 rounded text-white">−</button>
            <button onClick={() => setRally(r => Math.min(50, r + 1))} className="w-9 h-9 border border-white/20 rounded text-white">+</button>
          </div>
        </div>
      </div>
    </div>
  )
}
