import {
  detectSwings, FrameMetrics, frameMetrics, ImpactPoint, impactScatter,
  impactDispersion, pelvisShoulderLeadSec, Side, takebackCompletionLeadSec,
} from './biomechanics'
import { PoseFrame } from './poseDetector'
import { IDEAL_FORMS, IdealRange, Shot } from '../data/idealForms'

/**
 * 1 セッションの解析結果。
 */
export interface SessionAnalysis {
  shot: Shot
  side: Side
  /** スイング回数。 */
  swingCount: number
  /** インパクト時メトリクスの平均。 */
  avgImpactMetrics: FrameMetrics | null
  /** 骨盤→肩の平均タイムリード（秒）。 */
  avgPelvisLeadSec: number | null
  /** テイクバック完了→インパクトの平均（秒）。 */
  avgTakebackLeadSec: number | null
  /** チェックポイント評価。 */
  checkpoints: CheckpointResult[]
  /** 0〜100 の総合スコア。 */
  overallScore: number
  /** AI コーチング 3〜5 行。 */
  coachingText: string
  /** 推奨ドリル。 */
  drills: DrillSuggestion[]
  /** 打点ばらつき（散布図用）。 */
  impactPoints: ImpactPoint[]
  /** 打点散らばり指標。 */
  impactDispersion: { sdX: number; sdY: number }
  /** ピーク・タイムライン用：全フレームのメトリクス列。 */
  timeline: FrameMetrics[]
}

export interface CheckpointResult {
  id: string
  nameJa: string
  measured: number | null
  measuredText: string
  idealText: string
  score: number
  adviceJa: string
  weight: number
  phase: string
}

export interface DrillSuggestion {
  title: string
  description: string
  reason: string
  reps: number
  minutes: number
  priority: number
}

export function analyzeSession(
  shot: Shot, side: Side, frames: PoseFrame[],
): SessionAnalysis {
  const swings = detectSwings(frames, side)
  const impactFrames = swings.map(s => frames[s.frameIndex])
  const impactMetrics = impactFrames.map(f => frameMetrics(f, side))

  const avg = average(impactMetrics)
  const avgLead = average2(swings.map(s => pelvisShoulderLeadSec(frames, s.frameIndex)))
  const avgTbLead = average2(swings.map(s => takebackCompletionLeadSec(frames, side, s.frameIndex)))

  const ideals = IDEAL_FORMS[shot]
  const checkpoints = ideals.map(id => evaluateCheckpoint(id, avg, avgLead, avgTbLead))
  const overall = checkpoints.length === 0 ? 0
    : Math.round(
      checkpoints.reduce((a, c) => a + c.score * c.weight, 0) /
      checkpoints.reduce((a, c) => a + c.weight, 0)
    )

  const points = impactScatter(frames, swings, side)
  const dispersion = impactDispersion(points)

  const coachingText = buildCoachingText(shot, checkpoints, overall, dispersion)
  const drills = buildDrills(shot, checkpoints)

  return {
    shot, side,
    swingCount: swings.length,
    avgImpactMetrics: avg,
    avgPelvisLeadSec: avgLead,
    avgTakebackLeadSec: avgTbLead,
    checkpoints,
    overallScore: overall,
    coachingText,
    drills,
    impactPoints: points,
    impactDispersion: dispersion,
    timeline: frames.map(f => frameMetrics(f, side)),
  }
}

