/**
 * コートライン自動検出（白線 → Hough 変換 → 4 隅推定）。
 *
 * 後方（ベースライン裏）からの映像を想定：
 *  1. フレームを縮小し「白くて彩度が低い」画素をマスク（コートの白線）
 *  2. Hough 変換で直線を抽出
 *  3. ほぼ水平な線（ベースライン・サービスライン・ネット帯）と
 *     斜めに収束する線（サイドライン）に分類
 *  4. 最上・最下の水平線 × 最左・最右のサイドラインの交点 = コート 4 隅
 *  5. 凸性・台形性（奥が狭い）を検証し、信頼度を付けて返す
 *
 * 失敗時は null（UI 側で手動タップにフォールバック）。
 */

import type { Point2D } from './homography'

export interface CourtDetection {
  /** 0..1 正規化のコート 4 隅。順序：左下 → 左上 → 右上 → 右下。 */
  corners: Point2D[]
  /** 0..1。0.3 以上でおおむね信頼できる。 */
  confidence: number
}

interface HoughLine {
  /** ラジアン。x·cosθ + y·sinθ = ρ */
  theta: number
  rho: number
  votes: number
}

/** HTMLVideoElement の現フレームから検出。 */
export function detectCourtFromVideo(
  video: HTMLVideoElement, maxSide = 480,
): CourtDetection | null {
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw || !vh) return null
  const scale = Math.min(1, maxSide / Math.min(vw, vh))
  const w = Math.round(vw * scale), h = Math.round(vh * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  return detectCourt(img)
}

