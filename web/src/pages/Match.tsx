import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMatchStore } from '../store/matchStore'
import { ScoreBoard } from '../components/ScoreBoard'
import { CourtMap } from '../components/CourtMap'
import { PointCategorySheet } from '../components/PointCategorySheet'

export function MatchPage() {
  const nav = useNavigate()
  const state = useMatchStore()
  const [elapsedSec, setElapsedSec] = useState(0)
  const [showHints, setShowHints] = useState(true)
  const [confirmEnd, setConfirmEnd] = useState(false)

  // タイマー
  useEffect(() => {
    if (!state.matchId) return
    const tid = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - state.startedAtMs) / 1000))
    }, 1000)
    return () => clearInterval(tid)
  }, [state.matchId, state.startedAtMs])

  // チェンジオーバーカウントダウン
  useEffect(() => {
    if (!state.isChangeover) return
    const tid = window.setInterval(() => {
      useMatchStore.getState().tickChangeover()
    }, 1000)
    return () => clearInterval(tid)
  }, [state.isChangeover])

  // 試合未開始ならホームへ
  useEffect(() => {
    if (!state.matchId) nav('/', { replace: true })
  }, [state.matchId, nav])

  if (!state.matchId) return null

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      {/* 上部バー */}
      <div className="flex items-center gap-2 sticky top-0 z-10 bg-court-bg/95 backdrop-blur py-2">
        <button onClick={() => setConfirmEnd(true)} className="text-court-danger text-xl">■</button>
        <div className="flex-1">
          <div className="text-sm font-bold">
            {state.matchType === 'SINGLES' ? 'シングルス' : 'ダブルス'} 試合中
          </div>
          <div className="text-xs text-gray-400">
            vs {state.opponentName}
            {state.matchType === 'DOUBLES' && ` ／ 味方: ${state.partner.name}`}
          </div>
        </div>
        <div className="text-xs text-court-accent font-mono">{formatTime(elapsedSec)}</div>
        <button
          onClick={() => state.undoLast()}
          disabled={!state.undo}
          className={`px-2 py-1 rounded text-sm ${
            state.undo ? 'bg-yellow-900 text-court-warning' : 'bg-gray-800 text-gray-600'
          }`}
          title="直前ポイントを取り消し"
        >
          ↶ アンドゥ
        </button>
        <button
          onClick={() => state.setDetailedMode(!state.detailedStatsMode)}
          className={`px-2 py-1 rounded text-sm ${
            state.detailedStatsMode ? 'bg-yellow-900 text-court-warning' : 'bg-gray-800 text-gray-400'
          }`}
          title="詳細スタッツ記録モード"
        >
          📊
        </button>
      </div>

      {/* 初回ヒント */}
      {showHints && (
        <div className="bg-blue-950/60 border border-court-info/30 rounded-xl p-3 text-xs">
          <div className="flex items-start gap-2">
            <span className="text-court-info">💡</span>
            <div className="flex-1 text-white/90 leading-relaxed">
              ・「+1ポイント」で加点／「↶」で取り消し<br />
              ・着弾点はコート図を「タップ」して手動入力<br />
              ・「📊」で詳細スタッツ記録モード切替
            </div>
            <button onClick={() => setShowHints(false)} className="text-gray-400 px-1">✕</button>
          </div>
        </div>
      )}

      {/* チェンジオーバー */}
      {state.isChangeover ? (
        <ChangeoverPanel
          seconds={state.changeoverSecondsLeft}
          onSkip={() => state.skipChangeover()}
        />
      ) : (
        <ScoreBoard
          player={state.player}
          opponent={state.opponent}
          phase={state.phase}
          servingPlayer={state.servingPlayer}
          playerName="あなた"
          opponentName={state.opponentName}
          onPlayerScore={() => state.scorePoint(true)}
          onOpponentScore={() => state.scorePoint(false)}
        />
      )}

      {/* 着弾点マップ */}
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400">着弾点マップ</div>
            <div className={`text-xs ${state.showCourtTapper ? 'text-court-warning' : 'text-court-accent'}`}>
              {state.showCourtTapper ? 'コートをタップして追加' : `${state.manualLandings.length}球`}
            </div>
          </div>
          <div className="flex gap-2">
            {state.manualLandings.length > 0 && (
              <button onClick={() => state.clearLandings()} className="text-xs text-court-danger">
                クリア
              </button>
            )}
            <button onClick={() => state.toggleTapper()} className="text-xs text-court-accent font-bold">
              {state.showCourtTapper ? '✓ 完了' : '+ タップ追加'}
            </button>
          </div>
        </div>
        <CourtMap
          landings={state.manualLandings}
          tappable={state.showCourtTapper}
          onTap={(p) => state.addLanding(p)}
        />
        {state.manualLandings.length === 0 && (
          <div className="text-xs text-gray-500">
            💡 「タップ追加」でコート上の着弾点を直接入力すると、試合後の戦術分析に使えます。
          </div>
        )}
      </div>

      {/* ライブ統計（簡易） */}
      <LiveStats />

      {/* ポイント分類シート */}
      {state.pending && (
        <PointCategorySheet
          winnerIsPlayer={state.pending.winnerIsPlayer}
          gameScore={state.pending.gameScoreBefore}
          pointScore={state.pending.pointScoreBefore}
          wasBreakPoint={state.pending.wasBreakPoint}
          playerWasServing={state.pending.playerWasServing}
          firstFaulted={state.firstServeFaulted}
          onRecordFirstFault={() => state.recordFirstFault()}
          onConfirm={(c, s, r) => state.confirmPending(c, s, r)}
          onCancel={() => state.cancelPending()}
        />
      )}

      {/* 試合終了確認 */}
      {confirmEnd && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirmEnd(false)}>
          <div className="bg-court-surface rounded-xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">試合終了</h3>
            <p className="text-sm text-gray-300">レポートを生成して保存しますか？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmEnd(false)} className="px-3 py-1.5 text-sm text-gray-300">
                キャンセル
              </button>
              <button
                onClick={async () => {
                  const id = await state.endMatch()
                  setConfirmEnd(false)
                  nav(`/report/${id}`, { replace: true })
                }}
                className="px-3 py-1.5 text-sm bg-red-700 text-white rounded"
              >
                終了する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChangeoverPanel({ seconds, onSkip }: { seconds: number; onSkip: () => void }) {
  return (
    <div className="bg-blue-900/60 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-bold text-white">チェンジオーバー</div>
          <div className="text-xs text-white/70">次のゲームへ準備しましょう</div>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-black ${seconds <= 20 ? 'text-court-danger' : 'text-court-warning'}`}>
            {seconds}
          </div>
          <div className="text-xs text-white/70">秒</div>
        </div>
      </div>
      <button
        onClick={onSkip}
        className="w-full bg-green-700 text-white font-bold py-2 rounded-lg active:scale-95 transition"
      >
        ⏭ 次のゲームへ進む（待たずに開始）
      </button>
    </div>
  )
}

function LiveStats() {
  const snaps = useMatchStore(s => s.pointSnapshots)
  const win = snaps.filter(s => s.winnerIsPlayer).length
  const lose = snaps.length - win
  if (snaps.length === 0) return null
  return (
    <div className="bg-court-card rounded-xl p-3">
      <div className="text-xs text-gray-400 mb-1">ライブ統計</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-court-accent text-xl font-black">{win}</div>
          <div className="text-xs text-gray-400">獲得</div>
        </div>
        <div>
          <div className="text-court-danger text-xl font-black">{lose}</div>
          <div className="text-xs text-gray-400">失点</div>
        </div>
        <div>
          <div className="text-court-info text-xl font-black">{snaps.length}</div>
          <div className="text-xs text-gray-400">総ポイント</div>
        </div>
      </div>
    </div>
  )
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
