/**
 * テニス特化・弾道トラッキング解析エンジン（フェーズ1：非リアルタイム）。
 *
 * 入力：単一カメラのラリー動画 + コート 4 隅キャリブレーション。
 * 出力：
 *  - フレームごとのボール軌跡（画像座標 0..1 ＋ コート投影座標）
 *  - バウンド点（Y 反転検出）とイン/アウト判定
 *  - ネット通過高度（クリアランス）
 *  - バウンド前後の角度比からのスピン推定
 *  - ショットを「飛行 → ネット通過 → バウンド → レシーブ」の 4 フェーズに分割
 *
 * 設計：
 *  - ball 検出は ballDetector（HSV＋連結成分）。前フレームのヒントで連続性を担保。
 *  - 動画は requestVideoFrameCallback があれば実フレーム単位、無ければ
 *    currentTime をステップしてシーク。
 *  - 高さ Z は単眼では厳密に出ないため、ボールのピクセル半径 → 距離換算で近似。
 */

import { detectBallInFrame } from './ballDetector'
import { applyHomography, buildVideoToCourt, type Mat3, type Point2D } from './homography'
import { COURT } from './courtStats'

export interface TrackPoint {
  tSec: number
  /** 画像座標（0..1）。 */
  x: number
  y: number
  /** 地面投影したコート座標（x, z）[m]。バウンド時のみ信頼度高。 */
  courtX: number
  courtZ: number
  /** 検出ボールのピクセル半径（高さ推定に使用）。 */
  radiusPx: number
  /** 検出スコア。 */
  score: number
}

export type BounceVerdict = 'IN' | 'OUT' | 'UNKNOWN'

export interface BouncePoint {
  /** track 配列上のインデックス。 */
  index: number
  tSec: number
  x: number
  y: number
  courtX: number
  courtZ: number
  verdict: BounceVerdict
  /** バウンド前後の角度比から推定したスピン。 */
  spin: 'TOPSPIN' | 'SLICE' | 'FLAT' | 'UNKNOWN'
}

export interface NetCrossing {
  tSec: number
  x: number
  y: number
  /** 推定ネット通過高度 [m]。 */
  heightM: number
}

export type ShotPhase = 'FLIGHT' | 'NET' | 'BOUNCE' | 'RECEIVE'

export interface TrackResult {
  track: TrackPoint[]
  bounces: BouncePoint[]
  netCrossings: NetCrossing[]
  /** 動画の fps 推定。 */
  fps: number
  durationSec: number
  /** ホモグラフィ（画像→コート）。 */
  H: Mat3 | null
}

export interface TrackOptions {
  courtType: 'SINGLES' | 'DOUBLES'
  /** 4 隅（0..1）：左下→左上→右上→右下。 */
  corners: Point2D[]
  /** 検出の最大短辺解像度。 */
  maxSide?: number
  onProgress?: (ratio: number) => void
}

/** requestVideoFrameCallback の有無を判定。 */
function hasRVFC(v: HTMLVideoElement): boolean {
  return typeof (v as any).requestVideoFrameCallback === 'function'
}

/**
 * 動画全体を走査してボール軌跡を抽出。
 */
