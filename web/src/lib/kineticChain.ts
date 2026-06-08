/**
 * キネティックチェーン（運動連鎖）のミリ秒単位解析。
 *
 * テイクバック〜インパクト〜フォロースルーの時間窓で骨格を連続検出し、
 *  ①膝伸展（地面を蹴る）
 *  ②腰の回転
 *  ③肩のターン
 *  ④肘・手首の解放
 * の各セグメントの角速度ピーク時刻を抽出。理想は ①→②→③→④ の順で
 * 数十 ms 間隔で連鎖する。順序が崩れていれば「手打ち」のサイン。
 *
 * さらに、インパクト前後の頭部位置の SD を測ることで「頭が止まっているか
 * （Head Still）」を定量化する。
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { LM, detectVideoFrame, warmupPoseModel } from './poseDetector'

export type Joint = 'KNEE' | 'HIP' | 'SHOULDER' | 'ELBOW' | 'WRIST'

export const JOINT_ORDER: Joint[] = ['KNEE', 'HIP', 'SHOULDER', 'ELBOW', 'WRIST']

export const JOINT_LABEL: Record<Joint, string> = {
  KNEE: '①膝（地面を蹴る）',
  HIP: '②腰の回転',
  SHOULDER: '③肩のターン',
  ELBOW: '④肘の解放',
  WRIST: '⑤手首の解放',
}

export interface PoseSample {
  /** インパクト基準からの相対時刻 [ms]（負 = インパクト前）。 */
  relMs: number
  lms: NormalizedLandmark[] | null
}

export interface ChainPeak {
  joint: Joint
  /** インパクト基準でのピーク時刻 [ms]。 */
  relMs: number
  /** 角速度ピーク [rad/s]。 */
  omega: number
}

export interface ChainAnalysis {
  peaks: ChainPeak[]
  /** 順序評価：理想連鎖から外れているジョイント。 */
  outOfOrder: Joint[]
  /** 連鎖が一致している度合い 0..1（高いほど良い）。 */
  orderScore: number
  /** 「手打ち」スコア（>0：手が腰より早い）。 */
  armOnlyScore: number
  /** Head Still スコア：インパクト ±100 ms の頭位置の標準偏差（正規化）。 */
  headStillScore: number
  headStillRating: '完璧' | '良好' | '要改善' | '不安定'
  /** 元のサンプル数。 */
  samples: number
}

/**
 * 動画 + マーカー時刻から窓内のフレームを抽出して骨格を検出。
 * 60 fps 相当のフレームを取得するため、currentTime を細かく進めながら detect する。
 */
export async function samplePoseAroundHit(
  video: HTMLVideoElement, hitVideoSec: number,
  windowMs = { before: 500, after: 250 },
  stepMs = 40,   // 25 fps 相当
): Promise<PoseSample[]> {
  await warmupPoseModel().catch(() => {})
  const samples: PoseSample[] = []
  const total = (windowMs.before + windowMs.after) / stepMs
  let baseTs = Math.max(1, Math.floor(hitVideoSec * 1000 - windowMs.before))
  for (let i = 0; i <= total; i++) {
    const rel = -windowMs.before + i * stepMs
    const target = hitVideoSec + rel / 1000
    if (target < 0 || target > video.duration) continue
    video.currentTime = target
    await waitForSeek(video)
    try {
      const ts = baseTs + i * stepMs
      const frame = await detectVideoFrame(video, ts)
      samples.push({ relMs: rel, lms: frame.landmarks })
    } catch { /* noop */ }
  }
  return samples
}

function waitForSeek(v: HTMLVideoElement): Promise<void> {
  return new Promise(resolve => {
    let done = false
    const cleanup = () => { v.removeEventListener('seeked', onSeeked); done = true; resolve() }
    const onSeeked = () => { if (!done) cleanup() }
    v.addEventListener('seeked', onSeeked)
    setTimeout(() => { if (!done) cleanup() }, 300)
  })
}

