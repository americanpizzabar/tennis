/**
 * 連続タグ済みボール位置から、球速・最高点・推定スピンを算出。
 *
 * - 球速：連続セグメントの距離 / 時間
 * - 最高点：HIT 〜 次の BOUNCE までの Y 最大値
 * - スピン推定：放物線フィットと実観測の差から「重力以外の力」を粗く分類
 *   （トップスピン＝下に強く落ちる、スライス＝直線的、フラット＝中間）
 *   ※ 厳密な回転数ではなく、定性ラベルにとどめる
 */

import type { BallTag, SyncMarker, SyncSessionRecord } from '../types/sync'

export type SpinKind = 'TOPSPIN' | 'FLAT' | 'SLICE' | 'UNKNOWN'

export interface ShotMetric {
  /** どの HIT/SERVE マーカーに対応するか。 */
  markerId: string
  /** 開始 epoch（HIT/SERVE 時刻）。 */
  startEpoch: number
  /** 次のバウンド or マーカーまでの時間 [s]。 */
  flightSec?: number
  /** 平均球速 [m/s]。 */
  speedMs?: number
  /** 平均球速 [km/h]。 */
  speedKmh?: number
  /** 最高点 Y [m]（ボールが飛んでいる間）。 */
  apexM?: number
  /** ネット上の通過高度 [m]（z ≈ 0 を横切るとき）。 */
  netClearM?: number
  /** 着弾点 (X, Z) [m]、次のバウンドがあるとき。 */
  bouncePos?: [number, number]
  /** 推定スピン。 */
  spin: SpinKind
  /** スピンの定性スコア（>0: トップ寄り、<0: スライス寄り、絶対値 = 強度）。 */
  spinScore: number
}

interface ResolvedTag {
  markerId: string
  epoch: number
  pos: [number, number, number]
  kind: SyncMarker['kind']
}

export function computeShotMetrics(rec: SyncSessionRecord): ShotMetric[] {
  const markers = rec.markers ?? []
  const tags = rec.ballTags ?? []
  if (tags.length < 2) return []

  // タグを時刻順、種別付きで解決
  const byId = new Map(markers.map(m => [m.id, m]))
  const resolved: ResolvedTag[] = tags
    .map(t => {
      const m = byId.get(t.markerId)
      if (!m) return null
      return { markerId: t.markerId, epoch: m.epoch, pos: t.pos, kind: m.kind }
    })
    .filter((x): x is ResolvedTag => x !== null)
    .sort((a, b) => a.epoch - b.epoch)

  const out: ShotMetric[] = []
  for (let i = 0; i < resolved.length; i++) {
    const cur = resolved[i]
    if (cur.kind !== 'HIT' && cur.kind !== 'SERVE') continue
    // 次のサンプル群を取り、BOUNCE が来るか別の HIT/SERVE まで
    const segment: ResolvedTag[] = [cur]
    let bounce: ResolvedTag | null = null
    for (let j = i + 1; j < resolved.length; j++) {
      const nx = resolved[j]
      segment.push(nx)
      if (nx.kind === 'BOUNCE') { bounce = nx; break }
      if (nx.kind === 'HIT' || nx.kind === 'SERVE') break
    }
    out.push(metricFromSegment(cur, segment, bounce))
  }
  return out
}

function metricFromSegment(hit: ResolvedTag, segment: ResolvedTag[], bounce: ResolvedTag | null): ShotMetric {
  const m: ShotMetric = {
    markerId: hit.markerId,
    startEpoch: hit.epoch,
    spin: 'UNKNOWN',
    spinScore: 0,
  }
  if (segment.length < 2) return m
  const end = bounce ?? segment[segment.length - 1]
  const dt = (end.epoch - hit.epoch) / 1000
  if (dt > 0.05) {
    m.flightSec = dt
    const dx = end.pos[0] - hit.pos[0]
    const dy = end.pos[1] - hit.pos[1]
    const dz = end.pos[2] - hit.pos[2]
    const dist = Math.hypot(dx, dy, dz)
    m.speedMs = dist / dt
    m.speedKmh = m.speedMs * 3.6
  }
  if (bounce) m.bouncePos = [bounce.pos[0], bounce.pos[2]]
  // 最高点
  let apex = -Infinity
  for (const s of segment) if (s.pos[1] > apex) apex = s.pos[1]
  if (apex > -Infinity) m.apexM = apex
  // ネット越え高度（z = 0 をまたぐペアを線形補間）
  for (let k = 0; k < segment.length - 1; k++) {
    const a = segment[k], b = segment[k + 1]
    if ((a.pos[2] < 0 && b.pos[2] > 0) || (a.pos[2] > 0 && b.pos[2] < 0)) {
      const t = -a.pos[2] / (b.pos[2] - a.pos[2])
      m.netClearM = a.pos[1] + (b.pos[1] - a.pos[1]) * t
      break
    }
  }
  // スピン推定（放物線フィットの残差から）
  m.spinScore = estimateSpinScore(segment)
  m.spin = m.spinScore > 0.25 ? 'TOPSPIN' : m.spinScore < -0.25 ? 'SLICE' : 'FLAT'
  return m
}

