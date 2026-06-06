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

/** キーフレーム配列から指定時刻の値を補間。 */
export function sampleBall(keys: BallKey[], tMs: number): [number, number, number] | null {
  if (keys.length === 0) return null
  if (tMs <= keys[0].tMs) return keys[0].pos
  if (tMs >= keys[keys.length - 1].tMs) return keys[keys.length - 1].pos
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const span = b.tMs - a.tMs
      const t = span > 0 ? (tMs - a.tMs) / span : 0
      // ボールは放物線っぽく：z 軸の補間は線形、y 軸はちょっと持ち上げ
      const baseY = a.pos[1] + (b.pos[1] - a.pos[1]) * t
      const arc = 4 * t * (1 - t)   // 中央で 1、端で 0
      const peakBoost = Math.max(0, (b.pos[1] - a.pos[1]) * 0.0 + 0.5)
      return [
        a.pos[0] + (b.pos[0] - a.pos[0]) * t,
        baseY + arc * peakBoost,
        a.pos[2] + (b.pos[2] - a.pos[2]) * t,
      ]
    }
  }
  return keys[keys.length - 1].pos
}

export function samplePlayer(
  keys: PlayerKey[], tMs: number,
): { pos: [number, number]; facing: number } | null {
  if (keys.length === 0) return null
  let lastFacing = keys[0].facing ?? 0
  if (tMs <= keys[0].tMs) return { pos: keys[0].pos, facing: lastFacing }
  if (tMs >= keys[keys.length - 1].tMs) {
    for (const k of keys) if (k.facing !== undefined) lastFacing = k.facing
    return { pos: keys[keys.length - 1].pos, facing: lastFacing }
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    if (a.facing !== undefined) lastFacing = a.facing
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const span = b.tMs - a.tMs
      const tRaw = span > 0 ? (tMs - a.tMs) / span : 0
      const t = easeInOutCubic(tRaw)
      const facing = b.facing !== undefined
        ? lastFacing + (b.facing - lastFacing) * t
        : lastFacing
      return { pos: lerp2(a.pos, b.pos, t), facing }
    }
  }
  return { pos: keys[keys.length - 1].pos, facing: lastFacing }
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
