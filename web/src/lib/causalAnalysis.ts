/**
 * 「フォーム（原因）×弾道（結果）」の因果テキスト自動生成。
 *
 * 各 HIT/SERVE マーカーに対し、サイドカメラの骨格と弾道メトリクスを
 * 組み合わせて、テニス指導的に意味のある日本語コメントを返す。
 *
 * 入力：
 *  - 弾道メトリクス（speed, apex, netClear, spin, …）
 *  - サイドカメラでの該当時刻の骨格（オプショナル）
 *  - 直後マーカー（MISS/ACE 等）
 *
 * 出力：1〜3 文の自然文。
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { LM } from './poseDetector'
import type { ShotMetric } from './ballMechanics'
import { SPIN_LABEL } from './ballMechanics'
import type { SyncMarker } from '../types/sync'

export interface CausalInput {
  marker: SyncMarker
  metric: ShotMetric
  /** HIT 瞬間のサイドカメラ骨格（任意）。 */
  sideLandmarks?: NormalizedLandmark[] | null
  /** このショット後に来る次のマーカー（任意）。 */
  nextMarker?: SyncMarker
}

export interface CausalReport {
  markerId: string
  /** 1 行ヘッドライン。 */
  headline: string
  /** 詳細（複数行）。 */
  details: string[]
  /** 原因タグ。 */
  causeTags: string[]
  /** 結果タグ。 */
  resultTags: string[]
}

export function buildCausalReport(input: CausalInput): CausalReport {
  const causes: string[] = []
  const results: string[] = []
  const details: string[] = []

  // ── 結果（弾道側） ──
  const { metric, marker, nextMarker, sideLandmarks } = input
  if (metric.speedKmh !== undefined) {
    if (metric.speedKmh > 120) results.push('高速')
    else if (metric.speedKmh > 80) results.push('中速')
    else results.push('遅め')
    details.push(`球速 ${metric.speedKmh.toFixed(0)} km/h`)
  }
  if (metric.apexM !== undefined) {
    if (metric.apexM > 3.5) results.push('高い軌道（ロブ／緩い）')
    else if (metric.apexM > 1.6) results.push('標準的な弧')
    else results.push('低い弾道（鋭い）')
    details.push(`最高点 ${metric.apexM.toFixed(1)} m`)
  }
  if (metric.netClearM !== undefined) {
    if (metric.netClearM < 0.95) results.push('ネットすれすれ（攻撃的）')
    else if (metric.netClearM < 1.5) results.push('安全圏のネット越え')
    else results.push('高めのネット越え')
    details.push(`ネット上 ${metric.netClearM.toFixed(2)} m`)
  }
  if (metric.bouncePos) {
    const [bx, bz] = metric.bouncePos
    const inside = Math.abs(bx) < 4.115 && Math.abs(bz) > 5.5 && Math.abs(bz) < 11.885
    const wide = Math.abs(bx) > 3.0
    const deep = Math.abs(bz) > 9.0
    if (inside && wide && deep) results.push('深いコーナー着弾')
    else if (inside && deep) results.push('ベースライン近く着弾')
    else if (inside && wide) results.push('ワイドな着弾')
    else if (inside) results.push('コート内着弾')
    else results.push('アウト')
    details.push(`着弾 (${bx.toFixed(1)}, ${bz.toFixed(1)}) m`)
  }
  if (metric.spin !== 'UNKNOWN') {
    results.push(SPIN_LABEL[metric.spin])
  }

  // ── 直後マーカーの含意 ──
  if (nextMarker) {
    if (nextMarker.kind === 'ACE') results.push('エース 🌟')
    else if (nextMarker.kind === 'MISS') results.push('ミス ❌')
  }

  // ── 原因（骨格側） ──
  if (sideLandmarks) {
    const formDiag = analyzeForm(sideLandmarks, marker.kind)
    causes.push(...formDiag.causeTags)
    details.push(...formDiag.details)
  }

  // ── 因果連結のヘッドライン ──
  const headline = composeHeadline(marker.kind, causes, results, nextMarker)
  return {
    markerId: marker.id,
    headline,
    details,
    causeTags: causes,
    resultTags: results,
  }
}

function composeHeadline(
  kind: SyncMarker['kind'], causes: string[], results: string[],
  nextMarker?: SyncMarker,
): string {
  const verb = kind === 'SERVE' ? 'サーブ' : '打球'
  const headResult = results[0] ?? '解析中'
  const headCause = causes[0]
  if (nextMarker?.kind === 'ACE') {
    return `${verb}成功：${headCause ?? '良い構え'} → ${headResult}でエース`
  }
  if (nextMarker?.kind === 'MISS') {
    return `${verb}ミス：${headCause ?? '原因解析'} → ${headResult}`
  }
  if (headCause) {
    return `${verb}：${headCause} → ${headResult}`
  }
  return `${verb}：${headResult}`
}

