/**
 * syncSession — 2 台のスマホをサーバなしで連動させる「マルチアングル完全同期撮影」基盤。
 *
 * 設計方針：
 *  - シグナリングサーバを持たない（オフライン／同一 LAN でも動く）ため、
 *    WebRTC の offer/answer は手動コード交換（コピペ or QR）で行う。
 *  - ICE は non-trickle（gathering 完了まで待ってから 1 つのコードにまとめる）。
 *  - 制御チャンネル（RTCDataChannel）で：
 *      ・NTP 風の時計オフセット同期
 *      ・録画 開始／停止 のブロードキャスト
 *      ・録画後の動画ファイル転送（チャンク）
 *
 * 役割：
 *  - HOST（親機・後方カメラ）：offer を生成、録画開始時刻を決定。
 *  - GUEST（子機・サイドカメラ）：offer を受け取り answer を返す。
 */

export type Role = 'HOST' | 'GUEST'
export type CameraRole = 'BACK' | 'SIDE'

export type ConnState =
  | 'IDLE'
  | 'CREATING_OFFER'
  | 'WAITING_ANSWER'
  | 'CREATING_ANSWER'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'FAILED'
  | 'CLOSED'

/** 受信した相手の動画。 */
export interface ReceivedVideo {
  blob: Blob
  mime: string
  durationSec: number
  cameraRole: CameraRole
  /** 録画開始の壁時計時刻（ホスト基準 epoch ms）。 */
  startEpoch: number
}

export interface SyncEvents {
  onState?: (s: ConnState) => void
  onClockSynced?: (offsetMs: number, rttMs: number) => void
  /** 録画開始の合図（atEpoch はホスト基準 epoch ms）。 */
  onStart?: (atEpoch: number) => void
  onStop?: () => void
  /** 相手のカメラ役割が割り当てられた／変わった。 */
  onRole?: (myCameraRole: CameraRole) => void
  /** 動画受信の進捗（0..1）。 */
  onReceiveProgress?: (ratio: number) => void
  /** 相手の動画を受信完了。 */
  onVideoReceived?: (v: ReceivedVideo) => void
  /** 動画送信の進捗（0..1）。 */
  onSendProgress?: (ratio: number) => void
}

type Msg =
  | { t: 'ping'; t0: number }
  | { t: 'pong'; t0: number; t1: number; t2: number }
  | { t: 'role'; guestCamera: CameraRole }
  | { t: 'start'; atEpoch: number }
  | { t: 'stop' }
  | { t: 'file-begin'; mime: string; size: number; durationSec: number; cameraRole: CameraRole; startEpoch: number }
  | { t: 'file-end' }

const CHUNK_SIZE = 16 * 1024
const BUFFER_HIGH = 4 * 1024 * 1024   // backpressure 閾値

/** ICE gathering 完了まで待って完全な SDP を得る。 */
function waitForIceComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise(resolve => {
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', check)
    // 保険：一定時間で打ち切り（収集済み候補で接続を試みる）
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check)
      resolve()
    }, 3000)
  })
}

function encodeSignal(desc: RTCSessionDescriptionInit): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(desc))))
}
function decodeSignal(code: string): RTCSessionDescriptionInit {
  return JSON.parse(decodeURIComponent(escape(atob(code.trim()))))
}

export class SyncSession {
  private pc: RTCPeerConnection
  private channel: RTCDataChannel | null = null
  private events: SyncEvents
  readonly role: Role
  private state: ConnState = 'IDLE'

  /** 時計オフセット = (自分の Date.now) - (相手の Date.now)。相手時刻 + offset = 自分時刻。 */
  clockOffsetMs = 0
  bestRttMs = Infinity

  // ファイル受信バッファ
  private rxChunks: ArrayBuffer[] = []
  private rxMeta: Extract<Msg, { t: 'file-begin' }> | null = null
  private rxReceived = 0

