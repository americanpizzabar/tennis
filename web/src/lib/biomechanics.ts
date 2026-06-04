import { LM, PoseFrame } from './poseDetector'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * バイオメカニクス計算ユーティリティ。
 *
 * 「肘の伸び具合」「膝の曲がり」「骨盤-肩の捻転差」「打点検知」など、
 * テニス指導で重要な指標をポーズフレーム列から算出する。
 *
 * 注意：単一カメラ・2D 推定なので絶対値（°）は参考値。
 * 同一撮影位置での相対変化を見る目的で使う。
 */

export interface SwingEvent {
  /** 動画時刻（秒）。 */
  tSec: number
  frameIndex: number
  /** インパクト直前の手首速度の絶対値（正規化／秒）。 */
  wristSpeed: number
}

/** 利き手側（解析対象）。 */
export type Side = 'RIGHT' | 'LEFT'

/** 2D ベクトル間の角度（°）。 */
export function angleDeg(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): number {
  const v1x = ax - bx, v1y = ay - by
  const v2x = cx - bx, v2y = cy - by
  const dot = v1x * v2x + v1y * v2y
  const m1 = Math.hypot(v1x, v1y)
  const m2 = Math.hypot(v2x, v2y)
  if (m1 === 0 || m2 === 0) return 0
  const c = Math.max(-1, Math.min(1, dot / (m1 * m2)))
  return (Math.acos(c) * 180) / Math.PI
}

/** 利き手側手首の正規化座標。 */
export function dominantWrist(frame: PoseFrame, side: Side): NormalizedLandmark | null {
  const lms = frame.landmarks
  if (!lms) return null
  return side === 'RIGHT' ? lms[LM.RIGHT_WRIST] : lms[LM.LEFT_WRIST]
}

/** 手首速度（連続フレーム間の差分）。座標は正規化、単位は「画面比/秒」。 */
export function wristSpeed(prev: PoseFrame, cur: PoseFrame, side: Side): number {
  const a = dominantWrist(prev, side)
  const b = dominantWrist(cur, side)
  if (!a || !b) return 0
  const dt = cur.tSec - prev.tSec
  if (dt <= 0) return 0
  return Math.hypot(b.x - a.x, b.y - a.y) / dt
}

/** スイング検知：手首速度のピーク（局所最大）を抽出。 */
export function detectSwings(
  frames: PoseFrame[], side: Side, minSpeed = 1.2,
): SwingEvent[] {
  if (frames.length < 5) return []
  const speeds: number[] = []
  for (let i = 0; i < frames.length; i++) {
    if (i === 0) { speeds.push(0); continue }
    speeds.push(wristSpeed(frames[i - 1], frames[i], side))
  }
  const events: SwingEvent[] = []
  let lastPeak = -100
  for (let i = 2; i < frames.length - 2; i++) {
    const v = speeds[i]
    if (
      v > minSpeed &&
      v >= speeds[i - 1] && v >= speeds[i + 1] &&
      v >= speeds[i - 2] && v >= speeds[i + 2] &&
      i - lastPeak > 8
    ) {
      events.push({ tSec: frames[i].tSec, frameIndex: i, wristSpeed: v })
      lastPeak = i
    }
  }
  return events
}

// ── 関節角度系 ──────────────────────────────────────────

/** 肘の角度（°）。180 = 伸び切り、90 = 直角。 */
export function elbowAngle(frame: PoseFrame, side: Side): number | null {
  const lms = frame.landmarks
  if (!lms) return null
  const sh = side === 'RIGHT' ? LM.RIGHT_SHOULDER : LM.LEFT_SHOULDER
  const el = side === 'RIGHT' ? LM.RIGHT_ELBOW : LM.LEFT_ELBOW
  const wr = side === 'RIGHT' ? LM.RIGHT_WRIST : LM.LEFT_WRIST
  const s = lms[sh], e = lms[el], w = lms[wr]
  return angleDeg(s.x, s.y, e.x, e.y, w.x, w.y)
}

/** 膝の角度（°）。180 = 伸び切り、120 程度 = しっかり溜め。 */
export function kneeAngle(frame: PoseFrame, side: Side): number | null {
  const lms = frame.landmarks
  if (!lms) return null
  const h = side === 'RIGHT' ? LM.RIGHT_HIP : LM.LEFT_HIP
  const k = side === 'RIGHT' ? LM.RIGHT_KNEE : LM.LEFT_KNEE
  const a = side === 'RIGHT' ? LM.RIGHT_ANKLE : LM.LEFT_ANKLE
  const hp = lms[h], kn = lms[k], an = lms[a]
  return angleDeg(hp.x, hp.y, kn.x, kn.y, an.x, an.y)
}