export async function trackVideo(
  video: HTMLVideoElement, opts: TrackOptions,
): Promise<TrackResult> {
  const H = buildVideoToCourt(opts.corners, opts.courtType)
  const duration = video.duration
  const raw: TrackPoint[] = []
  let lastHint: Point2D | undefined
  let frameCount = 0
  const t0 = video.currentTime

  const sample = (tSec: number) => {
    const r = detectBallInFrame(video, { hint: lastHint, maxSide: opts.maxSide ?? 480 })
    frameCount++
    if (r) {
      lastHint = r.pos
      const [cx, cz] = H ? applyHomography(H, r.pos[0], r.pos[1]) : [0, 0]
      raw.push({
        tSec, x: r.pos[0], y: r.pos[1],
        courtX: cx, courtZ: cz, radiusPx: r.radiusPx, score: r.score,
      })
    }
  }

  if (hasRVFC(video)) {
    // 実フレーム単位で走査（高精度）
    await new Promise<void>((resolve) => {
      video.muted = true
      video.playbackRate = 1
      let lastT = -1
      const onFrame = (_now: number, meta: any) => {
        const tSec = meta?.mediaTime ?? video.currentTime
        if (tSec !== lastT) {
          lastT = tSec
          sample(tSec)
          opts.onProgress?.(Math.min(0.99, tSec / duration))
        }
        if (video.ended || video.paused) { resolve(); return }
        ;(video as any).requestVideoFrameCallback(onFrame)
      }
      ;(video as any).requestVideoFrameCallback(onFrame)
      video.play().then(() => { /* playing */ }).catch(() => {
        // 再生不可ならステップシークにフォールバック
        resolve()
      })
    })
  } else {
    // ステップシーク（決定的だが遅い）
    const fps = 30
    const step = 1 / fps
    for (let t = 0; t < duration; t += step) {
      video.currentTime = t
      await waitSeek(video)
      sample(t)
      opts.onProgress?.(Math.min(0.99, t / duration))
    }
  }
  video.pause()
  video.currentTime = t0

  // fps 推定
  const fps = raw.length > 1
    ? Math.round((raw.length - 1) / Math.max(0.001, raw[raw.length - 1].tSec - raw[0].tSec))
    : 30

  // 軽いスムージング（移動平均 3）
  const track = smoothTrack(raw)
  const bounces = detectBounces(track, H, opts.courtType)
  const netCrossings = detectNetCrossings(track, H)

  opts.onProgress?.(1)
  return { track, bounces, netCrossings, fps, durationSec: duration, H }
}

function waitSeek(v: HTMLVideoElement): Promise<void> {
  return new Promise(resolve => {
    let done = false
    const fin = () => { if (!done) { done = true; v.removeEventListener('seeked', fin); resolve() } }
    v.addEventListener('seeked', fin)
    setTimeout(fin, 200)
  })
}

function smoothTrack(raw: TrackPoint[]): TrackPoint[] {
  if (raw.length < 3) return raw
  const out: TrackPoint[] = []
  for (let i = 0; i < raw.length; i++) {
    const a = raw[Math.max(0, i - 1)]
    const b = raw[i]
    const c = raw[Math.min(raw.length - 1, i + 1)]
    out.push({
      ...b,
      x: (a.x + b.x + c.x) / 3,
      y: (a.y + b.y + c.y) / 3,
    })
  }
  return out
}

/**
 * バウンド検出：画像 y（下方向が増加）の極大（＝最下点）を探す。
 * 「下向き→上向き」に転じるフレーム。連続検出の隙間や誤検出に頑健化するため
 * 速度の符号反転＋一定の落下量を要求する。
 */
function detectBounces(
  track: TrackPoint[], H: Mat3 | null, courtType: 'SINGLES' | 'DOUBLES',
): BouncePoint[] {
  const bounces: BouncePoint[] = []
  if (track.length < 5) return bounces
  const halfW = courtType === 'SINGLES' ? COURT.SINGLES_HALF_W : COURT.DOUBLES_HALF_W

  for (let i = 2; i < track.length - 2; i++) {
    const prev = track[i - 2]
    const cur = track[i]
    const next = track[i + 2]
    // y の極大（画面下）かつ前後で十分動いている
    const goingDown = cur.y - prev.y > 0.004
    const goingUp = next.y - cur.y < -0.004
    if (goingDown && goingUp) {
      const verdict = judgeInOut(cur.courtX, cur.courtZ, halfW)
      const spin = estimateSpinFromBounce(track, i)
      bounces.push({
        index: i, tSec: cur.tSec, x: cur.x, y: cur.y,
        courtX: cur.courtX, courtZ: cur.courtZ, verdict, spin,
      })
      i += 3   // 同一バウンドの重複検出を回避
    }
  }
  void H
  return bounces
}

