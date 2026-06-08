/**
 * 試合・練習動画から「ラリー中（オンプレイ）」だけを音響的に抽出するライブラリ。
 *
 * SwingVision / PlaySight が舞台裏でやっているのと同様のアプローチ：
 *  - 打球音は短時間（〜30 ms）で高エネルギーの「過渡音」。広帯域だが
 *    2–8 kHz に強いピークを持つ（ガット衝撃音）。
 *  - 動画の音声トラック全体を Web Audio で AudioBuffer に展開し、
 *    高域強調 → 短時間エネルギー → 適応スレッショルドで「インパクト候補」を検出。
 *  - インパクトが ~5 秒以内に連続しているクラスタを「ラリー」と判定。
 *  - ラリー前後に余白（pad）を付け、デッドタイムを 100% スキップ可能にする。
 *
 * Web 上で OS のオーディオモデル（Create ML / TFLite）は使えないが、
 * ハンドメイドの特徴量（高域 RMS）でも十分に高精度を出せる。
 */

export interface ImpactHit {
  /** 動画開始からの時刻 [s]。 */
  tSec: number
  /** 検出強度（0..1）。 */
  strength: number
}

export interface RallySegment {
  /** ラリー開始時刻 [s]（前余白を含む）。 */
  startSec: number
  endSec: number
  /** 含まれるインパクト数。 */
  shots: number
  /** 強度の最大値（0..1）。 */
  peakStrength: number
}

export interface DetectOpts {
  /** インパクト前後の余白 [s]。 */
  padBeforeSec?: number
  padAfterSec?: number
  /** これ以上離れたインパクトは別ラリー [s]。 */
  maxGapSec?: number
  /** ラリーとして残す最低ショット数。 */
  minShotsPerRally?: number
  /** 検出スレッショルド（適応 + 固定下限）。 */
  fixedFloor?: number
}

const DEFAULTS: Required<DetectOpts> = {
  padBeforeSec: 1.5,
  padAfterSec: 1.0,
  maxGapSec: 4.5,
  minShotsPerRally: 1,
  fixedFloor: 0.05,
}

/**
 * Blob（録画動画）から AudioBuffer を取り出す。
 * Safari は WebCodecs を持たないが、AudioContext.decodeAudioData が
 * 多くの動画コンテナ／コーデックに対応しているため、これを使う。
 */
export async function decodeAudioFromBlob(blob: Blob): Promise<AudioBuffer> {
  const buf = await blob.arrayBuffer()
  const Ctx: typeof AudioContext = (window.AudioContext ?? (window as any).webkitAudioContext)
  const ctx = new Ctx({ sampleRate: 48000 })
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0))
    return audio
  } finally {
    // BaseAudioContext.close は AudioContext のみ
    if ('close' in ctx) ctx.close()
  }
}

