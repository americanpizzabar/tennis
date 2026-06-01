import { PHASE_LABEL } from '../types/match'
import type { ScoreState, MatchPhase, ServingPlayer } from '../types/match'

interface Props {
  player: ScoreState
  opponent: ScoreState
  phase: MatchPhase
  servingPlayer: ServingPlayer
  playerName: string
  opponentName: string
  onPlayerScore: () => void
  onOpponentScore: () => void
}

export function ScoreBoard(p: Props) {
  return (
    <div className="bg-court-card rounded-xl p-3 space-y-2">
      {/* フェーズ表示 */}
      {p.phase !== 'POINT' && (
        <div className="text-center">
          <span className={`inline-block px-3 py-1 rounded text-xs font-bold ${phaseClass(p.phase)}`}>
            {PHASE_LABEL[p.phase]}
          </span>
        </div>
      )}
      {/* セット表示 */}
      {p.player.sets.length > 0 && (
        <div className="flex justify-center gap-2 text-xs text-gray-400">
          {p.player.sets.map((ps, i) => {
            const os = p.opponent.sets[i] ?? 0
            const win = ps > os
            return (
              <div key={i} className="bg-white/5 px-2 py-1 rounded">
                <span className={win ? 'text-court-accent font-bold' : 'text-gray-500'}>{ps}</span>
                <span className="text-gray-500"> - </span>
                <span className={!win ? 'text-court-danger font-bold' : 'text-gray-500'}>{os}</span>
              </div>
            )
          })}
        </div>
      )}
      {/* メイン */}
      <div className="grid grid-cols-3 items-center gap-2">
        <PlayerColumn
          name={p.playerName} games={p.player.games} points={p.player.points}
          isServing={p.servingPlayer === 'PLAYER'} isPlayer
          onClick={p.onPlayerScore}
        />
        <div className="flex flex-col items-center text-gray-500">
          <span className="text-xs">G</span>
          <span className="text-2xl font-black">vs</span>
          <span className="text-xs">P</span>
        </div>
        <PlayerColumn
          name={p.opponentName} games={p.opponent.games} points={p.opponent.points}
          isServing={p.servingPlayer === 'OPPONENT'} isPlayer={false}
          onClick={p.onOpponentScore}
        />
      </div>
    </div>
  )
}

function PlayerColumn({
  name, games, points, isServing, isPlayer, onClick,
}: {
  name: string; games: number; points: string;
  isServing: boolean; isPlayer: boolean; onClick: () => void;
}) {
  const main = isPlayer ? 'text-court-accent' : 'text-court-danger'
  const btn = isPlayer ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1 text-sm font-medium">
        {isServing && <span className="text-court-warning text-xs">🎾</span>}
        <span className="text-white">{name}</span>
      </div>
      <div className={`${main} text-5xl font-black leading-none`}>{games}</div>
      <div className="text-white/90 text-xl font-bold">{points}</div>
      <button
        onClick={onClick}
        className={`${btn} text-white font-bold w-full py-2 rounded-lg transition active:scale-95`}
      >
        +1 ポイント
      </button>
    </div>
  )
}

function phaseClass(p: MatchPhase): string {
  switch (p) {
    case 'MATCH_POINT':
    case 'BREAK_POINT': return 'bg-red-900/40 text-court-danger'
    case 'GAME_POINT':
    case 'SET_POINT': return 'bg-yellow-900/40 text-court-warning'
    case 'CHANGEOVER': return 'bg-blue-900/40 text-court-info'
    case 'TIEBREAK': return 'bg-purple-900/40 text-purple-300'
    default: return 'bg-gray-900/40 text-gray-300'
  }
}
