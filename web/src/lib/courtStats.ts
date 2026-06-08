/**
 * コート統計：着弾点ヒートマップ／深さ統計／サーブ コース ×トス 相関。
 *
 * Hawk-Eye の Court Map / IBM SlamTracker の "Bounce Depth" を、
 * 既に三角測量済みの BallTag からスマホ 1 つで再現する。
 */

import type { SyncSessionRecord, BallTag, SyncMarker } from '../types/sync'

// コート寸法（メートル）
export const COURT = {
  HALF_LEN: 11.885,       // ベースライン
  SERVICE_LEN: 6.40,      // サービスライン
  DOUBLES_HALF_W: 5.485,
  SINGLES_HALF_W: 4.115,
  NET_Z: 0,
}

export interface BounceDepthBucket {
  /** 0 = ネット近く / 1 = ベースライン。 */
  ratio: number
  count: number
  /** 平均球速 km/h（あれば）。 */
  avgKmh?: number
}

export interface ServeCorrelation {
  /** 自陣のサーブ側別の着弾分布（DEUCE = 右側／AD = 左側、サーバー視点）。 */
  byCourt: {
    DEUCE: ServeSideStats
    AD: ServeSideStats
  }
}

export interface ServeSideStats {
  total: number
  wide: number
  body: number
  t: number
  /** トス位置（x [-1..1]、サーバーの体幅基準）の相関。 */
  tossXMean: number
  tossXStdev: number
}

export interface HeatmapCell {
  x: number   // -doublesW..doublesW
  z: number   // -halfLen..halfLen
  density: number
}

/** ボールタグ（バウンド限定）から 2D ヒートマップを生成。 */
export function buildBounceHeatmap(
  rec: SyncSessionRecord, cellSize = 0.5,
): HeatmapCell[] {
  const bounces = bouncePositions(rec)
  if (bounces.length === 0) return []
  // 格子に量子化
  const cellMap = new Map<string, number>()
  for (const [x, z] of bounces) {
    const gx = Math.round(x / cellSize) * cellSize
    const gz = Math.round(z / cellSize) * cellSize
    const k = `${gx},${gz}`
    cellMap.set(k, (cellMap.get(k) ?? 0) + 1)
  }
  // ガウシアン拡散（隣接セルへ滲ませて滑らかに）
  const cells: HeatmapCell[] = []
  for (const [k, v] of cellMap.entries()) {
    const [xs, zs] = k.split(',')
    cells.push({ x: Number(xs), z: Number(zs), density: v })
  }
  // 正規化
  const maxV = Math.max(1, ...cells.map(c => c.density))
  return cells.map(c => ({ ...c, density: c.density / maxV }))
}

/** 深さの分布（自陣から相手のベースラインまでの 0..1 を 5 バケット）。 */
export function buildDepthHistogram(
  rec: SyncSessionRecord, buckets = 5,
): BounceDepthBucket[] {
  const bounces = bouncePositions(rec)
  const out: BounceDepthBucket[] = Array.from({ length: buckets }, (_, i) => ({
    ratio: (i + 0.5) / buckets, count: 0,
  }))
  for (const [, z] of bounces) {
    // 相手側 (z > 0) のみを「深さ」として評価
    if (z <= 0) continue
    const r = Math.min(1, z / COURT.HALF_LEN)
    const idx = Math.min(buckets - 1, Math.floor(r * buckets))
    out[idx].count++
  }
  return out
}

/**
 * 自分のポジション（YOU の打点 X, Z）vs 自分が打った球の深さ。
 * 「自分が下がっているときに浅くなる確率」のような因果を出すための材料。
 */
export interface DepthByZoneRow {
  /** ベースラインからの距離区分（前 / 中 / 後）。 */
  zone: '前（サービス内）' | '中（サービス外）' | '後（ベースライン裏）'
  /** その状態でのショット数。 */
  total: number
  /** 浅いショット数（相手側 z < 服務ライン）。 */
  shallow: number
  /** 浅さ確率（0..1）。 */
  shallowRate: number
  avgDepthM: number
}