/** AudioBuffer から「打球らしいインパクト」候補を検出。 */
export function detectImpacts(audio: AudioBuffer): ImpactHit[] {
  const sr = audio.sampleRate
  // モノラル化（チャンネル平均）
  const len = audio.length
  const mono = new Float32Array(len)
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const src = audio.getChannelData(ch)
    for (let i = 0; i < len; i++) mono[i] += src[i]
  }
  if (audio.numberOfChannels > 1) {
    const inv = 1 / audio.numberOfChannels
    for (let i = 0; i < len; i++) mono[i] *= inv
  }

  // 1) 高域強調（簡易 1 次 HPF, ~1.5 kHz）
  //    y[n] = α (y[n-1] + x[n] - x[n-1])
  const fc = 1500
  const dt = 1 / sr
  const RC = 1 / (2 * Math.PI * fc)
  const alpha = RC / (RC + dt)
  const hp = new Float32Array(len)
  let prevY = 0, prevX = 0
  for (let i = 0; i < len; i++) {
    const x = mono[i]
    const y = alpha * (prevY + x - prevX)
    hp[i] = y
    prevX = x; prevY = y
  }

  // 2) 短時間 RMS（ウィンドウ 15 ms、ホップ 5 ms）
  const win = Math.round(sr * 0.015)
  const hop = Math.round(sr * 0.005)
  const nFrames = Math.max(0, Math.floor((len - win) / hop))
  const energy = new Float32Array(nFrames)
  for (let f = 0; f < nFrames; f++) {
    const start = f * hop
    let s = 0
    for (let i = 0; i < win; i++) {
      const v = hp[start + i]
      s += v * v
    }
    energy[f] = Math.sqrt(s / win)
  }

  // 3) 過渡度（onset）：差分の正値部分
  const onset = new Float32Array(nFrames)
  for (let f = 1; f < nFrames; f++) {
    const d = energy[f] - energy[f - 1]
    onset[f] = d > 0 ? d : 0
  }

  // 4) 局所適応スレッショルド：±0.5 s 移動平均 × 倍率
  const localWin = Math.round(0.5 / (hop / sr))
  const thr = new Float32Array(nFrames)
  let runSum = 0
  for (let f = 0; f < nFrames; f++) {
    runSum += onset[f]
    if (f >= localWin) runSum -= onset[f - localWin]
    const denom = Math.min(f + 1, localWin)
    thr[f] = (runSum / denom) * 3.5
  }

  // 5) ピーク抽出：局所最大 ＆ thr 超え ＆ 固定下限超え
  const hits: ImpactHit[] = []
  const minGapFrames = Math.round(0.20 / (hop / sr))   // 200 ms 以内の重複ピークは除外
  let lastIdx = -minGapFrames * 2
  // 強度正規化用
  let maxOnset = 0
  for (let f = 0; f < nFrames; f++) if (onset[f] > maxOnset) maxOnset = onset[f]
  const floor = (DEFAULTS.fixedFloor) * maxOnset

  for (let f = 1; f < nFrames - 1; f++) {
    const v = onset[f]
    if (v <= thr[f] || v < floor) continue
    if (onset[f - 1] > v || onset[f + 1] > v) continue
    if (f - lastIdx < minGapFrames) continue
    lastIdx = f
    hits.push({
      tSec: (f * hop) / sr,
      strength: maxOnset > 0 ? v / maxOnset : 0,
    })
  }
  return hits
}

/** インパクト列を「ラリー」にクラスタリング。 */
export function clusterRallies(
  hits: ImpactHit[], opts: DetectOpts = {},
): RallySegment[] {
  const o = { ...DEFAULTS, ...opts }
  if (hits.length === 0) return []
  const sorted = hits.slice().sort((a, b) => a.tSec - b.tSec)
  const out: RallySegment[] = []
  let cur: { start: number; end: number; shots: number; peak: number } | null = null
  for (const h of sorted) {
    if (!cur) {
      cur = { start: h.tSec, end: h.tSec, shots: 1, peak: h.strength }
      continue
    }
    if (h.tSec - cur.end > o.maxGapSec) {
      if (cur.shots >= o.minShotsPerRally) {
        out.push({
          startSec: Math.max(0, cur.start - o.padBeforeSec),
          endSec: cur.end + o.padAfterSec,
          shots: cur.shots,
          peakStrength: cur.peak,
        })
      }
      cur = { start: h.tSec, end: h.tSec, shots: 1, peak: h.strength }
    } else {
      cur.end = h.tSec
      cur.shots++
      if (h.strength > cur.peak) cur.peak = h.strength
    }
  }
  if (cur && cur.shots >= o.minShotsPerRally) {
    out.push({
      startSec: Math.max(0, cur.start - o.padBeforeSec),
      endSec: cur.end + o.padAfterSec,
      shots: cur.shots,
      peakStrength: cur.peak,
    })
  }
  // 重なる範囲のマージ
  out.sort((a, b) => a.startSec - b.startSec)
  const merged: RallySegment[] = []
  for (const s of out) {
    const last = merged[merged.length - 1]
    if (last && s.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, s.endSec)
      last.shots += s.shots
      last.peakStrength = Math.max(last.peakStrength, s.peakStrength)
    } else {
      merged.push({ ...s })
    }
  }
  return merged
}

/** 動画全長におけるラリー時間の割合（%）。 */
export function inPlayRatio(rallies: RallySegment[], durationSec: number): number {
  if (durationSec <= 0) return 0
  let sum = 0
  for (const r of rallies) sum += Math.max(0, r.endSec - r.startSec)
  return Math.min(100, (sum / durationSec) * 100)
}

/** Blob から検出までを 1 関数で。重い処理なので呼び出し側でローディング表示すること。 */
export async function analyzeRallies(
  blob: Blob, opts: DetectOpts = {},
): Promise<{ hits: ImpactHit[]; rallies: RallySegment[] }> {
  const audio = await decodeAudioFromBlob(blob)
  const hits = detectImpacts(audio)
  const rallies = clusterRallies(hits, opts)
  return { hits, rallies }
}
