import { PlayerStats, PointSnapshot, emptyStats } from '../types/match'

/**
 * ポイントスナップショット配列から両プレイヤーの全スタッツを集計。
 * Android 版 MatchViewModel.computeStatsFromPoints の TS 移植。
 */
export function computeStats(snapshots: PointSnapshot[]): {
  player: PlayerStats; opponent: PlayerStats
} {
  let p = emptyStats()
  let o = emptyStats()

  for (const s of snapshots) {
    p.totalPointsPlayed++
    o.totalPointsPlayed++
    if (s.winnerIsPlayer) p.totalPointsWon++
    else o.totalPointsWon++

    if (s.rallyLength > 0) {
      p.rallyLengthSum += s.rallyLength; p.rallyCount++
      o.rallyLengthSum += s.rallyLength; o.rallyCount++
    }

    // サーブ集計
    if (s.serveAttempt !== 'NONE') {
      const isFirst = s.serveAttempt === 'FIRST'
      const isAce = s.category === 'ACE'
      const isDF = s.category === 'DOUBLE_FAULT'
      const wonByPlayer = s.winnerIsPlayer

      if (s.playerWasServing) {
        if (isFirst) {
          p.firstServeAttempts++
          p.firstServeIn++
          if (wonByPlayer) p.firstServePointsWon++
          o.firstServeReturnAttempts++
          if (!wonByPlayer) o.firstServeReturnPointsWon++
        } else {
          // 2nd の場合は 1st は失敗していた前提
          p.firstServeAttempts++
          p.secondServeAttempts++
          if (wonByPlayer) p.secondServePointsWon++
          o.secondServeReturnAttempts++
          if (!wonByPlayer) o.secondServeReturnPointsWon++
        }
        if (isAce) p.aces++
        if (isDF) p.doubleFaults++
      } else {
        if (isFirst) {
          o.firstServeAttempts++
          o.firstServeIn++
          if (!wonByPlayer) o.firstServePointsWon++
          p.firstServeReturnAttempts++
          if (wonByPlayer) p.firstServeReturnPointsWon++
        } else {
          o.firstServeAttempts++
          o.secondServeAttempts++
          if (!wonByPlayer) o.secondServePointsWon++
          p.secondServeReturnAttempts++
          if (wonByPlayer) p.secondServeReturnPointsWon++
        }
        if (isAce) o.aces++
        if (isDF) o.doubleFaults++
      }
    }

    // BP
    if (s.wasBreakPoint) {
      if (s.playerWasServing) {
        p.breakPointsFaced++
        if (s.winnerIsPlayer) p.breakPointsSaved++
        o.breakPointsAttempted++
        if (!s.winnerIsPlayer) o.breakPointsConverted++
      } else {
        o.breakPointsFaced++
        if (!s.winnerIsPlayer) o.breakPointsSaved++
        p.breakPointsAttempted++
        if (s.winnerIsPlayer) p.breakPointsConverted++
      }
    }

    // ウィナー / エラー
    const sideWon = s.winnerIsPlayer ? p : o
    const sideLost = s.winnerIsPlayer ? o : p
    switch (s.category) {
      case 'WINNER':
      case 'NET_WINNER':
      case 'SERVICE_WINNER':
        sideWon.winners++
        if (s.strokeType === 'FOREHAND') sideWon.forehandWinners++
        if (s.strokeType === 'BACKHAND') sideWon.backhandWinners++
        if (s.category === 'NET_WINNER') {
          sideWon.netApproaches++
          sideWon.netApproachesWon++
        }
        break
      case 'UNFORCED_ERROR':
        sideLost.unforcedErrors++
        if (s.strokeType === 'FOREHAND') sideLost.forehandErrors++
        if (s.strokeType === 'BACKHAND') sideLost.backhandErrors++
        break
      case 'FORCED_ERROR':
        sideLost.forcedErrors++
        break
    }
  }

  return { player: p, opponent: o }
}