interface FormDiag {
  causeTags: string[]
  details: string[]
}

/**
 * サイドカメラの骨格から、テニス指導でよく言われるチェックポイントを抽出。
 * - 体軸の傾き（前傾／後傾）
 * - 肩のターン量（腰との差）
 * - 打点位置（ラケット手＝右利きなら右手首）の高さ
 * - 膝の曲げ
 */
function analyzeForm(lms: NormalizedLandmark[], kind: SyncMarker['kind']): FormDiag {
  const out: FormDiag = { causeTags: [], details: [] }
  if (!lms || lms.length < 33) return out

  const ls = lms[LM.LEFT_SHOULDER], rs = lms[LM.RIGHT_SHOULDER]
  const lh = lms[LM.LEFT_HIP], rh = lms[LM.RIGHT_HIP]
  const rw = lms[LM.RIGHT_WRIST], lw = lms[LM.LEFT_WRIST]
  const lk = lms[LM.LEFT_KNEE], rk = lms[LM.RIGHT_KNEE]
  const la = lms[LM.LEFT_ANKLE], ra = lms[LM.RIGHT_ANKLE]
  if (!ls || !rs || !lh || !rh) return out

  // 1) 体軸の傾き：肩中点 vs 腰中点
  const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2
  const hx = (lh.x + rh.x) / 2, hy = (lh.y + rh.y) / 2
  const dx = sx - hx, dy = sy - hy
  const lean = Math.atan2(dx, -dy) * 180 / Math.PI   // 前後傾の角度（正面方向は不明、サイドカメラ前提）
  if (lean > 12) {
    out.causeTags.push('体が前傾')
    out.details.push(`体軸の前傾 ${lean.toFixed(0)}°`)
  } else if (lean < -12) {
    out.causeTags.push('のけぞり')
    out.details.push(`体軸の後傾 ${(-lean).toFixed(0)}°`)
  } else {
    out.causeTags.push('良い体軸')
  }

  // 2) 肩のターン（左右肩の z 推定はないため、サイドカメラ前提で「上下のひねり度」≈ ls.y - rs.y）
  const turn = Math.abs(ls.y - rs.y)
  if (kind !== 'SERVE') {
    if (turn > 0.05) out.causeTags.push('しっかり肩を入れた')
    else out.causeTags.push('肩のターン不足')
  }

  // 3) 打点高さ（右利き仮定で右手首、左利きでもラケット手と仮定し低い方を採用）
  const wrist = (rw && (!lw || rw.y < lw.y)) ? rw : lw
  if (wrist) {
    const shoulderY = (ls.y + rs.y) / 2
    const above = shoulderY - wrist.y   // y は下に行くほど大きいので、肩より上なら正
    if (kind === 'SERVE') {
      if (above > 0.10) out.causeTags.push('高い打点 ✓')
      else if (above > -0.05) out.causeTags.push('打点が低め（パワー減）')
      else out.causeTags.push('打点が低すぎ')
    } else {
      if (above > 0.05) out.causeTags.push('高めの打点（ライジング）')
      else if (above > -0.10) out.causeTags.push('腰〜胸の打点（標準）')
      else out.causeTags.push('低い打点（差し込まれた）')
    }
    out.details.push(`打点：肩比 ${(above * 100).toFixed(0)}`)
  }

  // 4) 膝の曲げ（足首〜膝〜腰の角度）
  if (lk && rk && la && ra) {
    const kneeAngle = angleAt(lh.x, lh.y, lk.x, lk.y, la.x, la.y)
    const kneeAngleR = angleAt(rh.x, rh.y, rk.x, rk.y, ra.x, ra.y)
    const bend = (180 - (kneeAngle + kneeAngleR) / 2)
    if (bend > 35) out.causeTags.push('しっかり膝を曲げた')
    else if (bend < 15) out.causeTags.push('膝が伸びている（パワー不足）')
    out.details.push(`膝の曲げ ${bend.toFixed(0)}°`)
  }

  return out
}

/** 3 点で中央の点の角度（度）。 */
function angleAt(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const v1x = ax - bx, v1y = ay - by
  const v2x = cx - bx, v2y = cy - by
  const d = (v1x * v2x + v1y * v2y) /
    Math.max(1e-9, Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))
  const a = Math.acos(Math.max(-1, Math.min(1, d)))
  return a * 180 / Math.PI
}