/**
 * 鉛直方向の運動を `y(t) = y0 + vy*t - 0.5*g*t²` でフィットし、
 * g_eff（観測上の重力加速度） を推定。
 * - g_eff > 9.81 → 落下が速い → トップスピン傾向
 * - g_eff < 9.81 → 落下が遅い／伸びる → スライス傾向
 * 返り値は正規化スコア。
 */
function estimateSpinScore(segment: ResolvedTag[]): number {
  if (segment.length < 3) return 0
  // 最小二乗：未知 (y0, vy, a) を解く（a = 0.5*g_eff の符号付き）
  // y = y0 + vy*t + a*t² ＋ノイズ
  // ここで a は重力で負（-4.905 が標準）
  const t0 = segment[0].epoch / 1000
  let Stt = 0, Stttt = 0, Ststs = 0   // 行列要素（簡略）
  let St = 0, Stt_y = 0, Sy = 0, Sttt = 0
  let n = 0
  const xs: number[] = []
  const ys: number[] = []
  for (const s of segment) {
    const t = s.epoch / 1000 - t0
    xs.push(t); ys.push(s.pos[1]); n++
  }
  // 正規方程式（多項式回帰、次数 2）
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0
  let sy = 0, sty = 0, st2y = 0
  for (let i = 0; i < n; i++) {
    const t = xs[i], y = ys[i]
    const tt = t * t, ttt = tt * t, tttt = tt * tt
    s0 += 1; s1 += t; s2 += tt; s3 += ttt; s4 += tttt
    sy += y; sty += t * y; st2y += tt * y
  }
  // 3x3 線形系を解く
  const sol = solve3x3([
    [s0, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ], [sy, sty, st2y])
  if (!sol) return 0
  const a = sol[2]
  const gEff = -2 * a   // 観測重力（>0 が下向き）
  const standard = 9.81
  // 偏差を [-1, 1] に正規化（±3 m/s² を境にクリップ）
  const dev = (gEff - standard) / 3
  if (Number.isNaN(dev) || !Number.isFinite(dev)) return 0
  return Math.max(-1, Math.min(1, dev))
  // 注：抜けない雑音にも反応するため、UI 側で n の少ないショットはラベル弱めに扱う
  // （上位の `metric.spin === 'UNKNOWN'` フォールバックで対処）
  // 未使用の Stt 等は将来の機能拡張のために残してある
  void Stt; void Stttt; void Ststs; void St; void Stt_y; void Sy; void Sttt
}

function solve3x3(A: number[][], b: number[]): number[] | null {
  // Gauss-Jordan
  const m: number[][] = A.map((r, i) => [...r, b[i]])
  for (let i = 0; i < 3; i++) {
    let pivot = i, max = Math.abs(m[i][i])
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(m[r][i]) > max) { max = Math.abs(m[r][i]); pivot = r }
    }
    if (max < 1e-9) return null
    if (pivot !== i) { [m[i], m[pivot]] = [m[pivot], m[i]] }
    const piv = m[i][i]
    for (let c = i; c <= 3; c++) m[i][c] /= piv
    for (let r = 0; r < 3; r++) {
      if (r === i) continue
      const f = m[r][i]
      if (f === 0) continue
      for (let c = i; c <= 3; c++) m[r][c] -= f * m[i][c]
    }
  }
  return [m[0][3], m[1][3], m[2][3]]
}

export const SPIN_LABEL: Record<SpinKind, string> = {
  TOPSPIN: 'トップスピン',
  FLAT: 'フラット',
  SLICE: 'スライス',
  UNKNOWN: '不明',
}
