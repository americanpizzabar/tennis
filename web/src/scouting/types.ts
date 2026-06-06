/**
 * スカウティング＆ゲームプランの型定義。
 *
 * 設計思想：
 *  - ショット種別ごとに 1〜5 段階の評価を持たせ、内部で 0.0〜1.0 にマップ
 *  - スタイル分類は決定木（rule based）で再現性を担保
 *  - 「弱点ゾーン」は具体的なコートエリアで保持し、3D 可視化に直接使う
 */

export type DominantHand = 'RIGHT' | 'LEFT'

export type BackhandType = 'ONE_HANDED' | 'TWO_HANDED'

export type WeaknessZone =
  | 'BH_DEEP'        // バック奥
  | 'BH_HIGH'        // バック肩口の高い球
  | 'FH_WIDE'        // フォアサイドのワイド
  | 'FH_LOW'         // フォア側の低い球
  | 'BODY'           // ボディ
  | 'NET_LOW'        // ネット前の低い球（足元）
  | 'LOB'            // 頭上ロブ
  | 'SECOND_SERVE'   // 2nd サーブが甘い

export const WEAKNESS_LABEL: Record<WeaknessZone, string> = {
  BH_DEEP: 'バックハンド奥',
  BH_HIGH: 'バック肩口の高い球',
  FH_WIDE: 'フォアのワイド',
  FH_LOW: 'フォアの低い球',
  BODY: 'ボディ（懐）',
  NET_LOW: 'ネット前の低い球（足元）',
  LOB: '頭上のロブ',
  SECOND_SERVE: '2nd サーブが甘い',
}

export type PlayStyle =
  | 'AGGRESSIVE_BASELINER'
  | 'COUNTER_PUNCHER'
  | 'SERVE_VOLLEYER'
  | 'ALL_COURT'
  | 'CLAY_GRINDER'
  | 'BIG_SERVER'
  | 'PUSHER'
  | 'UNKNOWN'

export const STYLE_LABEL: Record<PlayStyle, string> = {
  AGGRESSIVE_BASELINER: 'アグレッシブ・ベースライナー',
  COUNTER_PUNCHER: 'カウンターパンチャー',
  SERVE_VOLLEYER: 'サーブ＆ボレーヤー',
  ALL_COURT: 'オールラウンダー',
  CLAY_GRINDER: 'クレー型グラインダー',
  BIG_SERVER: 'ビッグサーバー',
  PUSHER: 'プッシャー（守備型）',
  UNKNOWN: '未分類',
}

export const STYLE_EMOJI: Record<PlayStyle, string> = {
  AGGRESSIVE_BASELINER: '⚔️',
  COUNTER_PUNCHER: '🛡️',
  SERVE_VOLLEYER: '🚀',
  ALL_COURT: '🎯',
  CLAY_GRINDER: '🟫',
  BIG_SERVER: '💥',
  PUSHER: '🐢',
  UNKNOWN: '❔',
}

export const STYLE_DESCRIPTION: Record<PlayStyle, string> = {
  AGGRESSIVE_BASELINER: '強いフォア＋早い展開で押し切る攻撃型。アルカラス／シフィオンテク型。',
  COUNTER_PUNCHER: '相手の力を利用して切り返す逆襲型。マレー型。',
  SERVE_VOLLEYER: 'サーブ後すぐネットに詰める速攻型。サンプラス／エドバーグ型。',
  ALL_COURT: '全方位平均的に高い水準。フェデラー型。',
  CLAY_GRINDER: '深いトップスピンとフットワークで粘る。ナダル型。',
  BIG_SERVER: '爆発的なサーブで主導権。イズナー／オペルカ型。',
  PUSHER: 'とにかく繋ぐ。粘り型のプッシャー。',
  UNKNOWN: '判定可能なデータが不足。',
}

/** ショット系統別の星評価（1〜5）。 */
export interface ShotRatings {
  forehandPower: number
  forehandConsistency: number
  forehandTopspin: number
  forehandSlice: number
  backhandPower: number
  backhandConsistency: number
  backhandSlice: number
  serveFirstSpeed: number
  servePlacement: number
  serveSecondReliability: number
  returnAggression: number
  returnConsistency: number
  volleyLow: number
  volleyHigh: number
  movementFootwork: number
  movementSpeed: number
  baselineCoverage: number
  netConfidence: number
  underPressure: number
  comeback: number
}