/** 両肩の傾き（°、画面横軸を 0 とする）。捻転と回旋を把握。 */
export function shoulderTiltDeg(frame: PoseFrame): number | null {
  const lms = frame.landmarks
  if (!lms) return null
  const l = lms[LM.LEFT_SHOULDER], r = lms[LM.RIGHT_SHOULDER]
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI
}

/** 両骨盤の傾き（°）。 */
export function hipTiltDeg(frame: PoseFrame): number | null {
  const lms = frame.landmarks
  if (!lms) return null
  const l = lms[LM.LEFT_HIP], r = lms[LM.RIGHT_HIP]
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI
}

/**
 * 骨盤と肩の捻転差（°）。テニスのキネティックチェーンを評価する基本指標。
 * 0 に近いほど捻り不足。テイクバック時 30〜60°くらいが目安。
 */
export function shoulderHipTwistDeg(frame: PoseFrame): number | null {
  const s = shoulderTiltDeg(frame)
  const h = hipTiltDeg(frame)
  if (s === null || h === null) return null
  return Math.abs(s - h)
}

/**
 * 胸の開き（°）。
 * 左肩→右肩のベクトル角度の絶対値。0〜90° で、片手バックでは
 * インパクト時に小さく保つことが望ましい。
 */
export function chestOpenDeg(frame: PoseFrame): number | null {
  return shoulderTiltDeg(frame)
}

// ── 打点（インパクト）検出と前後位置 ─────────────────────

/**
 * 打点フレームをスイングピーク前後で精緻化。
 * 単純実装：ピークそのものを打点とする（手首が最も加速した瞬間）。
 */
export function findContactFrame(swing: SwingEvent): number {
  return swing.frameIndex
}

/**
 * 打点と前足の前後距離（正規化）。+ が前、− が後ろ。
 * 片手バックでは「打点が前足より前」が理想。
 */
export function contactRelativeToFrontFoot(
  frame: PoseFrame, side: Side,
): number | null {
  const lms = frame.landmarks
  if (!lms) return null
  const wrist = side === 'RIGHT' ? lms[LM.RIGHT_WRIST] : lms[LM.LEFT_WRIST]
  // 「前足」＝利き手と逆側の足首を採用（右利きなら左足が前足）
  const frontAnkle = side === 'RIGHT' ? lms[LM.LEFT_ANKLE] : lms[LM.RIGHT_ANKLE]
  // 画面 X 軸：右利きで左→右にプレーする想定だと、打点が左足より「右側」（プラス方向）が前
  // 撮影方向に依存するが、相対値として返す
  return wrist.x - frontAnkle.x
}

/** 単一フレームの 1 セット指標を抽出（インパクト時など）。 */
export interface FrameMetrics {
  tSec: number
  elbowDeg: number | null
  kneeDeg: number | null
  shoulderTilt: number | null
  hipTilt: number | null
  twistDeg: number | null
  chestOpenAbs: number | null
  contactRelFrontFoot: number | null
}

export function frameMetrics(frame: PoseFrame, side: Side): FrameMetrics {
  return {
    tSec: frame.tSec,
    elbowDeg: elbowAngle(frame, side),
    kneeDeg: kneeAngle(frame, side),
    shoulderTilt: shoulderTiltDeg(frame),
    hipTilt: hipTiltDeg(frame),
    twistDeg: shoulderHipTwistDeg(frame),
    chestOpenAbs: chestOpenDeg(frame),
    contactRelFrontFoot: contactRelativeToFrontFoot(frame, side),
  }
}

// ── キネティックチェーン（運動連鎖）の時間差 ─────────────

/**
 * 骨盤回転と肩回転のタイムラインからピーク到達の時間差を測る（秒）。
 * 正の値 = 骨盤が肩より先に回っている（正しい運動連鎖）。
 * 負の値 = 肩が先（手打ち気味）。
 */
