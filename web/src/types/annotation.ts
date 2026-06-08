/** プロコーチが動画にラインを引いて音声解説を吹き込む「指導ビデオ」。 */
export interface VoiceAnnotation {
  id: string
  /** どの SyncSessionRecord から派生したか。 */
  syncId: string
  createdAt: number
  title: string
  /** 元動画 BACK / SIDE。 */
  source: 'BACK' | 'SIDE'
  /** スナップショット時刻（元動画の秒）。 */
  snapshotSec: number
  /** スナップショット JPEG。 */
  imageBlob: Blob
  /** 音声録音（webm/opus 等）。 */
  audioBlob: Blob
  audioMime: string
  /** 描画ストローク。 */
  strokes: AnnotationStroke[]
  /** 録音時間 [s]。 */
  durationSec: number
}

export interface AnnotationStroke {
  /** ストローク開始時の録音相対時刻 [s]。 */
  tSec: number
  color: string
  width: number
  /** 0..1 正規化の (x, y) 点列。 */
  points: Array<[number, number]>
}
