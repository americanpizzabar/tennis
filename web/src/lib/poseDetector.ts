import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * MediaPipe Pose Landmarker のブラウザ用ラッパー。
 *
 * Google Cloud Storage に公開されている lite モデルを CDN 経由でロード。
 * WASM ファイルは jsdelivr CDN から取得する。
 *
 * 注意：
 *  - 初回ロードはネット接続必須（モデル ~6MB、WASM ~3MB）。一度キャッシュされれば
 *    Service Worker が次回以降オフラインで動かす。
 *  - VIDEO RunningMode を使い、HTMLVideoElement から同期的に推論。
 */

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'

export interface PoseFrame {
  /** 動画時刻（秒、開始から）。 */
  tSec: number
  landmarks: NormalizedLandmark[] | null
  worldLandmarks: NormalizedLandmark[] | null
}

let landmarkerPromise: Promise<PoseLandmarker> | null = null

async function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
    })()
  }
  return landmarkerPromise
}

/** ライブカメラの 1 フレームを処理。同期的に結果を返す。 */
export async function detectVideoFrame(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<PoseFrame> {
  const lm = await getLandmarker()
  const res: PoseLandmarkerResult = lm.detectForVideo(video, timestampMs)
  const ls = res.landmarks[0] ?? null
  const ws = res.worldLandmarks[0] ?? null
  return { tSec: timestampMs / 1000, landmarks: ls, worldLandmarks: ws }
}

/** あらかじめ確実にロードしておくためのウォームアップ。 */
export async function warmupPoseModel(): Promise<void> {
  await getLandmarker()
}

/** リリース（タブ切り替え時など）。次回呼び出しで再ロード。 */
export function releasePoseModel(): void {
  if (landmarkerPromise) {
    landmarkerPromise.then(lm => lm.close()).catch(() => undefined)
    landmarkerPromise = null
  }
}

// MediaPipe Pose Landmarker のランドマーク インデックス
export const LM = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const

/** 骨格を描画するための隣接ペア（簡易版：体幹と四肢）。 */
export const SKELETON_EDGES: Array<[number, number]> = [
  // 体幹
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  // 右腕
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  // 左腕
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  // 右脚
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  // 左脚
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
]
