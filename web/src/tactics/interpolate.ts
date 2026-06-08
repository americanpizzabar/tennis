import type { BallKey, DangerZoneKey, PlayerKey, TargetGateKey } from './types'

/** 2D 線形補間。 */
export function lerp2(
  a: [number, number], b: [number, number], t: number,
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** 3D 線形補間。 */
export function lerp3(
  a: [number, number, number], b: [number, number, number], t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

/** イージング：easeInOutCubic。 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** イージング：easeOutQuad。 */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/**
 * Catmull-Rom スプライン（uniform）。
 * 4 つの制御点を通って P1→P2 区間を u∈[0,1] で滑らかに補間する。
 * 端点では「鏡映点（P-1 = 2P0 - P1）」を使い C¹ 連続を維持。
 *
 * これにより打点 → apex → バウンドの 3 点キーフレームが
 * 滑らかな放物線として描かれ、キーフレーム境界の「カクン」が消える。
 */
function catmullRom1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u
  const u3 = u2 * u
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * u +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * u3
  )
}

/**
 * 時刻付きキーフレーム列から指定時刻の値を Catmull-Rom で補間。
 *
 * @param keys 単調増加の tMs を持つキーフレーム配列
 * @param tMs クエリ時刻
 * @param value 各キーから N 次元ベクトルを取り出す関数
 * @param clamps クランプ関数（例：ボールの y を 0 以上に）。
 */
function sampleCatmullRomN<T>(
  keys: Array<{ tMs: number } & T>,
  tMs: number,
  value: (k: T) => number[],
  clamps?: Array<(v: number) => number>,
): number[] | null {
  if (keys.length === 0) return null
  if (keys.length === 1) return value(keys[0])
  if (tMs <= keys[0].tMs) return value(keys[0])
  if (tMs >= keys[keys.length - 1].tMs) return value(keys[keys.length - 1])

  let i = 0
  for (; i < keys.length - 1; i++) {
    if (tMs >= keys[i].tMs && tMs <= keys[i + 1].tMs) break
  }
  const k1 = keys[i]
  const k2 = keys[i + 1]
  // 端点の鏡映で P0, P3 を確保
  const k0 = i > 0 ? keys[i - 1] : { ...k1, tMs: k1.tMs - (k2.tMs - k1.tMs) }
  const k3 = i + 2 < keys.length ? keys[i + 2] : { ...k2, tMs: k2.tMs + (k2.tMs - k1.tMs) }
  const span = k2.tMs - k1.tMs
  const u = span > 0 ? (tMs - k1.tMs) / span : 0

  const v0 = value(k0 as any), v1 = value(k1 as any), v2 = value(k2 as any), v3 = value(k3 as any)
  const dim = v1.length
  const out: number[] = new Array(dim)
  for (let d = 0; d < dim; d++) {
    let v = catmullRom1D(v0[d], v1[d], v2[d], v3[d], u)
    if (clamps && clamps[d]) v = clamps[d](v)
    out[d] = v
  }
  return out
}

/**
 * ボールキーフレーム補間。
 * rallyBuilder が「打点 → apex → バウンド」の 3 点を入れているので、
 * Catmull-Rom を通すと放物線に近い自然な弧になる。
 * y は床貫通を防ぐためクランプ。
 */
export function sampleBall(keys: BallKey[], tMs: number): [number, number, number] | null {
  const r = sampleCatmullRomN(
    keys, tMs,
    k => [k.pos[0], k.pos[1], k.pos[2]],
    [undefined as any, (y: number) => Math.max(0, y), undefined as any],
  )
  return r ? [r[0], r[1], r[2]] : null
}

/**
 * プレイヤー補間：位置は Catmull-Rom で全体を滑らかに、
 * facing は前回値からの線形補間（向きは離散的に切り替わるのが自然）。
 *
 * 旧実装はキーフレームごとに easeInOutCubic していたため、各キー境界で
 * 「いったん止まる → 加速」のパルスが入り、ガクガク見えていた。
 * Catmull-Rom にすることで境界で速度が連続する。
 */
export function samplePlayer(
  keys: PlayerKey[], tMs: number,
): { pos: [number, number]; facing: number } | null {
  if (keys.length === 0) return null
  // facing：直近の指定値を伝播
  let facing = keys[0].facing ?? 0
  if (tMs >= keys[keys.length - 1].tMs) {
    for (const k of keys) if (k.facing !== undefined) facing = k.facing
    return { pos: keys[keys.length - 1].pos, facing }
  }
  for (const k of keys) {
    if (k.tMs > tMs) break
    if (k.facing !== undefined) facing = k.facing
  }

  const r = sampleCatmullRomN(keys, tMs, k => [k.pos[0], k.pos[1]])
  if (!r) return null
  return { pos: [r[0], r[1]], facing }
}

export function sampleDangerZone(
  keys: DangerZoneKey[], tMs: number,
): { center: [number, number]; radius: number; visible: boolean } | null {
  if (keys.length === 0) return null
  if (tMs <= keys[0].tMs)
    return { center: keys[0].center, radius: keys[0].radius, visible: keys[0].visible }
  if (tMs >= keys[keys.length - 1].tMs) {
    const k = keys[keys.length - 1]
    return { center: k.center, radius: k.radius, visible: k.visible }
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const span = b.tMs - a.tMs
      const t = span > 0 ? (tMs - a.tMs) / span : 0
      const e = easeOutQuad(t)
      return {
        center: lerp2(a.center, b.center, e),
        radius: a.radius + (b.radius - a.radius) * e,
        visible: a.visible || b.visible,
      }
    }
  }
  const k = keys[keys.length - 1]
  return { center: k.center, radius: k.radius, visible: k.visible }
}

export function sampleTargetGate(
  keys: TargetGateKey[], tMs: number,
): {
  pos: [number, number, number]
  normal: [number, number, number]
  radius: number
  visible: boolean
  label?: string
} | null {
  if (keys.length === 0) return null
  if (tMs <= keys[0].tMs) {
    const k = keys[0]
    return { pos: k.pos, normal: k.normal, radius: k.radius, visible: k.visible, label: k.label }
  }
  if (tMs >= keys[keys.length - 1].tMs) {
    const k = keys[keys.length - 1]
    return { pos: k.pos, normal: k.normal, radius: k.radius, visible: k.visible, label: k.label }
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const span = b.tMs - a.tMs
      const t = span > 0 ? (tMs - a.tMs) / span : 0
      const e = easeOutQuad(t)
      return {
        pos: lerp3(a.pos, b.pos, e),
        normal: lerp3(a.normal, b.normal, e),
        radius: a.radius + (b.radius - a.radius) * e,
        visible: a.visible || b.visible,
        label: a.label ?? b.label,
      }
    }
  }
  const k = keys[keys.length - 1]
  return { pos: k.pos, normal: k.normal, radius: k.radius, visible: k.visible, label: k.label }
}

/** 指定時刻に「ちょうど発火する」ナレーションビートを返す。 */
export function currentBeats<T extends { tMs: number }>(
  beats: T[], tMs: number,
): T | null {
  let active: T | null = null
  for (const b of beats) {
    if (b.tMs <= tMs) active = b
    else break
  }
  return active
}
