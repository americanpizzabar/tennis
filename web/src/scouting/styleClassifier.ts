import type { PlayStyle, PlayerScouting, ShotRatings } from './types'

/**
 * プレイヤーの能力評価からスタイルを判定する。
 *
 * 完全ルールベース：各スタイルにテンプレートをスコア化し、最高得点を採用。
 * 機械学習ではないが、根拠が説明可能で再現性がある。
 */
export function classifyStyle(p: PlayerScouting): { style: PlayStyle; score: number } {
  const r = p.ratings
  const candidates: Array<{ style: PlayStyle; score: number }> = [
    { style: 'AGGRESSIVE_BASELINER', score: scoreAggressiveBaseliner(r) },
    { style: 'COUNTER_PUNCHER', score: scoreCounterPuncher(r) },
    { style: 'SERVE_VOLLEYER', score: scoreServeVolleyer(r) },
    { style: 'ALL_COURT', score: scoreAllCourt(r) },
    { style: 'CLAY_GRINDER', score: scoreClayGrinder(r) },
    { style: 'BIG_SERVER', score: scoreBigServer(r) },
    { style: 'PUSHER', score: scorePusher(r) },
  ]
  candidates.sort((a, b) => b.score - a.score)
  const top = candidates[0]
  if (top.score < 0.35) return { style: 'UNKNOWN', score: top.score }
  return top
}

/** 各スタイルのテンプレート評価（0〜1）。 */

function scoreAggressiveBaseliner(r: ShotRatings): number {
  // 強いフォア + 早い展開、ベースラインから離れない
  const fh = avg([r.forehandPower, r.forehandTopspin, r.forehandConsistency])
  const aggression = r.returnAggression
  const move = avg([r.movementFootwork, r.movementSpeed])
  const baseline = r.baselineCoverage
  return weighted({
    fh, aggression, move, baseline,
    weights: { fh: 0.4, aggression: 0.25, move: 0.2, baseline: 0.15 },
  })
}

function scoreCounterPuncher(r: ShotRatings): number {
  // 高い安定性、移動量、プレッシャー耐性、カムバック力
  const cons = avg([r.forehandConsistency, r.backhandConsistency, r.returnConsistency])
  const move = avg([r.movementFootwork, r.movementSpeed, r.baselineCoverage])
  const mental = avg([r.underPressure, r.comeback])
  return weighted({
    cons, move, mental,
    weights: { cons: 0.4, move: 0.3, mental: 0.3 },
  })
}

function scoreServeVolleyer(r: ShotRatings): number {
  const serve = avg([r.serveFirstSpeed, r.servePlacement, r.serveSecondReliability])
  const volley = avg([r.volleyLow, r.volleyHigh, r.netConfidence])
  // ベースラインカバーが低いほど特化
  const focus = 1 - r.baselineCoverage / 5
  return weighted({
    serve, volley, focus,
    weights: { serve: 0.35, volley: 0.45, focus: 0.20 },
  })
}

function scoreAllCourt(r: ShotRatings): number {
  // 全てが 3 以上で平均が 3.5+ 程度
  const all = Object.values(r) as number[]
  const mean = avg(all)
  const minVal = Math.min(...all)
  // 平均が高く、かつ minimum も低くない（全方位カバー）
  const meanScore = clamp01((mean - 2.5) / 2.5)
  const minScore = clamp01((minVal - 1) / 4)
  return weighted({
    meanScore, minScore,
    weights: { meanScore: 0.6, minScore: 0.4 },
  })
}

function scoreClayGrinder(r: ShotRatings): number {
  const topspin = r.forehandTopspin
  const cons = avg([r.forehandConsistency, r.backhandConsistency])
  const move = avg([r.movementFootwork, r.baselineCoverage])
  return weighted({
    topspin, cons, move,
    weights: { topspin: 0.4, cons: 0.3, move: 0.3 },
  })
}

function scoreBigServer(r: ShotRatings): number {
  const firstServe = (r.serveFirstSpeed - 1) / 4    // 5 で 1.0
  // 強いほど他要素は無視できる
  const serveAlone = clamp01(firstServe)
  // ストロークがそこそこなら更にプラス
  const supporting = avg([r.servePlacement, r.netConfidence]) / 5
  return clamp01(serveAlone * 0.75 + supporting * 0.25)
}

function scorePusher(r: ShotRatings): number {
  // 異常に高い安定性 + 低い威力
  const cons = avg([r.forehandConsistency, r.backhandConsistency, r.returnConsistency])
  const power = avg([r.forehandPower, r.backhandPower, r.serveFirstSpeed])
  const move = avg([r.movementFootwork, r.movementSpeed, r.baselineCoverage])
  // cons が高く、power が低めだとプッシャー
  const gap = clamp01((cons - power + 2) / 4)
  return weighted({
    cons: cons / 5, gap, move: move / 5,
    weights: { cons: 0.4, gap: 0.4, move: 0.2 },
  })
}

// ── ヘルパ ─────────────────────────────────────

function avg(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

interface WeightedInput {
  weights: Record<string, number>
  [key: string]: number | Record<string, number>
}

function weighted(input: WeightedInput): number {
  const { weights, ...values } = input
  let sum = 0
  let totalWeight = 0
  for (const key of Object.keys(weights)) {
    const v = values[key]
    if (typeof v !== 'number') continue
    // 1〜5 を 0〜1 に
    const normalized = v > 1.01 ? clamp01((v - 1) / 4) : clamp01(v)
    sum += normalized * weights[key]
    totalWeight += weights[key]
  }
  return totalWeight > 0 ? sum / totalWeight : 0
}

/** ショット得意・苦手をレーダーチャート用に集約。 */
export interface RadarStat {
  label: string
  /** 0〜100。 */
  value: number
}

export function buildRadarStats(p: PlayerScouting): RadarStat[] {
  const r = p.ratings
  const grp = (xs: number[]) => Math.round((avg(xs) / 5) * 100)
  return [
    { label: 'フォア', value: grp([r.forehandPower, r.forehandConsistency, r.forehandTopspin]) },
    { label: 'バック', value: grp([r.backhandPower, r.backhandConsistency, r.backhandSlice]) },
    { label: 'サーブ', value: grp([r.serveFirstSpeed, r.servePlacement, r.serveSecondReliability]) },
    { label: 'リターン', value: grp([r.returnAggression, r.returnConsistency]) },
    { label: 'ボレー', value: grp([r.volleyLow, r.volleyHigh, r.netConfidence]) },
    { label: '機動力', value: grp([r.movementFootwork, r.movementSpeed, r.baselineCoverage]) },
    { label: 'メンタル', value: grp([r.underPressure, r.comeback]) },
  ]
}