  constructor(role: Role, events: SyncEvents = {}) {
    this.role = role
    this.events = events
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })
    this.pc.addEventListener('connectionstatechange', () => {
      const cs = this.pc.connectionState
      if (cs === 'connected') this.setState('CONNECTED')
      else if (cs === 'failed') this.setState('FAILED')
      else if (cs === 'closed' || cs === 'disconnected') this.setState('CLOSED')
    })
    // GUEST 側はホストが作ったチャンネルを受け取る
    this.pc.addEventListener('datachannel', e => {
      this.channel = e.channel
      this.wireChannel()
    })
  }

  private setState(s: ConnState) {
    this.state = s
    this.events.onState?.(s)
  }
  getState() { return this.state }

  // ── シグナリング（手動コード交換） ────────────────────
  /** HOST：offer コードを生成。 */
  async createOffer(): Promise<string> {
    this.setState('CREATING_OFFER')
    this.channel = this.pc.createDataChannel('control', { ordered: true })
    this.channel.binaryType = 'arraybuffer'
    this.wireChannel()
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    await waitForIceComplete(this.pc)
    this.setState('WAITING_ANSWER')
    return encodeSignal(this.pc.localDescription!)
  }

  /** HOST：GUEST から受け取った answer コードを適用。 */
  async acceptAnswer(answerCode: string): Promise<void> {
    this.setState('CONNECTING')
    await this.pc.setRemoteDescription(decodeSignal(answerCode))
  }

  /** GUEST：HOST の offer コードから answer コードを生成。 */
  async createAnswer(offerCode: string): Promise<string> {
    this.setState('CREATING_ANSWER')
    await this.pc.setRemoteDescription(decodeSignal(offerCode))
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    await waitForIceComplete(this.pc)
    this.setState('CONNECTING')
    return encodeSignal(this.pc.localDescription!)
  }

  // ── データチャンネル ──────────────────────────────────
  private wireChannel() {
    const ch = this.channel
    if (!ch) return
    ch.binaryType = 'arraybuffer'
    ch.addEventListener('open', () => {
      this.setState('CONNECTED')
      // GUEST 側が接続したら時計同期を開始
      if (this.role === 'GUEST') this.startClockSync()
    })
    ch.addEventListener('message', e => this.onMessage(e.data))
  }

  private send(msg: Msg) {
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify(msg))
    }
  }

  private onMessage(data: unknown) {
    if (typeof data === 'string') {
      const msg = JSON.parse(data) as Msg
      this.handleControl(msg)
    } else if (data instanceof ArrayBuffer) {
      this.onChunk(data)
    }
  }

  private handleControl(msg: Msg) {
    switch (msg.t) {
      case 'ping': {
        // HOST が受信：t1=受信時刻, t2=送信時刻
        const t1 = Date.now()
        this.send({ t: 'pong', t0: msg.t0, t1, t2: Date.now() })
        break
      }
      case 'pong': {
        // GUEST が受信：NTP 風オフセット計算
        const t3 = Date.now()
        const { t0, t1, t2 } = msg
        const rtt = (t3 - t0) - (t2 - t1)
        const offset = ((t1 - t0) + (t2 - t3)) / 2  // = guest - host
        if (rtt < this.bestRttMs) {
          this.bestRttMs = rtt
          this.clockOffsetMs = offset
          this.events.onClockSynced?.(offset, rtt)
        }
        break
      }
      case 'role':
        // GUEST が受け取る：自分のカメラ役割
        this.events.onRole?.(msg.guestCamera)
        break
      case 'start':
        this.events.onStart?.(msg.atEpoch)
        break
      case 'stop':
        this.events.onStop?.()
        break
      case 'file-begin':
        this.rxMeta = msg
        this.rxChunks = []
        this.rxReceived = 0
        this.events.onReceiveProgress?.(0)
        break
      case 'file-end': {
        if (this.rxMeta) {
          const blob = new Blob(this.rxChunks, { type: this.rxMeta.mime })
          this.events.onVideoReceived?.({
            blob,
            mime: this.rxMeta.mime,
            durationSec: this.rxMeta.durationSec,
            cameraRole: this.rxMeta.cameraRole,
            startEpoch: this.rxMeta.startEpoch,
          })
        }
        this.rxMeta = null
        this.rxChunks = []
        break
      }
    }
  }

  private onChunk(buf: ArrayBuffer) {
    if (!this.rxMeta) return
    this.rxChunks.push(buf)
    this.rxReceived += buf.byteLength
    this.events.onReceiveProgress?.(Math.min(1, this.rxReceived / this.rxMeta.size))
  }

  // ── 時計同期 ──────────────────────────────────────────
  private clockSyncTimer: number | null = null
  startClockSync(rounds = 12) {
    let n = 0
    const tick = () => {
      if (n >= rounds || this.channel?.readyState !== 'open') {
        if (this.clockSyncTimer) clearInterval(this.clockSyncTimer)
        this.clockSyncTimer = null
        return
      }
      this.send({ t: 'ping', t0: Date.now() })
      n++
    }
    if (this.clockSyncTimer) clearInterval(this.clockSyncTimer)
    this.clockSyncTimer = window.setInterval(tick, 150)
    tick()
  }

  /** HOST：相手の epoch 時刻を自分のローカル時刻に変換。 */
  hostEpochToLocal(hostEpoch: number): number {
    // 自分が HOST なら同一基準。GUEST なら +offset。
    return this.role === 'HOST' ? hostEpoch : hostEpoch + this.clockOffsetMs
  }

  // ── 録画 開始／停止 の合図 ───────────────────────────
  /** HOST：カメラ役割を GUEST に割り当て。 */
  assignGuestCamera(cam: CameraRole) {
    this.send({ t: 'role', guestCamera: cam })
  }

  /** HOST：leadMs 後に録画開始する合図を送り、自分の開始 epoch を返す。 */
  broadcastStart(leadMs = 1500): number {
    const atEpoch = Date.now() + leadMs
    this.send({ t: 'start', atEpoch })
    return atEpoch
  }

  broadcastStop() {
    this.send({ t: 'stop' })
  }

  // ── 動画ファイル転送 ─────────────────────────────────
  async sendVideo(
    blob: Blob, mime: string, durationSec: number,
    cameraRole: CameraRole, startEpoch: number,
  ): Promise<void> {
    const ch = this.channel
    if (!ch || ch.readyState !== 'open') throw new Error('接続されていません')
    this.send({
      t: 'file-begin', mime, size: blob.size, durationSec, cameraRole, startEpoch,
    })
    const total = blob.size
    let sent = 0
    let offset = 0
    while (offset < total) {
      const slice = blob.slice(offset, offset + CHUNK_SIZE)
      const buf = await slice.arrayBuffer()
      // backpressure：送信バッファが膨らんだら吐けるまで待つ
      while (ch.bufferedAmount > BUFFER_HIGH) {
        await new Promise(r => setTimeout(r, 20))
      }
      ch.send(buf)
      offset += buf.byteLength
      sent += buf.byteLength
      this.events.onSendProgress?.(Math.min(1, sent / total))
    }
    this.send({ t: 'file-end' })
  }

  close() {
    if (this.clockSyncTimer) clearInterval(this.clockSyncTimer)
    try { this.channel?.close() } catch { /* noop */ }
    try { this.pc.close() } catch { /* noop */ }
    this.setState('CLOSED')
  }
}
