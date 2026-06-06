/**
 * 平面ホモグラフィ（projective transform）。
 *
 * 4 点ペア（src[4], dst[4]）から 3x3 のホモグラフィ行列 H を計算し、
 * 任意の点 (x, y) を変換する関数を提供する。
 *
 * 用途：
 *  - 試合動画の中の 4 つのコート角点（src）と、実コート寸法での 4 つの位置（dst）から H を求める
 *  - 動画内の任意の点（プレイヤー足元、ボール着地）を実コート座標に変換
 *  - 逆も同様（オーバーレイ描画用）
 */

export type Point2D = [number, number]
export type Mat3 = [number, number, number, number, number, number, number, number, number]

/**
 * DLT（Direct Linear Transform）で 4 点対応からホモグラフィを計算。
 *
 * 8x9 の同次線形系を解くことになるが、4 点なら拡張係数行列が縮退するので
 * 8 変数の Ax=b 系として正規方程式で直接解く。
 */
export function computeHomography(src: Point2D[], dst: Point2D[]): Mat3 | null {
  if (src.length < 4 || dst.length < 4) return null
  // h33 = 1 と固定し、8 変数の連立方程式を立てる
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
  // 8x8 線形系を解く
  const h = solveLinear8x8(A, b)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] as Mat3
}

/** 点 (x, y) にホモグラフィを適用。 */
export function applyHomography(H: Mat3, x: number, y: number): Point2D {
  const u = H[0] * x + H[1] * y + H[2]
  const v = H[3] * x + H[4] * y + H[5]
  const w = H[6] * x + H[7] * y + H[8]
  if (w === 0) return [0, 0]
  return [u / w, v / w]
}

/** 逆行列。 */
export function invertHomography(H: Mat3): Mat3 | null {
  const m = H
  const det =
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  if (Math.abs(det) < 1e-10) return null
  const invDet = 1 / det
  return [
    (m[4] * m[8] - m[5] * m[7]) * invDet,
    (m[2] * m[7] - m[1] * m[8]) * invDet,
    (m[1] * m[5] - m[2] * m[4]) * invDet,
    (m[5] * m[6] - m[3] * m[8]) * invDet,
    (m[0] * m[8] - m[2] * m[6]) * invDet,
    (m[2] * m[3] - m[0] * m[5]) * invDet,
    (m[3] * m[7] - m[4] * m[6]) * invDet,
    (m[1] * m[6] - m[0] * m[7]) * invDet,
    (m[0] * m[4] - m[1] * m[3]) * invDet,
  ] as Mat3
}

/**
 * Gauss-Jordan 法で 8x8 連立方程式 Ax = b を解く。
 */
function solveLinear8x8(A: number[][], b: number[]): number[] | null {
  const n = 8
  // 拡張行列 [A | b]
  const m: number[][] = A.map((row, i) => [...row, b[i]])
  // ピボッティング付き前進消去
  for (let i = 0; i < n; i++) {
    // ピボット選択
    let pivot = i
    let maxAbs = Math.abs(m[i][i])
    for (let r = i + 1; r < n; r++) {
      const abs = Math.abs(m[r][i])
      if (abs > maxAbs) { maxAbs = abs; pivot = r }
    }
    if (maxAbs < 1e-12) return null
    if (pivot !== i) { [m[i], m[pivot]] = [m[pivot], m[i]] }
    // 正規化
    const piv = m[i][i]
    for (let c = i; c <= n; c++) m[i][c] /= piv
    // 他の行を消去
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = m[r][i]
      if (f === 0) continue
      for (let c = i; c <= n; c++) m[r][c] -= f * m[i][c]
    }
  }
  return m.map(row => row[n])
}

// ── テニスコート用ヘルパ ─────────────────────────────────

/**
 * 標準的なシングルスコート 4 隅の実コート座標（メートル）。
 * 自分側 → 相手側で、左下／左上／右上／右下 の順に返す。
 * z: -11.885（自陣ベースライン）〜 +11.885（敵陣ベースライン）
 * x: -4.115（左サイドライン）〜 +4.115（右サイドライン）
 */
export const SINGLES_CORNERS: Point2D[] = [
  [-4.115, -11.885],
  [-4.115,  11.885],
  [ 4.115,  11.885],
  [ 4.115, -11.885],
]

/**
 * ダブルスコート 4 隅。
 */
export const DOUBLES_CORNERS: Point2D[] = [
  [-5.485, -11.885],
  [-5.485,  11.885],
  [ 5.485,  11.885],
  [ 5.485, -11.885],
]

/**
 * 動画上の 4 隅（正規化 0〜1）と、実コート 4 隅（メートル）から
 * ホモグラフィを構築。動画→コートの変換に使う。
 */
export function buildVideoToCourt(
  videoCorners: Point2D[],
  courtType: 'SINGLES' | 'DOUBLES' = 'DOUBLES',
): Mat3 | null {
  const dst = courtType === 'SINGLES' ? SINGLES_CORNERS : DOUBLES_CORNERS
  return computeHomography(videoCorners, dst)
}