export const RATING_FIELDS: Array<{ key: keyof ShotRatings; label: string; group: string }> = [
  { key: 'forehandPower', label: 'フォアハンドの威力', group: 'フォアハンド' },
  { key: 'forehandConsistency', label: 'フォアハンドの安定性', group: 'フォアハンド' },
  { key: 'forehandTopspin', label: 'フォアハンドのトップスピン量', group: 'フォアハンド' },
  { key: 'forehandSlice', label: 'フォアハンドのスライス精度', group: 'フォアハンド' },
  { key: 'backhandPower', label: 'バックハンドの威力', group: 'バックハンド' },
  { key: 'backhandConsistency', label: 'バックハンドの安定性', group: 'バックハンド' },
  { key: 'backhandSlice', label: 'バックハンドのスライス精度', group: 'バックハンド' },
  { key: 'serveFirstSpeed', label: '1st サーブの速度', group: 'サーブ' },
  { key: 'servePlacement', label: 'サーブのコースコントロール', group: 'サーブ' },
  { key: 'serveSecondReliability', label: '2nd サーブの安定性', group: 'サーブ' },
  { key: 'returnAggression', label: 'リターンの攻撃性', group: 'リターン' },
  { key: 'returnConsistency', label: 'リターンの安定性', group: 'リターン' },
  { key: 'volleyLow', label: 'ローボレー', group: 'ボレー' },
  { key: 'volleyHigh', label: 'ハイボレー', group: 'ボレー' },
  { key: 'movementFootwork', label: 'フットワーク', group: 'フィジカル' },
  { key: 'movementSpeed', label: 'スピード', group: 'フィジカル' },
  { key: 'baselineCoverage', label: 'ベースラインカバー範囲', group: 'フィジカル' },
  { key: 'netConfidence', label: 'ネット前への信頼度', group: 'メンタル' },
  { key: 'underPressure', label: 'プレッシャー耐性', group: 'メンタル' },
  { key: 'comeback', label: 'カムバック力（ビハインドから巻き返す）', group: 'メンタル' },
]

export const defaultRatings = (): ShotRatings => ({
  forehandPower: 3, forehandConsistency: 3, forehandTopspin: 3, forehandSlice: 3,
  backhandPower: 3, backhandConsistency: 3, backhandSlice: 3,
  serveFirstSpeed: 3, servePlacement: 3, serveSecondReliability: 3,
  returnAggression: 3, returnConsistency: 3,
  volleyLow: 3, volleyHigh: 3,
  movementFootwork: 3, movementSpeed: 3, baselineCoverage: 3,
  netConfidence: 3, underPressure: 3, comeback: 3,
})

/** スカウティングプロファイル（自分でも相手でも同じ構造）。 */
export interface PlayerScouting {
  id: string
  name: string
  isMe: boolean                // 自分自身か相手か
  hand: DominantHand
  backhandType: BackhandType
  ratings: ShotRatings
  /** 主要弱点（複数選択可、3 個まで）。 */
  weaknesses: WeaknessZone[]
  /** ノート（メンタルや癖の自由記述）。 */
  notes: string
  /** スタイル（自動判定された値）。 */
  style: PlayStyle
  createdAt: number
  updatedAt: number
}

export const newScouting = (isMe: boolean): PlayerScouting => ({
  id: '',
  name: isMe ? '自分' : '対戦相手',
  isMe,
  hand: 'RIGHT',
  backhandType: 'TWO_HANDED',
  ratings: defaultRatings(),
  weaknesses: [],
  notes: '',
  style: 'UNKNOWN',
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

/** ゲームプランの 1 ステップ。 */
export interface PlanStep {
  /** 1〜5 球目。 */
  order: number
  /** 何を、どこへ、どう打つか。 */
  instruction: string
  /** 関連する 3D シナリオ ID（任意）。 */
  scenarioId?: string
  /** デンジャーゾーン中心。 */
  targetZone?: 'BH_DEEP' | 'FH_WIDE' | 'CENTER' | 'BODY' | 'NET_LOW' | 'LOB'
}

/** AI が生成する勝利プラン。 */
export interface GamePlan {
  id: string
  myStyle: PlayStyle
  opponentStyle: PlayStyle
  /** プラン名。 */
  name: string
  /** 1〜3 行サマリ。 */
  summary: string
  /** 推奨配球パターン。 */
  steps: PlanStep[]
  /** 警告（このプランが効かないパターン）。 */
  caveats: string[]
  /** 関連する 3D シナリオ ID。 */
  scenarioIds: string[]
  /** 自信度（0.0〜1.0）。スタイルマッチング精度。 */
  confidence: number
  /** 音声ナレーション原稿。 */
  narration: string
}