function evaluateCheckpoint(
  spec: IdealRange,
  avg: FrameMetrics | null,
  avgPelvisLead: number | null,
  avgTbLead: number | null,
): CheckpointResult {
  let measured: number | null = null
  if (avg) {
    if (spec.id.includes('elbow')) measured = avg.elbowDeg
    else if (spec.id.includes('knee')) measured = avg.kneeDeg
    else if (spec.id.includes('twist')) measured = avg.twistDeg
    else if (spec.id.includes('chest_block') || spec.id.includes('chest_open'))
      measured = avg.chestOpenAbs !== null ? Math.abs(avg.chestOpenAbs) : null
    else if (spec.id.includes('contact_forward')) measured = avg.contactRelFrontFoot
  }
  if (spec.id.includes('pelvis_lead')) measured = avgPelvisLead
  if (spec.id.includes('takeback_lead')) measured = avgTbLead

  if (measured === null) {
    return {
      id: spec.id, nameJa: spec.nameJa, measured: null,
      measuredText: '計測なし', idealText: `${spec.min}〜${spec.max}`,
      score: 50, adviceJa: '計測できませんでした。撮影角度を体の真横にしてみてください。',
      weight: spec.weight, phase: spec.phase,
    }
  }
  const inRange = measured >= spec.min && measured <= spec.max
  let score: number; let advice: string
  if (inRange) {
    score = 88
    advice = `✅ ${spec.nameJa}は理想的です。`
  } else if (measured < spec.min) {
    const span = Math.max(0.01, spec.max - spec.min)
    score = Math.max(0, Math.min(70, Math.round(60 - ((spec.min - measured) / span) * 40)))
    advice = spec.lowAdvice
  } else {
    const span = Math.max(0.01, spec.max - spec.min)
    score = Math.max(0, Math.min(70, Math.round(60 - ((measured - spec.max) / span) * 40)))
    advice = spec.highAdvice
  }

  // 数値のフォーマット（角度なら整数、秒なら小数 2 位）
  const isSec = spec.id.includes('lead')
  const measuredText = isSec
    ? `${measured.toFixed(2)} 秒`
    : (spec.id.includes('forward') ? measured.toFixed(2) : `${measured.toFixed(0)}°`)
  const idealText = isSec
    ? `${spec.min.toFixed(2)}〜${spec.max.toFixed(2)} 秒`
    : (spec.id.includes('forward') ? `${spec.min.toFixed(2)}〜${spec.max.toFixed(2)}` : `${spec.min}〜${spec.max}°`)

  return {
    id: spec.id, nameJa: spec.nameJa, measured,
    measuredText, idealText, score, adviceJa: advice,
    weight: spec.weight, phase: spec.phase,
  }
}

function average(ms: FrameMetrics[]): FrameMetrics | null {
  if (ms.length === 0) return null
  const init: Record<keyof FrameMetrics, { sum: number; count: number }> = {
    tSec: { sum: 0, count: 0 },
    elbowDeg: { sum: 0, count: 0 },
    kneeDeg: { sum: 0, count: 0 },
    shoulderTilt: { sum: 0, count: 0 },
    hipTilt: { sum: 0, count: 0 },
    twistDeg: { sum: 0, count: 0 },
    chestOpenAbs: { sum: 0, count: 0 },
    contactRelFrontFoot: { sum: 0, count: 0 },
  }
  for (const m of ms) {
    for (const k of Object.keys(init) as Array<keyof FrameMetrics>) {
      const v = m[k]
      if (v !== null && v !== undefined && !Number.isNaN(v)) {
        init[k].sum += v
        init[k].count++
      }
    }
  }
  const out: FrameMetrics = {
    tSec: init.tSec.count ? init.tSec.sum / init.tSec.count : 0,
    elbowDeg: init.elbowDeg.count ? init.elbowDeg.sum / init.elbowDeg.count : null,
    kneeDeg: init.kneeDeg.count ? init.kneeDeg.sum / init.kneeDeg.count : null,
    shoulderTilt: init.shoulderTilt.count ? init.shoulderTilt.sum / init.shoulderTilt.count : null,
    hipTilt: init.hipTilt.count ? init.hipTilt.sum / init.hipTilt.count : null,
    twistDeg: init.twistDeg.count ? init.twistDeg.sum / init.twistDeg.count : null,
    chestOpenAbs: init.chestOpenAbs.count ? init.chestOpenAbs.sum / init.chestOpenAbs.count : null,
    contactRelFrontFoot: init.contactRelFrontFoot.count
      ? init.contactRelFrontFoot.sum / init.contactRelFrontFoot.count : null,
  }
  return out
}

