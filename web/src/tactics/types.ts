/**
 * 戦術シナリオの型定義。
 *
 * コート座標系：
 *  - 中央を原点、ネットが z=0
 *  - x: -5 〜 +5 m（ダブルスサイドライン基準で約 ±5.49 m）
 *  - z: -11.89 〜 +11.89 m（ベースライン）
 *  - 自分側は z < 0、相手側は z > 0
 *  - y: 高さ（0 = グラウンド）
 */

export type Side = 'NEAR' | 'FAR'  // NEAR = 自分側、FAR = 相手側

export interface BallKey {
  /** ミリ秒（シナリオ開始からの相対時刻）。 */
  tMs: number
  /** 3D 位置（x, y, z）。 */
  pos: [number, number, number]
}

export interface PlayerKey {
  tMs: number
  /** 2D 位置（x, z）。 */
  pos: [number, number]
  /** 向き（ラジアン、z 軸からの角度）。省略時は前回値を継続。 */
  facing?: number
}

export interface PlayerTrack {
  id: string
  /** 表示ラベル。 */
  label: string
  /** 立ち位置サイド。 */
  side: Side
  /** プレイヤーの色。 */
  color: string
  /** 「あなた」「パートナー」「相手1」「相手2」等。 */
  role: 'YOU' | 'PARTNER' | 'OPP1' | 'OPP2'
  keyframes: PlayerKey[]
}

export interface DangerZoneKey {
  tMs: number
  /** 中心（x, z）。 */
  center: [number, number]
  /** 半径（m）。 */
  radius: number
  /** 表示するか。 */
  visible: boolean
}

export interface NarrationBeat {
  tMs: number
  text: string
  /** 強調表示するなら true。 */
  emphasized?: boolean
}

/** 「ここを狙え」ターゲットゲート（光るホログラム）。 */
export interface TargetGateKey {
  tMs: number
  /** 3D 位置（x, y, z）。 */
  pos: [number, number, number]
  /** 法線方向（リングの向き）。 */
  normal: [number, number, number]
  /** リング外半径（メートル）。 */
  radius: number
  visible: boolean
  /** ゲート名。 */
  label?: string
}

/** 視野コーンの設定（誰の視野を見せるか）。 */
export type VisionConeRole = 'YOU' | 'PARTNER' | 'OPP1' | 'OPP2' | 'ALL' | 'NONE'

export type ScenarioCategory =
  | 'SINGLES_POSITIONING'
  | 'SINGLES_PATTERN'
  | 'DOUBLES_PARALLEL'
  | 'DOUBLES_OPPOSITE'
  | 'DOUBLES_I_FORMATION'

export interface Scenario {
  id: string
  category: ScenarioCategory
  title: string
  subtitle: string
  /** 学習目標（1〜2 行）。 */
  goal: string
  durationMs: number
  ballPath: BallKey[]
  players: PlayerTrack[]
  dangerZones: DangerZoneKey[]
  beats: NarrationBeat[]
  /** 「ここを狙え」ホログラムゲート。 */
  targetGates?: TargetGateKey[]
  /** 表示する視野コーン（デフォルトは ALL）。 */
  visionConesOf?: VisionConeRole
  /** プレッシャー演出を入れる時刻範囲（POV モードでトンネル視野）。 */
  pressureRange?: { startMs: number; endMs: number }
  /** 相手の利き手依存（左利き設定で X 軸反転する）。 */
  rightHandedAssumption?: boolean
  /** 関連プロ。 */
  proReference?: string
}

export const CATEGORY_LABEL: Record<ScenarioCategory, string> = {
  SINGLES_POSITIONING: 'シングルス・幾何学（戻り位置）',
  SINGLES_PATTERN: 'シングルス・配球パターン',
  DOUBLES_PARALLEL: 'ダブルス・並行陣',
  DOUBLES_OPPOSITE: 'ダブルス・雁行陣',
  DOUBLES_I_FORMATION: 'ダブルス・I フォーメーション',
}
