import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * MediaPipe Pose Landmarker のブラウザ用ラッパー。
 *
 * 精度優先で full モデルを使用。WASM ファイルは jsdelivr CDN から取得する。
 *
 * 注意：
 *  - 初回ロードはネット接続必須（モデル ~9MB、WASM ~3MB）。一度キャッシュされれば
 *    Service Worker が次回以降オフラインで動かす。
 *  - VIDEO RunningMode を使い、HTMLVideoElement から同期的に推論。
 *  - 精度を上げるため、信頼度しきい値を上げ、時間的スムージングでジッタを抑える。
 */

// 精度向上：lite → full モデル。端末が非力でも GPU デリゲートで実用速度。
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task'

// 端末が遅い場合のフォールバック（lite）。full が失敗したら自動で切り替える。
const MODEL_URL_LITE =
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
let usingLite = false

/** 精度設定（高精度／高速の切り替え）。 */
export type PoseQuality = 'HIGH' | 'FAST'
let quality: PoseQuality = 'HIGH'

export function setPoseQuality(q: PoseQuality) {
  if (q !== quality) {
    quality = q
    // 次回ロードで反映するためリセット
    if (landmarkerPromise) {
      landmarkerPromise.then(lm => lm.close()).catch(() => undefined)
      landmarkerPromise = null
      smoothedLandmarks = null
    }
  }
}

async function createLandmarker(modelUrl: string): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  return await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    // 精度向上：検出・存在・追跡の各しきい値を引き上げて誤検出を減らす
    minPoseDetectionConfidence: 0.6,
    minPosePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  })
}

async function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const useLite = quality === 'FAST'
      const primary = useLite ? MODEL_URL_LITE : MODEL_URL
      try {
        usingLite = useLite
        return await createLandmarker(primary)
      } catch (e) {
        // full が失敗したら lite にフォールバック
        usingLite = true
        return await createLandmarker(MODEL_URL_LITE)
      }
    })()
  }
  return landmarkerPromise
}

export function isUsingLiteModel(): boolean {
  return usingLite
}

// ── 時間的スムージング（ジッタ抑制） ───────────────────────
// One-Euro 風の簡易スムージング：可視性が高い点は強く、低い点は弱く平滑化。
let smoothedLandmarks: NormalizedLandmark[] | null = null
const SMOOTH_ALPHA = 0.5  // 0=平滑化最大、1=平滑化なし

function smooth(raw: NormalizedLandmark[] | null): NormalizedLandmark[] | null {
  if (!raw) {
    // 検出ロスト時は前回値を保持せずクリア（残像防止）
    smoothedLandmarks = null
    return null
  }
  if (!smoothedLandmarks || smoothedLandmarks.length !== raw.length) {
    smoothedLandmarks = raw.map(p => ({ ...p }))
    return smoothedLandmarks
  }
  const out: NormalizedLandmark[] = raw.map((p, i) => {
    const prev = smoothedLandmarks![i]
    const vis = p.visibility ?? 1
    // 可視性が高いほど現在値を信頼（追従を速く）
    const a = SMOOTH_ALPHA + (1 - SMOOTH_ALPHA) * vis * 0.5
    return {
      x: prev.x + (p.x - prev.x) * a,
      y: prev.y + (p.y - prev.y) * a,
      z: (prev.z ?? 0) + ((p.z ?? 0) - (prev.z ?? 0)) * a,
      visibility: vis,
    } as NormalizedLandmark
  })
  smoothedLandmarks = out
  return out
}

export function resetSmoothing() {
  smoothedLandmarks = null
}

/** ライブカメラの 1 フレームを処理。同期的に結果を返す（スムージング適用）。 */
export async function detectVideoFrame(
  video: HTMLVideoElement,
  timestampMs: number,
  applySmoothing = true,
): Promise<PoseFrame> {
  const lm = await getLandmarker()
  const res: PoseLandmarkerResult = lm.detectForVideo(video, timestampMs)
  const rawLs = res.landmarks[0] ?? null
  const ws = res.worldLandmarks[0] ?? null
  const ls = applySmoothing ? smooth(rawLs) : rawLs
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
  smoothedLandmarks = null
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