function average2(arr: Array<number | null>): number | null {
  const xs = arr.filter((x): x is number => x !== null && !Number.isNaN(x))
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function buildCoachingText(
  shot: Shot,
  cps: CheckpointResult[],
  overall: number,
  disp: { sdX: number; sdY: number },
): string {
  const weakest = cps.filter(c => c.score < 70).sort((a, b) => a.score - b.score)[0]
  const strongest = cps.slice().sort((a, b) => b.score - a.score)[0]
  const lines: string[] = []
  lines.push(`① 総合スコアは ${overall}/100。`)
  if (weakest) {
    lines.push(`② 最優先の改善点は「${weakest.nameJa}」（計測 ${weakest.measuredText} / 理想 ${weakest.idealText}）。${weakest.adviceJa}`)
  } else {
    lines.push('② 大きな弱点はありません。安定したフォームです。')
  }
  if (strongest) lines.push(`③ 得意なのは「${strongest.nameJa}」。継続して磨きましょう。`)
  const dispScore = Math.hypot(disp.sdX, disp.sdY)
  if (dispScore > 0) {
    if (dispScore < 0.05) lines.push('④ 打点の一貫性が高く、毎回ほぼ同じ場所で捉えています。')
    else if (dispScore < 0.10) lines.push('④ 打点はそこそこ安定。位置のばらつきを減らせれば質がさらに上がります。')
    else lines.push('④ 打点のばらつきが大きめ。フットワークと準備の早さで毎回同じ位置で打つ意識を。')
  }
  return lines.join('\n')
}

function buildDrills(shot: Shot, cps: CheckpointResult[]): DrillSuggestion[] {
  const weak = cps.filter(c => c.score < 70).sort((a, b) => a.score - b.score).slice(0, 3)
  if (weak.length === 0) {
    return [{
      title: `${shot} 反復ドリル`,
      description: '良いフォームを連続 30 球で再現性を高めましょう。',
      reason: '大きな弱点なし。現状維持と一貫性向上。',
      reps: 30, minutes: 15, priority: 1,
    }]
  }
  return weak.map((cp, i) => drillFor(cp.id, cp.nameJa, cp.measuredText, i + 1))
}

function drillFor(id: string, name: string, measured: string, priority: number): DrillSuggestion {
  if (id.includes('contact_forward')) {
    return {
      title: '打点前出し・手出し球出しドリル',
      description: 'コーチや壁から手出しの緩い球を受け、体の前 +20cm で捉える感覚を反復。打点で「ラケット面が見える」位置を確認しながら 15 球。',
      reason: `${name} が理想から外れています（${measured}）。打点を前に戻す。`,
      reps: 15, minutes: 10, priority,
    }
  }
  if (id.includes('elbow')) {
    return {
      title: '肘の伸び素振りドリル',
      description: 'ラケットなしのシャドースイングで肘を伸ばし切るタイミングを 20 回。その後球出しで 15 球。',
      reason: `${name} の使い方が不十分（${measured}）。`,
      reps: 15, minutes: 8, priority,
    }
  }
  if (id.includes('knee')) {
    return {
      title: '膝の沈み込み・地面反力ドリル',
      description: 'シャドースイングで「膝を曲げて伸び上がる」リズムを 10 回。その後球出しで下半身から打つ感覚を 15 球。',
      reason: `${name} の使い方に改善余地あり（${measured}）。`,
      reps: 15, minutes: 10, priority,
    }
  }
  if (id.includes('twist')) {
    return {
      title: '肩の捻り・横向きキープドリル',
      description: '非利き手をラケットスロートに添えてテイクバックし、打つ瞬間まで肩を開かない練習を 15 球。',
      reason: `${name} が不足（${measured}）。`,
      reps: 15, minutes: 8, priority,
    }
  }
  if (id.includes('pelvis_lead') || id.includes('takeback_lead')) {
    return {
      title: 'キネティックチェーン・タイミングドリル',
      description: 'メトロノーム（90BPM）に合わせ「タン（下半身）・タン（上半身）」の 2 拍リズムで素振り 30 回 → 球出し 15 球。',
      reason: `${name} のタイミングがずれています（${measured}）。`,
      reps: 15, minutes: 10, priority,
    }
  }
  if (id.includes('chest_block')) {
    return {
      title: '胸ブロック・左手後方残しドリル（片手バック）',
      description: 'インパクト後に左手を後ろに残し、胸の向きをキープ。シャドースイング 20 → 球出し 15 球。',
      reason: `${name} が開きすぎ（${measured}）。`,
      reps: 15, minutes: 8, priority,
    }
  }
  return {
    title: `${name} 改善ドリル`,
    description: 'シャドースイングでフォーム全体を確認後、球出しで 20 球反復。',
    reason: `${name} を中心に改善（${measured}）。`,
    reps: 20, minutes: 12, priority,
  }
}