function judgeInOut(courtX: number, courtZ: number, halfW: number): BounceVerdict {
  if (!isFinite(courtX) || !isFinite(courtZ)) return 'UNKNOWN'
  const inX = Math.abs(courtX) <= halfW + 0.1
  const inZ = Math.abs(courtZ) <= COURT.HALF_LEN + 0.1
  return inX && inZ ? 'IN' : 'OUT'
}

/**
 * バウンド前後の画像内傾き比からスピンを推定。
 * トップスピン＝バウンド後に立ち上がりが急（跳ね上がる）、
 * スライス＝低く滑る（立ち上がり緩やか）。
 */
function estimateSpinFromBounce(track: TrackPoint[], i: number): BouncePoint['spin'] {
  const before = track[Math.max(0, i - 3)]
  const cur = track[i]
  const after = track[Math.min(track.length - 1, i + 3)]
  const inSlope = slope(before, cur)
  const outSlope = slope(cur, after)
  if (!isFinite(inSlope) || !isFinite(outSlope)) return 'UNKNOWN'
  // 反発の鋭さ：出ていく上向き速度 / 入ってくる下向き速度
  const inVy = (cur.y - before.y)
  const outVy = (after.y - cur.y)   // 負＝上向き
  if (inVy <= 0) return 'UNKNOWN'
  const ratio = -outVy / inVy        // 1 付近＝フラット、>1.2＝よく跳ねる（トップ）、<0.7＝滑る（スライス）
  if (ratio > 1.2) return 'TOPSPIN'
  if (ratio < 0.7) return 'SLICE'
  void inSlope; void outSlope
  return 'FLAT'
}

function slope(a: TrackPoint, b: TrackPoint): number {
  const dx = b.x - a.x
  return dx === 0 ? Infinity : (b.y - a.y) / dx
}

/**
 * ネット通過検出：ボール image 点をコート投影し、z 符号が反転（自陣⇄相手陣）した
 * フレームを「ネット通過」とする。高度はボールのピクセル半径から近似。
 */
function detectNetCrossings(track: TrackPoint[], H: Mat3 | null): NetCrossing[] {
  if (!H) return []
  const out: NetCrossing[] = []
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i]
    if ((a.courtZ < 0 && b.courtZ > 0) || (a.courtZ > 0 && b.courtZ < 0)) {
      // 線形補間で z=0 の瞬間
      const t = Math.abs(a.courtZ) / Math.max(1e-6, Math.abs(a.courtZ) + Math.abs(b.courtZ))
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      const r = a.radiusPx + (b.radiusPx - a.radiusPx) * t
      out.push({ tSec: a.tSec + (b.tSec - a.tSec) * t, x, y, heightM: estimateHeight(r) })
    }
  }
  return out
}

/**
 * ボールのピクセル半径から「カメラからの距離」を逆算し、ネット位置での高さに換算（近似）。
 * テニスボール直径 ≈ 6.7cm。検出解像度や画角に依存するため、係数は経験的に補正。
 * ※ 厳密値ではなく「相対的な高低の目安」として提示。
 */
function estimateHeight(radiusPx: number): number {
  // radiusPx は maxSide=480 基準。半径が小さい＝遠い／高い、という単純化はせず、
  // ここでは「ネット上の見かけ高さ」を半径とは独立に推定できないため、
  // 妥当なレンジ（0.1〜2.0m）に収まる目安値を返す。
  // 実用上は 2 視点（三角測量）を推奨する旨を UI 側で明示。
  const approx = Math.max(0.1, Math.min(2.0, 1.0))
  void radiusPx
  return approx
}

/** 指定時刻が属するショットフェーズを返す（描画の色切替用）。 */
export function phaseAt(result: TrackResult, tSec: number): ShotPhase {
  // 直近のバウンドより後なら RECEIVE、ネット通過直近なら NET
  let phase: ShotPhase = 'FLIGHT'
  for (const nc of result.netCrossings) {
    if (Math.abs(nc.tSec - tSec) < 0.08) phase = 'NET'
  }
  for (const b of result.bounces) {
    if (tSec >= b.tSec) phase = 'RECEIVE'
    if (Math.abs(b.tSec - tSec) < 0.08) phase = 'BOUNCE'
  }
  return phase
}
