/**
 * リアルタイム版・ストリーミング弾道トラッカー（フェーズ2）。
 *
 * `ballTracker` の「動画全体を 1 回走査する」モデルと違い、
 * ライブカメラの 1 フレームずつを incremental に解析するためのステートマシン。
 *
 * 各フレームで：
 *  ① ballDetector で 1 点を抽出
 *  ② リングバッファ（直近数秒）に追加
 *  ③ 末尾付近で「Y 反転（バウンド）」と「Z 符号反転（ネット通過）」を逐次検出
 *  ④ ホモグラフィでイン/アウト判定、バウンド前後の速度比でスピン推定
 *
 * 旧 ballTracker と異なる注意点：
 *  - フレーム間で時刻が一定でない（30〜60fps の揺らぎ） → dt はリングから実測
 *  - 検出が抜けるフレームもある → ヒント連続性で補い、欠損は描画側で線形補間
 */

import { detectBallInFrame } from './ballDetector'
import { applyHomography, type Mat3 } from './homography'
import { COURT } from './courtStats'

export interface LivePoint {
  /** 動画開始からの時刻 [s]（performance.now ベース）。 */
  tSec: number
  /** 画像座標 0..1。 */
  x: number
  y: number
  /** コート投影 (X, Z) [m]（H あれば）。 */
  courtX: number
  courtZ: number
  radiusPx: number
}

export type LiveVerdict = 'IN' | 'OUT' | 'UNKNOWN'

export interface LiveBounce {
  tSec: number
  x: number
  y: number
  courtX: number
  courtZ: number
  verdict: LiveVerdict
  spin: 'TOPSPIN' | 'SLICE' | 'FLAT' | 'UNKNOWN'
}

export interface LiveNetCross {
  tSec: number
  x: number
  y: number
  heightM: number
}

export interface LiveTrackerEvents {
  onBounce?: (b: LiveBounce) => void
  onNetCross?: (n: LiveNetCross) => void
}

const RING_SECONDS = 3.0      // 残像/解析窓
const MAX_RING = 240          // 最大点数（80fps 想定でも 3 秒分）

export class LiveBallTracker {
  private points: LivePoint[] = []
  private bounces: LiveBounce[] = []
  private netCrossings: LiveNetCross[] = []
  private lastBounceAt = -Infinity
  private lastNetAt = -Infinity
  private lastHint?: [number, number]
  private H: Mat3 | null
  private halfW: number
  private events: LiveTrackerEvents

  constructor(H: Mat3 | null, courtType: 'SINGLES' | 'DOUBLES', events: LiveTrackerEvents = {}) {
    this.H = H
    this.halfW = courtType === 'SINGLES' ? COURT.SINGLES_HALF_W : COURT.DOUBLES_HALF_W
    this.events = events
  }

  /** 現在の軌跡（直近 RING_SECONDS 秒）。 */
  getPoints(): LivePoint[] { return this.points }
  getBounces(): LiveBounce[] { return this.bounces }
  getNetCrossings(): LiveNetCross[] { return this.netCrossings }

  reset() {
    this.points = []
    this.bounces = []
    this.netCrossings = []
    this.lastHint = undefined
  }

  /**
   * 1 フレーム処理。video の現在表示フレームに対して検出を回す。
   * tSec は呼び出し側で計測（performance.now 起点）。
   */
  feed(video: HTMLVideoElement, tSec: number, maxSide = 384) {
    const r = detectBallInFrame(video, { hint: this.lastHint, maxSide })
    if (r) {
      this.lastHint = r.pos
      let cx = 0, cz = 0
      if (this.H) {
        const c = applyHomography(this.H, r.pos[0], r.pos[1])
        cx = c[0]; cz = c[1]
      }
      const p: LivePoint = {
        tSec, x: r.pos[0], y: r.pos[1],
        courtX: cx, courtZ: cz, radiusPx: r.radiusPx,
      }
      this.push(p)
      this.detectBounceAtTail()
      this.detectNetAtTail()
    }
    this.trim(tSec)
  }

  private push(p: LivePoint) {
    this.points.push(p)
    if (this.points.length > MAX_RING) this.points.shift()
  }

  private trim(now: number) {
    while (this.points.length > 0 && now - this.points[0].tSec > RING_SECONDS) {
      this.points.shift()
    }
    while (this.bounces.length > 0 && now - this.bounces[0].tSec > RING_SECONDS) {
      this.bounces.shift()
    }
    while (this.netCrossings.length > 0 && now - this.netCrossings[0].tSec > RING_SECONDS) {
      this.netCrossings.shift()
    }
  }

  /** 末尾付近の 5 点で y の極大を検出。500ms 以内の連続検出は抑制。 */
  private detectBounceAtTail() {
    const n = this.points.length
    if (n < 5) return
    const i = n - 3   // 末尾から 2 つ前を候補にして前後を見る
    if (i < 2) return
    const prev = this.points[i - 2]
    const cur = this.points[i]
    const next = this.points[i + 2]
    const goingDown = cur.y - prev.y > 0.004
    const goingUp = next.y - cur.y < -0.004
    if (!goingDown || !goingUp) return
    if (cur.tSec - this.lastBounceAt < 0.5) return
    this.lastBounceAt = cur.tSec

    const verdict = this.judge(cur.courtX, cur.courtZ)
    const spin = this.estimateSpin(i)
    const b: LiveBounce = {
      tSec: cur.tSec, x: cur.x, y: cur.y,
      courtX: cur.courtX, courtZ: cur.courtZ, verdict, spin,
    }
    this.bounces.push(b)
    this.events.onBounce?.(b)
  }

  private detectNetAtTail() {
    const n = this.points.length
    if (n < 2 || !this.H) return
    const a = this.points[n - 2]
    const b = this.points[n - 1]
    if (a.tSec === b.tSec) return
    if ((a.courtZ < 0 && b.courtZ > 0) || (a.courtZ > 0 && b.courtZ < 0)) {
      if (b.tSec - this.lastNetAt < 0.5) return
      this.lastNetAt = b.tSec
      const t = Math.abs(a.courtZ) / Math.max(1e-6, Math.abs(a.courtZ) + Math.abs(b.courtZ))
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      const nc: LiveNetCross = {
        tSec: a.tSec + (b.tSec - a.tSec) * t,
        x, y, heightM: 1.0,  // 単視点の近似（描画用）
      }
      this.netCrossings.push(nc)
      this.events.onNetCross?.(nc)
    }
  }

  private judge(courtX: number, courtZ: number): LiveVerdict {
    if (!this.H || !isFinite(courtX) || !isFinite(courtZ)) return 'UNKNOWN'
    const inX = Math.abs(courtX) <= this.halfW + 0.1
    const inZ = Math.abs(courtZ) <= COURT.HALF_LEN + 0.1
    return inX && inZ ? 'IN' : 'OUT'
  }

  private estimateSpin(i: number): LiveBounce['spin'] {
    const before = this.points[Math.max(0, i - 3)]
    const cur = this.points[i]
    const after = this.points[Math.min(this.points.length - 1, i + 3)]
    const inVy = cur.y - before.y
    const outVy = after.y - cur.y
    if (inVy <= 0) return 'UNKNOWN'
    const ratio = -outVy / inVy
    if (ratio > 1.2) return 'TOPSPIN'
    if (ratio < 0.7) return 'SLICE'
    return 'FLAT'
  }
}