/** 骨格時系列からキネティックチェーン解析を出す。 */
export function analyzeChain(samples: PoseSample[]): ChainAnalysis {
  const valid = samples.filter(s => s.lms)
  if (valid.length < 4) {
    return {
      peaks: [], outOfOrder: [], orderScore: 0, armOnlyScore: 0,
      headStillScore: 1, headStillRating: '不安定', samples: valid.length,
    }
  }

  // 各ジョイントの「角度系列」を作る
  const ang = {
    KNEE: [] as number[], HIP: [] as number[], SHOULDER: [] as number[],
    ELBOW: [] as number[], WRIST: [] as number[],
  }
  const times: number[] = []
  for (const s of valid) {
    const lms = s.lms!
    times.push(s.relMs)
    ang.KNEE.push(jointAngle(lms, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE))
    // 腰の回転：左右肩線と左右腰線の角度差
    ang.HIP.push(twistAngle(lms, LM.LEFT_HIP, LM.RIGHT_HIP))
    ang.SHOULDER.push(twistAngle(lms, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER))
    ang.ELBOW.push(jointAngle(lms, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST))
    ang.WRIST.push(wristAngle(lms))
  }

  // 角速度（中央差分）→ |omega| ピーク
  const peaks: ChainPeak[] = JOINT_ORDER.map(j => peakOmega(j, ang[j], times))
    .filter((p): p is ChainPeak => p !== null)

  // 順序評価
  const peakByJoint: Partial<Record<Joint, ChainPeak>> = {}
  for (const p of peaks) peakByJoint[p.joint] = p
  const orderedPeaks = JOINT_ORDER
    .map(j => peakByJoint[j])
    .filter((p): p is ChainPeak => p !== undefined)
  let orderOK = 0, totalPair = 0
  const outOfOrder: Joint[] = []
  for (let i = 0; i < orderedPeaks.length - 1; i++) {
    totalPair++
    if (orderedPeaks[i].relMs <= orderedPeaks[i + 1].relMs) orderOK++
    else outOfOrder.push(orderedPeaks[i + 1].joint)
  }
  const orderScore = totalPair > 0 ? orderOK / totalPair : 0

  // 手打ち：肘 or 手首ピークが腰ピークよりも早い
  let armOnly = 0
  if (peakByJoint.HIP && peakByJoint.ELBOW && peakByJoint.ELBOW.relMs < peakByJoint.HIP.relMs) armOnly += 0.5
  if (peakByJoint.HIP && peakByJoint.WRIST && peakByJoint.WRIST.relMs < peakByJoint.HIP.relMs) armOnly += 0.5

  // Head Still：±100 ms の鼻位置のばらつき
  const nearImpact = valid.filter(s => Math.abs(s.relMs) <= 100)
  const noses = nearImpact
    .map(s => s.lms![LM.NOSE])
    .filter((n): n is NormalizedLandmark => !!n && (n.visibility ?? 1) > 0.4)
  let headStillScore = 0
  let headStillRating: ChainAnalysis['headStillRating'] = '不安定'
  if (noses.length >= 3) {
    const mx = avg(noses.map(n => n.x))
    const my = avg(noses.map(n => n.y))
    const sd = Math.sqrt(avg(noses.map(n => (n.x - mx) ** 2 + (n.y - my) ** 2)))
    headStillScore = sd
    if (sd < 0.005) headStillRating = '完璧'
    else if (sd < 0.012) headStillRating = '良好'
    else if (sd < 0.025) headStillRating = '要改善'
    else headStillRating = '不安定'
  }

  return {
    peaks, outOfOrder, orderScore, armOnlyScore: armOnly,
    headStillScore, headStillRating, samples: valid.length,
  }
}

function avg(a: number[]): number {
  return a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : 0
}

function jointAngle(lms: NormalizedLandmark[], a: number, b: number, c: number): number {
  const A = lms[a], B = lms[b], C = lms[c]
  if (!A || !B || !C) return NaN
  if ((A.visibility ?? 1) < 0.3 || (B.visibility ?? 1) < 0.3 || (C.visibility ?? 1) < 0.3) return NaN
  const v1x = A.x - B.x, v1y = A.y - B.y
  const v2x = C.x - B.x, v2y = C.y - B.y
  const d = (v1x * v2x + v1y * v2y) /
    Math.max(1e-9, Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))
  return Math.acos(Math.max(-1, Math.min(1, d)))   // rad
}

/** 2 点を結ぶ線の傾き（rad）。 */
function twistAngle(lms: NormalizedLandmark[], a: number, b: number): number {
  const A = lms[a], B = lms[b]
  if (!A || !B) return NaN
  return Math.atan2(B.y - A.y, B.x - A.x)
}

/** 手首：肘→手首→人差し指 の屈曲角。 */
function wristAngle(lms: NormalizedLandmark[]): number {
  return jointAngle(lms, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, LM.RIGHT_INDEX)
}

/** 角度系列から |dθ/dt| のピーク時刻と値を返す。 */
function peakOmega(joint: Joint, angles: number[], times: number[]): ChainPeak | null {
  if (angles.length < 3) return null
  // 連続するペアの角度差／時間差。NaN は無視
  let bestOmega = 0
  let bestT = 0
  for (let i = 1; i < angles.length - 1; i++) {
    const a = angles[i - 1], b = angles[i + 1]
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const da = unwrapDelta(b - a)
    const dt = (times[i + 1] - times[i - 1]) / 1000
    if (dt <= 0) continue
    const om = Math.abs(da / dt)
    if (om > bestOmega) { bestOmega = om; bestT = times[i] }
  }
  if (bestOmega <= 0) return null
  return { joint, relMs: bestT, omega: bestOmega }
}

/** [-π, π] へ折り畳む。 */
function unwrapDelta(d: number): number {
  let x = d
  while (x > Math.PI) x -= 2 * Math.PI
  while (x < -Math.PI) x += 2 * Math.PI
  return x
}
