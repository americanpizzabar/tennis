/**
 * 視野コーン（200°視野角）の Three.js 用ジオメトリ生成。
 *
 * 人間の視野は通常 200° 弱（両眼で）。「ボールやプレイヤーが見えている範囲」を
 * コート床に投影した薄い扇形として描画することで、相手のブラインドスポットを
 * 視覚化する。
 */

/**
 * 半径 r、角度 fovDeg の扇形ジオメトリ用の頂点座標を返す。
 * 中心はローカル原点、扇の中心線が +Z 方向。
 */
export function buildSectorVertices(
  radius: number, fovDeg: number, segments: number,
): { positions: Float32Array; indices: Uint16Array } {
  const half = (fovDeg * Math.PI) / 180 / 2
  const verts: number[] = []
  // 中心点
  verts.push(0, 0, 0)
  // 円弧上の点
  for (let i = 0; i <= segments; i++) {
    const a = -half + (i / segments) * (half * 2)
    // 扇の中心は +Z 方向（テニスでは「相手を見ている」方向）
    const x = Math.sin(a) * radius
    const z = Math.cos(a) * radius
    verts.push(x, 0, z)
  }
  const positions = new Float32Array(verts)
  const idx: number[] = []
  for (let i = 1; i <= segments; i++) {
    idx.push(0, i, i + 1)
  }
  const indices = new Uint16Array(idx)
  return { positions, indices }
}
