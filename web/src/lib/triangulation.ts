/**
 * 2 視点の三角測量（triangulation）。
 *
 * 各カメラの「動画 4 隅 → 実コート (X,Z) 平面」ホモグラフィから
 * 仮定焦点距離を使って R, t, K を推定し、画像上のタップ点を 3D 光線として
 * 復元する。両カメラの光線の最近接点を取ることで、ボールの (X, Y, Z) を
 * 高さ Y も含めて立体的に推定する。
 *
 * 注意：
 *  - スマホの内部パラメータ K（焦点距離）は厳密には未知。
 *    一般的なスマホ後面カメラの画角 ≈ 65–75° を仮定する。
 *  - 4 隅キャリブレーションは平面上の点なので、純粋な PnP には縮退しないが、
 *    平面ホモグラフィ分解（Zhang 法）でカメラ姿勢を回復できる。
 *  - 精度はあくまで「視覚的に妥当」な範囲（±数十 cm）。
 *    プロのホークアイ（mm 級）ではない点をUI側で明示する。
 */

import { applyHomography, invertHomography, type Mat3, type Point2D } from './homography'

export type Vec3 = [number, number, number]
type Mat3x3 = [Vec3, Vec3, Vec3]

/** カメラの内部・外部パラメータ。 */
export interface CameraParams {
  /** カメラ位置（ワールド座標、メートル）。 */
  position: Vec3
  /** 回転行列 R（ワールド→カメラ）。 */
  R: Mat3x3
  /** 内部行列 K（3x3）。 */
  K: Mat3x3
  /** 画像幅・高さ（ピクセル相当、正規化 0..1 で扱うので 1）。 */
  imageW: number
  imageH: number
}

/**
 * 動画 4 隅（0..1 正規化）と実コート 4 隅から、カメラ姿勢 (R, t, K) を推定。
 *
 * @param videoCorners 正規化座標 (0..1) で 4 隅。
 * @param courtCorners 対応する実コート (X, Z) [m]。
 * @param fovDeg 仮定する対角画角（既定 70°）。
 */
export function recoverCameraFromCorners(
  videoCorners: Point2D[],
  courtCorners: Point2D[],
  fovDeg = 70,
): CameraParams | null {
  if (videoCorners.length !== 4 || courtCorners.length !== 4) return null

  // 画像座標を「中心 0、スケール 1」に正規化したものを使うと K がシンプルになる。
  // 焦点距離 f は対角を 2 として f = 1 / tan(fov/2)。
  const f = 1 / Math.tan((fovDeg * Math.PI / 180) / 2)
  const K: Mat3x3 = [
    [f, 0, 0],
    [0, f, 0],
    [0, 0, 1],
  ]

  // 1) 「正規化画像 → コート」ホモグラフィを構築
  //    正規化画像座標：cx = (u - 0.5) * 2, cy = (v - 0.5) * 2 * aspect
  //    （対角を 2 にするため、ここでは単に [-1, 1] スケーリングを採用）
  const normCorners: Point2D[] = videoCorners.map(([u, v]) => [
    (u - 0.5) * 2,
    (v - 0.5) * 2,
  ])

  // image_norm → court の H
  const H_img2court = computeH(normCorners, courtCorners)
  if (!H_img2court) return null
  const H_court2img = invertHomography(H_img2court)
  if (!H_court2img) return null

  // 2) Zhang 法でカメラ外部パラメータを復元
  //    H_court2img の列を h1, h2, h3 とする。
  //    [r1 r3 t] = lambda * K^-1 * H（court の x→r1, z→r3 と対応する想定）
  //    ただし court 系は (X, Z) で平面なので、r2（Y 軸＝高さ方向）は r3 × r1 で算出。
  const h1: Vec3 = [H_court2img[0], H_court2img[3], H_court2img[6]]
  const h2: Vec3 = [H_court2img[1], H_court2img[4], H_court2img[7]]
  const h3: Vec3 = [H_court2img[2], H_court2img[5], H_court2img[8]]

  const Kinv = invert3x3(K)
  const r1raw = matVec(Kinv, h1)
  const r3raw = matVec(Kinv, h2)
  const traw = matVec(Kinv, h3)

  const lambda = 1 / Math.sqrt(norm(r1raw) * norm(r3raw))
  const sign = traw[2] > 0 ? 1 : -1   // カメラの前方が +z になるよう向きを決定
  const s = lambda * sign

  let r1 = scale(r1raw, s)
  let r3 = scale(r3raw, s)
  const t = scale(traw, s)
  // 直交化（小さい誤差を吸収）
  r1 = unit(r1)
  r3 = unit(sub(r3, scale(r1, dot(r3, r1))))
  const r2 = cross(r3, r1)

  // R は (X, Y, Z) ワールド → カメラ。X=r1 列、Y=r2 列、Z=r3 列。
  // ただしカメラ位置 C は -R^T t（標準的な PnP の式）。
  const R: Mat3x3 = [
    [r1[0], r2[0], r3[0]],
    [r1[1], r2[1], r3[1]],
    [r1[2], r2[2], r3[2]],
  ]
  // C = -R^T * t
  const Rt = transpose(R)
  const C = scale(matVec(Rt, t), -1)

  return { position: C, R, K, imageW: 1, imageH: 1 }
}

