import { create } from 'zustand'
import { advanceScore, isChangeoverNeeded } from '../lib/scoring'
import { computeStats } from '../lib/statsAggregator'
import { saveMatchReport } from '../lib/db'
import type {
  BallLandingPoint, DeuceRule, DominantHand, MatchPhase, MatchType,
  PartnerProfile, PlayerLevel, PointCategory, PointSnapshot, ScoreState,
  ServeAttempt, ServingPlayer, StrokeType,
} from '../types/match'
import { emptyScore } from '../types/match'

interface UndoSnap {
  player: ScoreState
  opponent: ScoreState
  phase: MatchPhase
  servingPlayer: ServingPlayer
  deuceCountThisGame: number
  isChangeover: boolean
  changeoverSecondsLeft: number
  pointSnapshots: PointSnapshot[]
  firstServeFaulted: boolean
}

interface PendingPoint {
  winnerIsPlayer: boolean
  gameScoreBefore: string
  pointScoreBefore: string
  phaseBefore: MatchPhase
  playerWasServing: boolean
  wasBreakPoint: boolean
}

interface MatchState {
  // 設定
  matchType: MatchType
  opponentName: string
  opponentLevel: PlayerLevel
  opponentHand: DominantHand
  partner: PartnerProfile
  opponent2: PartnerProfile
  deuceRule: DeuceRule
  // 進行
  matchId: string
  startedAtMs: number
  player: ScoreState
  opponent: ScoreState
  phase: MatchPhase
  servingPlayer: ServingPlayer
  deuceCountThisGame: number
  isChangeover: boolean
  changeoverSecondsLeft: number
  // 記録
  pointSnapshots: PointSnapshot[]
  manualLandings: BallLandingPoint[]
  // 入力モード
  detailedStatsMode: boolean
  showCourtTapper: boolean
  // サーブカウンタ
  firstServeFaulted: boolean
  // アンドゥ
  undo: UndoSnap | null
  // 分類待ち
  pending: PendingPoint | null

  // アクション
  setup: (cfg: Partial<MatchState>) => void
  startMatch: (matchType: MatchType) => void
  scorePoint: (isPlayer: boolean) => void
  confirmPending: (cat: PointCategory, stroke: StrokeType, rallyLength: number) => void
  cancelPending: () => void
  recordFirstFault: () => void
  undoLast: () => void
  setDetailedMode: (on: boolean) => void
  toggleTapper: () => void
  addLanding: (p: BallLandingPoint) => void
  clearLandings: () => void
  skipChangeover: () => void
  tickChangeover: () => void
  endMatch: () => Promise<string>
}

const newMatchId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export const useMatchStore = create<MatchState>((set, get) => ({
  matchType: 'SINGLES',
  opponentName: '相手選手',
  opponentLevel: 'INTERMEDIATE',
  opponentHand: 'RIGHT',
  partner: { name: 'パートナー', level: 'INTERMEDIATE', hand: 'RIGHT' },
  opponent2: { name: '相手選手 2', level: 'INTERMEDIATE', hand: 'RIGHT' },
  deuceRule: 'STANDARD_AD',

  matchId: '',
  startedAtMs: 0,
  player: emptyScore(),
  opponent: emptyScore(),
  phase: 'POINT',
  servingPlayer: 'PLAYER',
  deuceCountThisGame: 0,
  isChangeover: false,
  changeoverSecondsLeft: 90,

  pointSnapshots: [],
  manualLandings: [],

  detailedStatsMode: false,
  showCourtTapper: false,
  firstServeFaulted: false,

  undo: null,
  pending: null,

  setup: (cfg) => set(cfg),

  startMatch: (matchType) => set({
    matchType,
    matchId: newMatchId(),
    startedAtMs: Date.now(),
    player: emptyScore(),
    opponent: emptyScore(),
    phase: 'POINT',
    servingPlayer: 'PLAYER',
    deuceCountThisGame: 0,
    isChangeover: false,
    changeoverSecondsLeft: 90,
    pointSnapshots: [],
    manualLandings: [],
    undo: null,
    pending: null,
    firstServeFaulted: false,
  }),

  scorePoint: (isPlayer) => {
    const s = get()
    if (s.detailedStatsMode) {
      set({
        pending: {
          winnerIsPlayer: isPlayer,
          gameScoreBefore: `${s.player.games}G - ${s.opponent.games}G`,
          pointScoreBefore: `${s.player.points}-${s.opponent.points}`,
          phaseBefore: s.phase,
          playerWasServing: s.servingPlayer === 'PLAYER',
          wasBreakPoint: s.phase === 'BREAK_POINT',
        }
      })
      return
    }
    commitPoint(set, get, isPlayer, 'UNCATEGORIZED', 'UNKNOWN', 0, 'NONE')
  },

  confirmPending: (category, strokeType, rallyLength) => {
    const s = get()
    const pending = s.pending
    if (!pending) return
    const serveAttempt: ServeAttempt =
      !pending.playerWasServing && category !== 'ACE'
        ? 'NONE'
        : s.firstServeFaulted ? 'SECOND' : 'FIRST'
    commitPoint(set, get, pending.winnerIsPlayer, category, strokeType, rallyLength, serveAttempt)
    set({ pending: null })
  },

  cancelPending: () => set({ pending: null }),

  recordFirstFault: () => set(s => ({ firstServeFaulted: true })),

  undoLast: () => {
    const u = get().undo
    if (!u) return
    set({
      player: u.player,
      opponent: u.opponent,
      phase: u.phase,
      servingPlayer: u.servingPlayer,
      deuceCountThisGame: u.deuceCountThisGame,
      isChangeover: u.isChangeover,
      changeoverSecondsLeft: u.changeoverSecondsLeft,
      pointSnapshots: u.pointSnapshots,
      firstServeFaulted: u.firstServeFaulted,
      undo: null,
      pending: null,
    })
  },

  setDetailedMode: (on) => set({ detailedStatsMode: on }),
  toggleTapper: () => set(s => ({ showCourtTapper: !s.showCourtTapper })),
  addLanding: (p) => set(s => ({ manualLandings: [...s.manualLandings, p].slice(-100) })),
  clearLandings: () => set({ manualLandings: [] }),

  skipChangeover: () => set({
    isChangeover: false, phase: 'POINT', changeoverSecondsLeft: 0,
  }),

  tickChangeover: () => {
    const s = get()
    if (!s.isChangeover) return
    if (s.changeoverSecondsLeft <= 0) {
      set({ isChangeover: false, phase: 'POINT' })
      return
    }
    set({ changeoverSecondsLeft: s.changeoverSecondsLeft - 1 })
  },

  endMatch: async () => {
    const s = get()
    const stats = computeStats(s.pointSnapshots)
    const playerSetsWon = s.player.sets.filter((p, i) => p > (s.opponent.sets[i] ?? 0)).length
    const oppSetsWon = s.opponent.sets.filter((o, i) => o > (s.player.sets[i] ?? 0)).length
    const playerWon = playerSetsWon >= oppSetsWon
    const finalScore =
      s.player.sets.length > 0
        ? s.player.sets.map((p, i) => `${p}-${s.opponent.sets[i] ?? 0}`).join(' ')
        : `${s.player.games}-${s.opponent.games}`
    const durationMin = Math.max(1, Math.round((Date.now() - s.startedAtMs) / 60000))

    const summary = buildSummary(playerWon, finalScore, stats.player.winners,
      stats.player.unforcedErrors, stats.player.firstServeIn, stats.player.firstServeAttempts)

    await saveMatchReport({
      matchId: s.matchId,
      matchType: s.matchType,
      opponentName: s.opponentName,
      partnerName: s.matchType === 'DOUBLES' ? s.partner.name : undefined,
      durationMinutes: durationMin,
      finalScore,
      playerWon,
      summary,
      playerStats: stats.player,
      opponentStats: stats.opponent,
      pointSnapshots: s.pointSnapshots,
      landings: s.manualLandings,
      createdAt: Date.now(),
    })
    return s.matchId
  },
}))