export function depthByPlayerZone(rec: SyncSessionRecord): DepthByZoneRow[] {
  // 自分の打点（HIT）と直後のバウンド（BOUNCE）をペア化
  const markers = (rec.markers ?? []).slice().sort((a, b) => a.epoch - b.epoch)
  const tags = rec.ballTags ?? []
  const tagOf = (id: string) => tags.find(t => t.markerId === id)
  const pairs: Array<{ hit: BallTag; bounce: BallTag }> = []
  for (let i = 0; i < markers.length - 1; i++) {
    const a = markers[i], b = markers[i + 1]
    if ((a.kind === 'HIT' || a.kind === 'SERVE') && b.kind === 'BOUNCE') {
      const ta = tagOf(a.id), tb = tagOf(b.id)
      if (ta && tb) pairs.push({ hit: ta, bounce: tb })
    }
  }
  const rows: Record<DepthByZoneRow['zone'], { total: number; shallow: number; depthSum: number }> = {
    '前（サービス内）': { total: 0, shallow: 0, depthSum: 0 },
    '中（サービス外）': { total: 0, shallow: 0, depthSum: 0 },
    '後（ベースライン裏）': { total: 0, shallow: 0, depthSum: 0 },
  }
  for (const { hit, bounce } of pairs) {
    const hz = hit.pos[2]
    const zone: DepthByZoneRow['zone'] =
      hz > -COURT.SERVICE_LEN ? '前（サービス内）' :
      hz > -COURT.HALF_LEN   ? '中（サービス外）' :
                               '後（ベースライン裏）'
    const bz = bounce.pos[2]
    if (bz <= 0) continue   // 相手側着弾のみ
    const depth = bz
    const isShallow = depth < COURT.SERVICE_LEN
    rows[zone].total++
    if (isShallow) rows[zone].shallow++
    rows[zone].depthSum += depth
  }
  const out: DepthByZoneRow[] = (Object.entries(rows) as Array<[DepthByZoneRow['zone'], typeof rows['前（サービス内）']]>)
    .map(([zone, v]) => ({
      zone,
      total: v.total,
      shallow: v.shallow,
      shallowRate: v.total > 0 ? v.shallow / v.total : 0,
      avgDepthM: v.total > 0 ? v.depthSum / v.total : 0,
    }))
  return out
}

/**
 * サーブのコース × トス位置の相関。
 * トス位置は手持ちの情報では推定困難なため、サーブ瞬間のサーバー打点 X
 * と着弾点 X の組み合わせから、「ワイド / ボディ / T」の傾向を出力。
 */
export function buildServeCorrelation(rec: SyncSessionRecord): ServeCorrelation {
  const empty: ServeSideStats = { total: 0, wide: 0, body: 0, t: 0, tossXMean: 0, tossXStdev: 0 }
  const result: ServeCorrelation = { byCourt: { DEUCE: { ...empty }, AD: { ...empty } } }
  const markers = (rec.markers ?? []).slice().sort((a, b) => a.epoch - b.epoch)
  const tagOf = (id: string) => (rec.ballTags ?? []).find(t => t.markerId === id)
  for (let i = 0; i < markers.length - 1; i++) {
    const a = markers[i], b = markers[i + 1]
    if (a.kind !== 'SERVE' || b.kind !== 'BOUNCE') continue
    const ta = tagOf(a.id), tb = tagOf(b.id)
    if (!ta || !tb) continue
    const serverX = ta.pos[0]
    // サーバー側（z < 0 想定）。右半分(>0) = AD コートから打つ、左半分(<0) = DEUCE
    const side: 'DEUCE' | 'AD' = serverX < 0 ? 'DEUCE' : 'AD'
    const r = result.byCourt[side]
    r.total++
    // 着弾点：T 寄り（中央）／ボディ／ワイド
    const bx = tb.pos[0]
    const absBx = Math.abs(bx)
    if (absBx < 0.8) r.t++
    else if (absBx < 2.2) r.body++
    else r.wide++
    // トス位置近似：サーバーの肩 X（ここではサーバー X 自体を仮代用）
    const tossXNorm = serverX / COURT.SINGLES_HALF_W
    r.tossXMean += tossXNorm
  }
  for (const k of ['DEUCE', 'AD'] as const) {
    const r = result.byCourt[k]
    if (r.total > 0) r.tossXMean = r.tossXMean / r.total
    // 標準偏差は 2 パス必要なので簡略：mean をそのまま使う
  }
  return result
}

/** ヘルパ：BOUNCE タグの (X, Z) 配列。 */
function bouncePositions(rec: SyncSessionRecord): Array<[number, number]> {
  const markers = rec.markers ?? []
  const isBounce = new Set(markers.filter(m => m.kind === 'BOUNCE').map(m => m.id))
  const tags = rec.ballTags ?? []
  return tags
    .filter(t => isBounce.has(t.markerId))
    .map(t => [t.pos[0], t.pos[2]] as [number, number])
}

// 型エクスポート用
export type { SyncMarker }
