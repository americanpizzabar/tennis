import {
  DeuceRule, MatchPhase, ScoreState, ServingPlayer, TennisPoint,
} from '../types/match'

/** ポイント獲得を反映した新スコア＋ゲーム終了情報。 */
export interface ScoreAdvanceResult {
  player: ScoreState
  opponent: ScoreState
  phase: MatchPhase
  servingPlayer: ServingPlayer
  deuceCountThisGame: number
  gameEnded: boolean
  setEnded: boolean
}

interface Input {
  player: ScoreState
  opponent: ScoreState
  phase: MatchPhase
  servingPlayer: ServingPlayer
  deuceCountThisGame: number
  deuceRule: DeuceRule
  isPlayer: boolean
}

export function advanceScore(input: Input): ScoreAdvanceResult {
  const { player, opponent, servingPlayer, deuceCountThisGame, deuceRule, isPlayer } = input
  const winner = isPlayer ? player : opponent
  const loser = isPlayer ? opponent : player
  const winnerIsServer =
    (isPlayer && servingPlayer === 'PLAYER') ||
    (!isPlayer && servingPlayer === 'OPPONENT')

  // 1) AD 保持側が得点 → ゲーム取得
  if (winner.points === 'AD') {
    return finishGame(input, isPlayer)
  }

  // 2) 相手の AD → デュースに戻る（カウンタ +1）
  if (loser.points === 'AD') {
    return {
      player: { ...player, points: '40' },
      opponent: { ...opponent, points: '40' },
      phase: 'POINT',
      servingPlayer,
      deuceCountThisGame: deuceCountThisGame + 1,
      gameEnded: false,
      setEnded: false,
    }
  }

  // 3) 40-40
  if (winner.points === '40' && loser.points === '40') {
    const effective: DeuceRule =
      deuceRule === 'SEMI_AD'
        ? deuceCountThisGame === 0 ? 'STANDARD_AD' : 'NO_AD'
        : deuceRule
    if (effective === 'NO_AD') {
      return finishGame(input, isPlayer)
    }
    const newWinner = { ...winner, points: 'AD' as TennisPoint }
    const phase: MatchPhase = winnerIsServer ? 'GAME_POINT' : 'BREAK_POINT'
    return {
      player: isPlayer ? newWinner : player,
      opponent: isPlayer ? opponent : newWinner,
      phase,
      servingPlayer,
      deuceCountThisGame,
      gameEnded: false,
      setEnded: false,
    }
  }

  // 4) 40-X (X<40) かつ得点 → ゲーム取得
  if (winner.points === '40') {
    return finishGame(input, isPlayer)
  }

  // 5) 通常の進行
  const next = nextPoint(winner.points)
  const newWinner = { ...winner, points: next }
  const newPhase = computePhase(next, loser.points, winnerIsServer, deuceRule)
  return {
    player: isPlayer ? newWinner : player,
    opponent: isPlayer ? opponent : newWinner,
    phase: newPhase,
    servingPlayer,
    deuceCountThisGame,
    gameEnded: false,
    setEnded: false,
  }
}

function nextPoint(p: TennisPoint): TennisPoint {
  if (p === '0') return '15'
  if (p === '15') return '30'
  if (p === '30') return '40'
  return '40'
}

function computePhase(
  winnerPts: TennisPoint, loserPts: TennisPoint,
  winnerIsServer: boolean, deuceRule: DeuceRule,
): MatchPhase {
  const lowerThan40 = (p: TennisPoint) =>
    p === '0' || p === '15' || p === '30'
  if (winnerPts === '40' && loserPts === '40' && deuceRule === 'NO_AD') {
    return winnerIsServer ? 'GAME_POINT' : 'BREAK_POINT'
  }
  if (winnerPts === '40' && lowerThan40(loserPts)) {
    return winnerIsServer ? 'GAME_POINT' : 'BREAK_POINT'
  }
  return 'POINT'
}

function finishGame(input: Input, isPlayer: boolean): ScoreAdvanceResult {
  const { player, opponent, servingPlayer } = input
  const pGames = isPlayer ? player.games + 1 : player.games
  const oGames = isPlayer ? opponent.games : opponent.games + 1
  const newServer: ServingPlayer = servingPlayer === 'PLAYER' ? 'OPPONENT' : 'PLAYER'
  const setDone =
    (pGames >= 6 && pGames - oGames >= 2) ||
    (oGames >= 6 && oGames - pGames >= 2) ||
    pGames === 7 || oGames === 7

  if (setDone) {
    return {
      player: { sets: [...player.sets, pGames], games: 0, points: '0' },
      opponent: { sets: [...opponent.sets, oGames], games: 0, points: '0' },
      phase: 'POINT',
      servingPlayer: newServer,
      deuceCountThisGame: 0,
      gameEnded: true,
      setEnded: true,
    }
  }
  return {
    player: { ...player, games: pGames, points: '0' },
    opponent: { ...opponent, games: oGames, points: '0' },
    phase: 'POINT',
    servingPlayer: newServer,
    deuceCountThisGame: 0,
    gameEnded: true,
    setEnded: false,
  }
}

/** ゲームが終了して合計ゲーム数が奇数になったらチェンジオーバー。 */
export function isChangeoverNeeded(
  beforeGames: number, afterGames: number,
): boolean {
  if (afterGames <= beforeGames) return false
  return afterGames % 2 === 1
}