export function pelvisShoulderLeadSec(
  frames: PoseFrame[], swingFrameIdx: number,
): number | null {
  if (frames.length === 0) return null
  // インパクト前 0.5 秒区間で各角速度を計算
  const win = 15  // フレーム数（≒0.5s @ 30fps）
  const start = Math.max(0, swingFrameIdx - win)
  const end = Math.min(frames.length - 1, swingFrameIdx)
  if (end - start < 4) return null

  let pelvisPeakIdx = start, shoulderPeakIdx = start
  let pelvisPeakRate = 0, shoulderPeakRate = 0
  for (let i = start + 1; i <= end; i++) {
    const dt = frames[i].tSec - frames[i - 1].tSec
    if (dt <= 0) continue
    const hp1 = hipTiltDeg(frames[i - 1])
    const hp2 = hipTiltDeg(frames[i])
    const sh1 = shoulderTiltDeg(frames[i - 1])
    const sh2 = shoulderTiltDeg(frames[i])
    if (hp1 !== null && hp2 !== null) {
      const r = Math.abs(hp2 - hp1) / dt
      if (r > pelvisPeakRate) { pelvisPeakRate = r; pelvisPeakIdx = i }
    }
    if (sh1 !== null && sh2 !== null) {
      const r = Math.abs(sh2 - sh1) / dt
      if (r > shoulderPeakRate) { shoulderPeakRate = r; shoulderPeakIdx = i }
    }
  }
  return frames[shoulderPeakIdx].tSec - frames[pelvisPeakIdx].tSec
}

/**
 * テイクバックの「引き遅れ」を検出。
 * バウンド時刻（ユーザー入力 or 推定）に対し、ラケット（手首）が最大後方位置に
 * 到達した時刻との時間差を返す。負値が大きいほどテイクバック完了が遅れている。
 *
 * シンプル実装：スイング開始前の手首 x 最大点を「最大テイクバック」と見なし、
 * その時刻とスイングピーク（インパクト）の時間差を返す（秒）。
 */
export function takebackCompletionLeadSec(
  frames: PoseFrame[], side: Side, swingFrameIdx: number,
): number | null {
  if (swingFrameIdx < 5) return null
  const start = Math.max(0, swingFrameIdx - 30)
  let maxIdx = start
  let maxBackness = -Infinity
  for (let i = start; i < swingFrameIdx; i++) {
    const w = dominantWrist(frames[i], side)
    if (!w) continue
    // 利き手が右なら x が大きいほど「後ろ」（撮影方向に依存）
    // 絶対値ではなく、スイング開始位置からの相対量で判定
    const backness = side === 'RIGHT' ? w.x : -w.x
    if (backness > maxBackness) { maxBackness = backness; maxIdx = i }
  }
  return frames[swingFrameIdx].tSec - frames[maxIdx].tSec
}

// ── 打点ばらつきの集計 ───────────────────────────────────

export interface ImpactPoint {
  swingIndex: number
  /** 体中心からの相対座標（x: 左右、y: 上下、いずれも正規化）。 */
  relX: number
  relY: number
}

/** スイング毎のインパクト時の打点を体中心相対で記録。 */
export function impactScatter(
  frames: PoseFrame[], swings: SwingEvent[], side: Side,
): ImpactPoint[] {
  const out: ImpactPoint[] = []
  for (const sw of swings) {
    const f = frames[sw.frameIndex]
    const lms = f.landmarks
    if (!lms) continue
    const wrist = side === 'RIGHT' ? lms[LM.RIGHT_WRIST] : lms[LM.LEFT_WRIST]
    // 体中心 = 両肩の中点 → x, 両腰の中点 → y 基準
    const shL = lms[LM.LEFT_SHOULDER], shR = lms[LM.RIGHT_SHOULDER]
    const hpL = lms[LM.LEFT_HIP], hpR = lms[LM.RIGHT_HIP]
    const cx = (shL.x + shR.x + hpL.x + hpR.x) / 4
    const cy = (shL.y + shR.y + hpL.y + hpR.y) / 4
    out.push({
      swingIndex: out.length,
      relX: wrist.x - cx,
      relY: wrist.y - cy,
    })
  }
  return out
}

/** 散らばり（標準偏差）を返す（小さいほど一貫している）。 */
export function impactDispersion(points: ImpactPoint[]): { sdX: number; sdY: number } {
  if (points.length === 0) return { sdX: 0, sdY: 0 }
  const mx = points.reduce((a, p) => a + p.relX, 0) / points.length
  const my = points.reduce((a, p) => a + p.relY, 0) / points.length
  const vx = points.reduce((a, p) => a + (p.relX - mx) ** 2, 0) / points.length
  const vy = points.reduce((a, p) => a + (p.relY - my) ** 2, 0) / points.length
  return { sdX: Math.sqrt(vx), sdY: Math.sqrt(vy) }
}
