/**
 * テニスボール自動検出（HSV 色フィルタ + 連結成分）。
 *
 * 動画 1 フレームを Canvas に描き、テニスボールの「鮮やかな黄緑」を
 * HSV 空間で抽出。連結成分のうち円形度・サイズ・前回位置近接性で
 * もっともボールらしい候補を 1 つ返す。
 *
 * 厳密な物体検出（YOLO）には及ばないが、コートで撮った素直な映像なら
 * 多くのフレームで使い物になる。手動タップのアシストとして用いる前提。
 */

import type { Point2D } from './homography'

export interface DetectOpts {
  /** ヒント：前回の検出位置（0..1）。近い候補を優先する。 */
  hint?: Point2D
  /** ヒント信頼度（0..1）。大きいほど hint 周辺に強くバイアス。 */
  hintWeight?: number
  /** 検出に使うフレーム短辺ピクセル数（速度↔精度トレードオフ）。 */
  maxSide?: number
}

export interface DetectResult {
  /** 動画上の 0..1 座標。 */
  pos: Point2D
  /** スコア（高いほど信頼）。 */
  score: number
  /** 候補のピクセル半径（参考）。 */
  radiusPx: number
}

/** メインエントリ：HTMLVideoElement の現フレームからボール候補を 1 つ返す。 */
export function detectBallInFrame(
  video: HTMLVideoElement, opts: DetectOpts = {},
): DetectResult | null {
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw || !vh) return null
  const maxSide = opts.maxSide ?? 320
  const scale = Math.min(1, maxSide / Math.min(vw, vh))
  const w = Math.round(vw * scale), h = Math.round(vh * scale)
  const canvas = getCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  return detectBall(img, opts)
}

/** ImageData から検出。テスト・前処理のため分離。 */
export function detectBall(img: ImageData, opts: DetectOpts = {}): DetectResult | null {
  const { width: w, height: h, data } = img
  // 1) HSV マスク（テニスボール：H ≈ 40..85, S > 0.30, V > 0.45）
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
      const [hue, s, v] = rgbToHsv(r, g, b)
      // 鮮やかな黄緑
      if (hue >= 35 && hue <= 90 && s >= 0.30 && v >= 0.45) {
        mask[y * w + x] = 1
      }
    }
  }

  // 2) 軽い morphological opening（3x3 erode → 3x3 dilate） — 1 px ノイズ除去
  const eroded = erode3(mask, w, h)
  const opened = dilate3(eroded, w, h)

  // 3) 連結成分ラベリング（4 近傍）＋ 統計
  const labels = new Int32Array(w * h)
  const components: Array<{ id: number; n: number; sx: number; sy: number; minX: number; maxX: number; minY: number; maxY: number }> = []
  let nextId = 1
  const queue: number[] = []
  for (let p = 0; p < w * h; p++) {
    if (opened[p] === 0 || labels[p] !== 0) continue
    const id = nextId++
    let n = 0, sx = 0, sy = 0
    let minX = w, maxX = 0, minY = h, maxY = 0
    queue.length = 0
    queue.push(p); labels[p] = id
    while (queue.length > 0) {
      const q = queue.pop()!
      const qx = q % w, qy = (q - qx) / w
      n++; sx += qx; sy += qy
      if (qx < minX) minX = qx; if (qx > maxX) maxX = qx
      if (qy < minY) minY = qy; if (qy > maxY) maxY = qy
      const neigh = [q - 1, q + 1, q - w, q + w]
      const xs = [qx - 1, qx + 1, qx, qx]
      const ys = [qy, qy, qy - 1, qy + 1]
      for (let k = 0; k < 4; k++) {
        const nx = xs[k], ny = ys[k], np = neigh[k]
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        if (opened[np] === 0 || labels[np] !== 0) continue
        labels[np] = id
        queue.push(np)
      }
    }
    components.push({ id, n, sx, sy, minX, maxX, minY, maxY })
  }

  // 4) 候補のスコアリング
  //    - サイズ：画面短辺の 0.5% 〜 4% くらいが妥当
  //    - 円形度（縦横比、bbox 充填率）
  //    - hint との距離（あれば）
  const shortSide = Math.min(w, h)
  const minN = (shortSide * 0.5 / 100) ** 2 * Math.PI * 0.5
  const maxN = (shortSide * 4 / 100) ** 2 * Math.PI * 2
  const hint = opts.hint
  const hintW = opts.hintWeight ?? 0.6

  let best: DetectResult | null = null
  let bestScore = 0
  for (const c of components) {
    if (c.n < minN || c.n > maxN) continue
    const bw = c.maxX - c.minX + 1
    const bh = c.maxY - c.minY + 1
    const aspect = Math.min(bw, bh) / Math.max(bw, bh)   // 1 = 真円
    const fill = c.n / (bw * bh)                          // bbox 内の充填率（円なら ~0.78）
    const cx = c.sx / c.n, cy = c.sy / c.n
    const radiusPx = Math.sqrt(c.n / Math.PI)
    let score = aspect * 1.5 + Math.min(1, fill / 0.78)
    // サイズ近接ボーナス（画面短辺 1.5% 程度が最良）
    const idealR = shortSide * 0.015
    const sizeScore = 1 - Math.min(1, Math.abs(radiusPx - idealR) / idealR)
    score += sizeScore * 0.6
    if (hint) {
      const hx = hint[0] * w, hy = hint[1] * h
      const d = Math.hypot(cx - hx, cy - hy) / shortSide
      const prox = Math.max(0, 1 - d * 3)   // 33% 以内なら強いボーナス
      score += prox * hintW * 2
    }
    if (score > bestScore) {
      bestScore = score
      best = { pos: [cx / w, cy / h], score, radiusPx }
    }
  }
  return best
}

// ── ユーティリティ ──
let cachedCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
function getCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (!cachedCanvas) {
    cachedCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : document.createElement('canvas')
  }
  const c = cachedCanvas as HTMLCanvasElement
  c.width = w; c.height = h
  return cachedCanvas
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  const v = max
  return [h, s, v]
}

function erode3(src: Uint8Array, w: number, h: number): Uint8Array {
  const dst = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (src[i] === 0) { dst[i] = 0; continue }
      if (src[i - 1] && src[i + 1] && src[i - w] && src[i + w]) dst[i] = 1
    }
  }
  return dst
}
function dilate3(src: Uint8Array, w: number, h: number): Uint8Array {
  const dst = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (src[i]) { dst[i] = 1; continue }
      const has = (
        (x > 0 && src[i - 1]) ||
        (x < w - 1 && src[i + 1]) ||
        (y > 0 && src[i - w]) ||
        (y < h - 1 && src[i + w])
      )
      if (has) dst[i] = 1
    }
  }
  return dst
}
