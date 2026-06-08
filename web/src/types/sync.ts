import type { CameraRole } from '../lib/syncSession'

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
}

export interface SyncClip {
  blob: Blob
  mime: string
  durationSec: number
  cameraRole: CameraRole
  /** 録画開始の壁時計時刻（ホスト基準 epoch ms）。 */
  startEpoch: number
}