export function detectCourt(img: ImageData): CourtDetection | null {
  const { width: w, height: h, data } = img

  // ── 1) 白線マスク ──
  // 白線：明るい・彩度が低い。コート面（青/緑）や芝とのコントラストで浮く。
  const maskPts: Array<[number, number]> = []
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      if (mx > 150 && mx - mn < 65) {
        maskPts.push([x, y])
      }
    }
  }
  // 白すぎる映像（全面白）や白が無い映像は不可
  if (maskPts.length < 200 || maskPts.length > w * h * 0.25) return null

  // サンプリング上限（性能確保）
  const MAX_PTS = 16000
  const step = Math.max(1, Math.floor(maskPts.length / MAX_PTS))
  const pts = step > 1 ? maskPts.filter((_, i) => i % step === 0) : maskPts

  // ── 2) Hough 変換 ──
  const THETA_STEPS = 90          // 2° 刻み
  const RHO_RES = 2
  const diag = Math.hypot(w, h)
  const rhoBins = Math.ceil((diag * 2) / RHO_RES)
  const acc = new Int32Array(THETA_STEPS * rhoBins)
  const sinT = new Float32Array(THETA_STEPS)
  const cosT = new Float32Array(THETA_STEPS)
  for (let t = 0; t < THETA_STEPS; t++) {
    const th = (t * Math.PI) / THETA_STEPS
    sinT[t] = Math.sin(th)
    cosT[t] = Math.cos(th)
  }
  for (const [x, y] of pts) {
    for (let t = 0; t < THETA_STEPS; t++) {
      const rho = x * cosT[t] + y * sinT[t]
      const bin = Math.round((rho + diag) / RHO_RES)
      if (bin >= 0 && bin < rhoBins) acc[t * rhoBins + bin]++
    }
  }

  // ── 3) ピーク抽出（非極大抑制つき） ──
  let maxVote = 0
  for (let i = 0; i < acc.length; i++) if (acc[i] > maxVote) maxVote = acc[i]
  if (maxVote < 25) return null
  const thresh = Math.max(25, maxVote * 0.22)

  const rawPeaks: HoughLine[] = []
  for (let t = 0; t < THETA_STEPS; t++) {
    for (let b = 0; b < rhoBins; b++) {
      const v = acc[t * rhoBins + b]
      if (v < thresh) continue
      rawPeaks.push({
        theta: (t * Math.PI) / THETA_STEPS,
        rho: b * RHO_RES - diag,
        votes: v,
      })
    }
  }
  rawPeaks.sort((a, b) => b.votes - a.votes)
  // NMS：θ 8° 以内 & ρ 18px 以内の弱い線は捨てる
  const lines: HoughLine[] = []
  for (const p of rawPeaks) {
    let dup = false
    for (const q of lines) {
      const dTheta = Math.abs(angleDiff(p.theta, q.theta))
      if (dTheta < (8 * Math.PI) / 180 && Math.abs(p.rho - q.rho) < 18) { dup = true; break }
    }
    if (!dup) lines.push(p)
    if (lines.length >= 14) break
  }

  // ── 4) 水平線 / サイドライン候補に分類 ──
  const HORIZ_TOL = (22 * Math.PI) / 180
  const horizontals = lines.filter(l => Math.abs(angleDiff(l.theta, Math.PI / 2)) < HORIZ_TOL)
  const sidelines = lines.filter(l => {
    const d = Math.abs(angleDiff(l.theta, Math.PI / 2))
    return d >= HORIZ_TOL && d < (80 * Math.PI) / 180   // 完全垂直（センターライン誤検出）は除外
  })
  if (horizontals.length < 2 || sidelines.length < 2) return null

  // 水平線：画面中央 x=w/2 での y で並べ、最上（奥ベースライン）と最下（手前ベースライン）
  const yAtCx = (l: HoughLine) => (l.rho - (w / 2) * Math.cos(l.theta)) / Math.max(1e-6, Math.sin(l.theta))
  const sortedH = [...horizontals].sort((a, b) => yAtCx(a) - yAtCx(b))
  const farBase = sortedH[0]
  const nearBase = sortedH[sortedH.length - 1]
  if (yAtCx(nearBase) - yAtCx(farBase) < h * 0.18) return null   // 縦に十分離れていない

  // サイドライン：y = 0.55h での x で並べ、最左と最右
  const xAtMy = (l: HoughLine) => (l.rho - 0.55 * h * Math.sin(l.theta)) / Math.max(1e-6, Math.cos(l.theta))
  const sortedS = [...sidelines].sort((a, b) => xAtMy(a) - xAtMy(b))
  const leftLine = sortedS[0]
  const rightLine = sortedS[sortedS.length - 1]
  if (xAtMy(rightLine) - xAtMy(leftLine) < w * 0.25) return null

  // ── 5) 交点 = 4 隅 ──
  const bl = intersect(nearBase, leftLine)
  const tl = intersect(farBase, leftLine)
  const tr = intersect(farBase, rightLine)
  const br = intersect(nearBase, rightLine)
  if (!bl || !tl || !tr || !br) return null

  const corners: Point2D[] = [bl, tl, tr, br].map(([x, y]) => [x / w, y / h] as Point2D)
  // 検証：すべて画面付近 / 凸 / 奥（上）の幅 ≤ 手前（下）の幅 × 1.15
  for (const [x, y] of corners) {
    if (x < -0.25 || x > 1.25 || y < -0.25 || y > 1.25) return null
  }
  const topW = corners[2][0] - corners[1][0]
  const botW = corners[3][0] - corners[0][0]
  if (botW <= 0 || topW <= 0) return null
  if (topW > botW * 1.15) return null   // 後方からの映像なら奥は狭いはず

  const votesAvg = (farBase.votes + nearBase.votes + leftLine.votes + rightLine.votes) / 4
  const confidence = Math.min(1, votesAvg / maxVote)

  return { corners, confidence }
}

function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI / 2) d -= Math.PI
  while (d < -Math.PI / 2) d += Math.PI
  return d
}

function intersect(l1: HoughLine, l2: HoughLine): [number, number] | null {
  const det = Math.sin(l2.theta - l1.theta)
  if (Math.abs(det) < 1e-6) return null
  const x = (l1.rho * Math.sin(l2.theta) - l2.rho * Math.sin(l1.theta)) / det
  const y = (l2.rho * Math.cos(l1.theta) - l1.rho * Math.cos(l2.theta)) / det
  return [x, y]
}
