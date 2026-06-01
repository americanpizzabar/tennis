// Android アプリのスコア／スタッツモデルをそのまま TypeScript に移植したもの。

export type TennisPoint = '0' | '15' | '30' | '40' | 'AD'

export const POINTS: TennisPoint[] = ['0', '15', '30', '40', 'AD']

export type DeuceRule = 'STANDARD_AD' | 'NO_AD' | 'SEMI_AD'

export const DEUCE_RULE_INFO: Record<DeuceRule, { ja: string; desc: string }> = {
  STANDARD_AD: { ja: 'デュース／アドバンテージ', desc: '40-40 から 2 ポイント連取で勝ち（伝統ルール）' },
  NO_AD: { ja: 'ノーアドバンテージ', desc: '40-40 になったら次の 1 ポイントで決着' },
  SEMI_AD: { ja: 'セミアドバンテージ', desc: '1 回目は AD 方式、2 回目以降は次の 1 ポイントで決着' },
}

export type ServingPlayer = 'PLAYER' | 'OPPONENT'

export type MatchPhase =
  | 'POINT'
  | 'CHANGEOVER'
  | 'TIEBREAK'
  | 'BREAK_POINT'
  | 'GAME_POINT'
  | 'SET_POINT'
  | 'MATCH_POINT'

export const PHASE_LABEL: Record<MatchPhase, string> = {
  POINT: 'ポイント中',
  CHANGEOVER: 'チェンジオーバー',
  TIEBREAK: 'タイブレーク',
  BREAK_POINT: 'ブレークポイント',
  GAME_POINT: 'ゲームポイント',
  SET_POINT: 'セットポイント',
  MATCH_POINT: 'マッチポイント',
}

export type MatchType = 'SINGLES' | 'DOUBLES'
export type DominantHand = 'RIGHT' | 'LEFT'
export type PlayerLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED_INTERMEDIATE' | 'ADVANCED' | 'COMPETITIVE'

export const LEVEL_LABEL: Record<PlayerLevel, string> = {
  BEGINNER: '初級',
  INTERMEDIATE: '中級',
  ADVANCED_INTERMEDIATE: '中上級',
  ADVANCED: '上級',
  COMPETITIVE: '競技',
}

export interface ScoreState {
  sets: number[]
  games: number
  points: TennisPoint
}

export const emptyScore = (): ScoreState => ({ sets: [], games: 0, points: '0' })

// ── ポイント分類 ─────────────────────────────────────────
export type PointCategory =
  | 'ACE'
  | 'SERVICE_WINNER'
  | 'DOUBLE_FAULT'
  | 'WINNER'
  | 'FORCED_ERROR'
  | 'UNFORCED_ERROR'
  | 'NET_WINNER'
  | 'NORMAL'
  | 'UNCATEGORIZED'

export const CATEGORY_INFO: Record<PointCategory, { ja: string; emoji: string }> = {
  ACE: { ja: 'サービスエース', emoji: '⚡' },
  SERVICE_WINNER: { ja: 'サービスウィナー', emoji: '🎯' },
  DOUBLE_FAULT: { ja: 'ダブルフォルト', emoji: '✗' },
  WINNER: { ja: 'ウィナー', emoji: '💥' },
  FORCED_ERROR: { ja: '相手のフォーストエラー', emoji: '🔥' },
  UNFORCED_ERROR: { ja: '自分のアンフォースドエラー', emoji: '⚠️' },
  NET_WINNER: { ja: 'ネットでの決定打', emoji: '🥅' },
  NORMAL: { ja: '通常のラリー勝ち', emoji: '🎾' },
  UNCATEGORIZED: { ja: '分類なし', emoji: '—' },
}

export type StrokeType = 'UNKNOWN' | 'FOREHAND' | 'BACKHAND' | 'SERVE' | 'VOLLEY' | 'SMASH' | 'RETURN'
export const STROKE_LABEL: Record<StrokeType, string> = {
  UNKNOWN: '—',
  FOREHAND: 'フォア',
  BACKHAND: 'バック',
  SERVE: 'サーブ',
  VOLLEY: 'ボレー',
  SMASH: 'スマッシュ',
  RETURN: 'リターン',
}

export type ServeAttempt = 'NONE' | 'FIRST' | 'SECOND'

// ── 着弾点 ───────────────────────────────────────────────
export type CourtZone =
  | 'DEUCE_SERVICE_BOX'
  | 'AD_SERVICE_BOX'
  | 'DEUCE_BASELINE'
  | 'AD_BASELINE'
  | 'CENTER_BASELINE'
  | 'NET'
  | 'OUT'

export interface BallLandingPoint {
  x: number   // 0〜1
  y: number   // 0〜1
  isInCourt: boolean
  zone: CourtZone
  timestampMs: number
}

// ── プレイヤー情報 ────────────────────────────────────────
export interface PartnerProfile {
  name: string
  level: PlayerLevel
  hand: DominantHand
}

// ── ポイント分析スナップショット ─────────────────────────
export interface PointSnapshot {
  pointIndex: number
  timestampMs: number
  gameScore: string
  pointScore: string
  winnerIsPlayer: boolean
  phaseAtPoint: MatchPhase
  category: PointCategory
  serveAttempt: ServeAttempt
  playerWasServing: boolean
  strokeType: StrokeType
  rallyLength: number
  wasBreakPoint: boolean
}

// ── スタッツ ──────────────────────────────────────────────
export interface PlayerStats {
  aces: number
  doubleFaults: number
  firstServeIn: number
  firstServeAttempts: number
  firstServePointsWon: number
  secondServePointsWon: number
  secondServeAttempts: number
  breakPointsSaved: number
  breakPointsFaced: number
  firstServeReturnPointsWon: number
  firstServeReturnAttempts: number
  secondServeReturnPointsWon: number
  secondServeReturnAttempts: number
  breakPointsConverted: number
  breakPointsAttempted: number
  winners: number
  unforcedErrors: number
  forcedErrors: number
  netApproaches: number
  netApproachesWon: number
  totalPointsWon: number
  totalPointsPlayed: number
  forehandWinners: number
  backhandWinners: number
  forehandErrors: number
  backhandErrors: number
  rallyLengthSum: number
  rallyCount: number
}

export const emptyStats = (): PlayerStats => ({
  aces: 0, doubleFaults: 0, firstServeIn: 0, firstServeAttempts: 0,
  firstServePointsWon: 0, secondServePointsWon: 0, secondServeAttempts: 0,
  breakPointsSaved: 0, breakPointsFaced: 0,
  firstServeReturnPointsWon: 0, firstServeReturnAttempts: 0,
  secondServeReturnPointsWon: 0, secondServeReturnAttempts: 0,
  breakPointsConverted: 0, breakPointsAttempted: 0,
  winners: 0, unforcedErrors: 0, forcedErrors: 0,
  netApproaches: 0, netApproachesWon: 0,
  totalPointsWon: 0, totalPointsPlayed: 0,
  forehandWinners: 0, backhandWinners: 0,
  forehandErrors: 0, backhandErrors: 0,
  rallyLengthSum: 0, rallyCount: 0,
})

export const pct = (num: number, den: number): number =>
  den > 0 ? Math.round((num * 100) / den) : 0

// ── 保存される試合レポート ────────────────────────────────
export interface MatchReport {
  matchId: string
  matchType: MatchType
  opponentName: string
  partnerName?: string
  durationMinutes: number
  finalScore: string
  playerWon: boolean
  summary: string
  playerStats: PlayerStats
  opponentStats: PlayerStats
  pointSnapshots: PointSnapshot[]
  landings: BallLandingPoint[]
  createdAt: number
}