function commitPoint(
  set: (fn: (s: MatchState) => Partial<MatchState>) => void,
  get: () => MatchState,
  isPlayer: boolean,
  category: PointCategory,
  strokeType: StrokeType,
  rallyLength: number,
  serveAttempt: ServeAttempt,
) {
  const before = get()
  const undo: UndoSnap = {
    player: before.player,
    opponent: before.opponent,
    phase: before.phase,
    servingPlayer: before.servingPlayer,
    deuceCountThisGame: before.deuceCountThisGame,
    isChangeover: before.isChangeover,
    changeoverSecondsLeft: before.changeoverSecondsLeft,
    pointSnapshots: before.pointSnapshots,
    firstServeFaulted: before.firstServeFaulted,
  }
  const result = advanceScore({
    player: before.player, opponent: before.opponent,
    phase: before.phase, servingPlayer: before.servingPlayer,
    deuceCountThisGame: before.deuceCountThisGame,
    deuceRule: before.deuceRule, isPlayer,
  })
  const beforeTotal = before.player.games + before.opponent.games
  const afterTotal = result.player.games + result.opponent.games
  const needsCh = isChangeoverNeeded(beforeTotal, afterTotal)

  const snap: PointSnapshot = {
    pointIndex: before.pointSnapshots.length,
    timestampMs: Date.now(),
    gameScore: `${before.player.games}G - ${before.opponent.games}G`,
    pointScore: `${before.player.points}-${before.opponent.points}`,
    winnerIsPlayer: isPlayer,
    phaseAtPoint: before.phase,
    category,
    serveAttempt,
    playerWasServing: before.servingPlayer === 'PLAYER',
    strokeType,
    rallyLength,
    wasBreakPoint: before.phase === 'BREAK_POINT',
  }

  set(() => ({
    player: result.player,
    opponent: result.opponent,
    phase: needsCh ? 'CHANGEOVER' : result.phase,
    servingPlayer: result.servingPlayer,
    deuceCountThisGame: result.deuceCountThisGame,
    isChangeover: needsCh,
    changeoverSecondsLeft: needsCh ? 90 : 0,
    pointSnapshots: [...before.pointSnapshots, snap],
    undo,
    firstServeFaulted: false,
  }))
}

function buildSummary(
  won: boolean, score: string, winners: number, ue: number,
  firstIn: number, firstAtt: number,
): string {
  const firstPct = firstAtt > 0 ? Math.round((firstIn / firstAtt) * 100) : 0
  const result = won ? '勝利' : '惜敗'
  const wueLine = winners > ue
    ? `攻撃の質が高く、ウィナー ${winners} 本で押し切れた試合。`
    : `アンフォースドエラー ${ue} 本がやや多く、ミスを減らせれば次は勝てる。`
  return `① ${result}：${score}。\n② ${wueLine}\n③ 1stサーブ確率 ${firstPct}%。次回練習では確率を 65% 超えを目標に。`
}