/**
 * 画像上のタップ点 (u, v ∈ 0..1) からカメラ中心を通る 3D 光線を生成。
 * 返り値の direction はワールド系の正規化方向ベクトル。
 */
export function pixelToRay(cam: CameraParams, u: number, v: number): { origin: Vec3; dir: Vec3 } {
  // 同じ正規化（-1..1）にする
  const x = (u - 0.5) * 2
  const y = (v - 0.5) * 2
  // カメラ座標系の方向 d_cam = K^-1 [x, y, 1]
  const Kinv = invert3x3(cam.K)
  const dCam = matVec(Kinv, [x, y, 1])
  // ワールド系：d_world = R^T * d_cam
  const Rt = transpose(cam.R)
  const dWorld = unit(matVec(Rt, dCam))
  return { origin: cam.position, dir: dWorld }
}

/**
 * 2 本の 3D 光線の最近接点（skew ray の最小距離中点）を計算。
 * 戻り値：両光線にもっとも近い 1 点と、両光線間のミス距離（gap）。
 */
export function intersectRays(
  a: { origin: Vec3; dir: Vec3 },
  b: { origin: Vec3; dir: Vec3 },
): { point: Vec3; gap: number } {
  const w0 = sub(a.origin, b.origin)
  const A = dot(a.dir, a.dir)
  const B = dot(a.dir, b.dir)
  const C = dot(b.dir, b.dir)
  const D = dot(a.dir, w0)
  const E = dot(b.dir, w0)
  const denom = A * C - B * B
  if (Math.abs(denom) < 1e-9) {
    // 平行 → 中点で代用
    return { point: scale(add(a.origin, b.origin), 0.5), gap: Infinity }
  }
  const sc = (B * E - C * D) / denom
  const tc = (A * E - B * D) / denom
  const pa = add(a.origin, scale(a.dir, sc))
  const pb = add(b.origin, scale(b.dir, tc))
  const mid = scale(add(pa, pb), 0.5)
  return { point: mid, gap: dist(pa, pb) }
}

/**
 * 2 視点からボール 3D 位置を一発で求める高レベル関数。
 *
 * @param tapBack 後方カメラの動画上タップ (0..1 正規化)
 * @param tapSide サイドカメラの動画上タップ
 */
export function triangulateBall(
  camBack: CameraParams, tapBack: Point2D,
  camSide: CameraParams, tapSide: Point2D,
): { pos: Vec3; gap: number } {
  const rayBack = pixelToRay(camBack, tapBack[0], tapBack[1])
  const raySide = pixelToRay(camSide, tapSide[0], tapSide[1])
  const { point, gap } = intersectRays(rayBack, raySide)
  return { pos: point, gap }
}

/** 単視点フォールバック：地面（Y=0）に投影したタップ位置（ボールが地面にある前提）。 */
export function projectToGround(H_img2court: Mat3, u: number, v: number): Vec3 {
  const [x, z] = applyHomography(H_img2court, u, v)
  return [x, 0, z]
}

// ── ベクトル / 行列 ヘルパ ─────────────────────────────
function computeH(src: Point2D[], dst: Point2D[]): Mat3 | null {
  // homography.ts の computeHomography に渡すだけ
  // 循環依存を避けるため、ここで再エクスポートしない
  // （applyHomography/invertHomography は既に import 済み）
  return computeHomographyLocal(src, dst)
}

// computeHomography をローカルで持つ（既存実装と同じアルゴリズム）
function computeHomographyLocal(src: Point2D[], dst: Point2D[]): Mat3 | null {
  if (src.length < 4 || dst.length < 4) return null
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = solveLinear8x8(A, b)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] as Mat3
}

function solveLinear8x8(A: number[][], b: number[]): number[] | null {
  const n = 8
  const m: number[][] = A.map((row, i) => [...row, b[i]])
  for (let i = 0; i < n; i++) {
    let pivot = i; let maxAbs = Math.abs(m[i][i])
    for (let r = i + 1; r < n; r++) {
      const abs = Math.abs(m[r][i])
      if (abs > maxAbs) { maxAbs = abs; pivot = r }
    }
    if (maxAbs < 1e-12) return null
    if (pivot !== i) { [m[i], m[pivot]] = [m[pivot], m[i]] }
    const piv = m[i][i]
    for (let c = i; c <= n; c++) m[i][c] /= piv
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = m[r][i]; if (f === 0) continue
      for (let c = i; c <= n; c++) m[r][c] -= f * m[i][c]
    }
  }
  return m.map(row => row[n])
}

function invert3x3(M: Mat3x3): Mat3x3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = M
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-12) {
    // 異常系：単位行列を返して落ちないようにする
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  }
  const inv = 1 / det
  return [
    [(e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
    [(f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
    [(d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv],
  ]
}
function transpose(M: Mat3x3): Mat3x3 {
  return [
    [M[0][0], M[1][0], M[2][0]],
    [M[0][1], M[1][1], M[2][1]],
    [M[0][2], M[1][2], M[2][2]],
  ]
}
function matVec(M: Mat3x3, v: Vec3): Vec3 {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ]
}
const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const unit = (v: Vec3): Vec3 => {
  const n = norm(v); return n < 1e-12 ? v : [v[0] / n, v[1] / n, v[2] / n]
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
