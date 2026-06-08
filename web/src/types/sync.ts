import type { CameraRole } from '../lib/syncSession'
import type { Point2D } from '../lib/homography'

/** マルチアングル同期撮影で保存される 1 セッション（2 視点の動画ペア）。 */
export interface SyncSessionRecord {
  id: string
  createdAt: number
  /** ラベル（例：練習・2026/6/8）。 */
  title: string
  /** 後方カメラ（全体俯瞰）の動画。 */
  back?: SyncClip
  /** サイドカメラ（打点・フォーム）の動画。 */
  side?: SyncClip
  /** 2 本の録画開始のズレ（ms、back基準でsideがどれだけ遅れて始まったか）。 */
  startSkewMs: number
  /** 時計同期の品質（RTT ms）。 */
  syncRttMs?: number
  /** 打点↔弾道リンクのマーカー（共通タイムライン）。 */
  markers?: SyncMarker[]
  /** 2 視点キャリブレーション（コート 4 隅）。 */
  calibration?: SyncCalibration
  /** 各マーカーに対する 2 視点ボールタグ → 三角測量済み 3D 位置。 */
  ballTags?: BallTag[]
}

/** 2 視点キャリブレーション情報。 */
export interface SyncCalibration {
  /** 後方カメラの動画 4 隅（0..1 正規化、左下→左上→右上→右下）。 */
  back?: Point2D[]
  /** サイドカメラの動画 4 隅。 */
  side?: Point2D[]
  courtType: 'SINGLES' | 'DOUBLES'
}

/** マーカー時刻にタグ付けされたボール 3D 位置（三角測量済み）。 */
export interface BallTag {
  /** SyncMarker.id への参照。 */
  markerId: string
  /** ワールド 3D 位置 (X, Y, Z) [m]。 */
  pos: [number, number, number]
  /** 後方カメラ上のタップ (0..1)。 */
  tapBack?: Point2D
  /** サイドカメラ上のタップ (0..1)。 */
  tapSide?: Point2D
  /** 三角測量の残差（2 光線間の最小距離 [m]）。小さいほど高信頼。 */
  gap?: number
}

export interface SyncClip {
  blob: Blob
  mime: string
  durationSec: number
  cameraRole: CameraRole
  /** 録画開始の壁時計時刻（ホスト基準 epoch ms）。 */
  startEpoch: number
}

/** マーカーの種別。打点（HIT）・バウンド・サーブ・エース・ミス。 */
export type MarkerKind = 'HIT' | 'BOUNCE' | 'SERVE' | 'ACE' | 'MISS' | 'NOTE'

/** 共通タイムライン上のマーカー（両カメラ共通の瞬間）。 */
export interface SyncMarker {
  id: string
  /** ホスト基準 epoch ms（クリップの startEpoch と同じ時系列）。 */
  epoch: number
  kind: MarkerKind
  /** 自由記述メモ（任意）。 */
  note?: string
}

