/**
 * syncSession — 2 台のスマホを連動させる「マルチアングル完全同期撮影」基盤。
 *
 * 2 つの接続モードに対応：
 *  - 「PIN モード（推奨）」：4 桁の数字を入力すると公衆 PeerJS ブローカ経由で
 *    自動マッチング。シグナリングだけサーバ経由、データは WebRTC P2P。
 *    Bluetooth ペアリングのような「番号 1 つで繋がる」体感を実現。
 *  - 「手動コードモード（フォールバック）」：完全オフライン／ブローカ不達時用。
 *    WebRTC の SDP を手で交換する。
 *
 * 接続後は同じ制御チャンネル上で：
 *   ・NTP 風の時計オフセット同期
 *   ・録画 開始／停止 のブロードキャスト
 *   ・録画後の動画ファイル転送（チャンク）
 *
 * 役割：
 *  - HOST（親機・後方カメラ）：PIN を発行（または受信した PIN で待ち受け）、録画開始時刻を決定。
 *  - GUEST（子機・サイドカメラ）：HOST の PIN に接続する。
 */

import Peer, { type DataConnection } from 'peerjs'

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

/**
 * PeerJS で使う「Peer ID」のプレフィックス＋PIN。
 * 公衆ブローカ上で衝突を避けるためアプリ固有プレフィックスを付ける。
 */
const PEER_ID_PREFIX = 'tennis-ai-coach-sync-'
const peerId = (pin: string) => PEER_ID_PREFIX + pin

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

/** 4 桁のランダム PIN（衝突したら別端末がリトライ）。 */
export function generatePin(): string {
  const n = Math.floor(Math.random() * 10000)
  return n.toString().padStart(4, '0')
}

/**
 * チャンネル抽象：RTCDataChannel（手動モード）／PeerJS DataConnection（PIN モード）
 * 両方に対応するための統一インターフェース。
 */
interface ChannelLike {
  send: (data: string | ArrayBuffer) => void
  close: () => void
  readyState: () => 'open' | 'closed' | 'connecting'
  bufferedAmount: () => number
}

export class SyncSession {
  private pc: RTCPeerConnection | null = null
  private peer: Peer | null = null
  private conn: DataConnection | null = null
  private channel: ChannelLike | null = null
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
  }

  private setState(s: ConnState) {
    this.state = s
    this.events.onState?.(s)
  }
  getState() { return this.state }

  // ════════════════════════════════════════════════════════
  //  ① PIN モード（推奨：4 桁の数字だけで自動マッチ）
  // ════════════════════════════════════════════════════════

  /**
   * HOST：PIN で待ち受け。
   *  - すでに同じ PIN を使っている端末があれば衝突するので、呼び出し側で別 PIN を試す。
   *  - 接続が確立したら CONNECTED 状態へ。
   */
  async hostWithPin(pin: string): Promise<void> {
    this.setState('CREATING_OFFER')
    this.peer = new Peer(peerId(pin), { debug: 0 })
    return new Promise((resolve, reject) => {
      const p = this.peer!
      p.on('open', () => {
        this.setState('WAITING_ANSWER')
        resolve()
      })
      p.on('error', (err) => {
        // PIN 衝突など
        if (this.state !== 'CONNECTED') {
          this.setState('FAILED')
          reject(err)
        }
      })
      p.on('connection', (conn) => {
        this.conn = conn
        this.attachPeerConnection(conn)
      })
    })
  }

  /** GUEST：HOST の PIN に接続。 */
  async joinWithPin(pin: string): Promise<void> {
    this.setState('CONNECTING')
    this.peer = new Peer({ debug: 0 })
    return new Promise((resolve, reject) => {
      const p = this.peer!
      p.on('open', () => {
        const conn = p.connect(peerId(pin), { reliable: true })
        this.conn = conn
        this.attachPeerConnection(conn)
        conn.on('open', () => resolve())
        conn.on('error', (err) => reject(err))
        // タイムアウト
        setTimeout(() => {
          if (this.state !== 'CONNECTED') reject(new Error('接続タイムアウト：PIN を確認してください'))
        }, 15000)
      })
      p.on('error', (err) => {
        this.setState('FAILED')
        reject(err)
      })
    })
  }

  private attachPeerConnection(conn: DataConnection) {
    this.channel = {
      send: (data) => {
        // PeerJS は文字列/オブジェクト/ArrayBuffer を直接送れる
        conn.send(data)
      },
      close: () => { try { conn.close() } catch { /* noop */ } },
      readyState: () => (conn.open ? 'open' : 'closed'),
      bufferedAmount: () => (conn as any).dataChannel?.bufferedAmount ?? 0,
    }
    conn.on('open', () => {
      this.setState('CONNECTED')
      if (this.role === 'GUEST') this.startClockSync()
    })
    conn.on('data', (data) => this.onMessage(data))
    conn.on('close', () => this.setState('CLOSED'))
    conn.on('error', () => this.setState('FAILED'))
  }

  // ════════════════════════════════════════════════════════
  //  ② 手動コードモード（フォールバック・完全オフライン）
  // ════════════════════════════════════════════════════════

  private initManualPc(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })
    pc.addEventListener('connectionstatechange', () => {
      const cs = pc.connectionState
      if (cs === 'connected') this.setState('CONNECTED')
      else if (cs === 'failed') this.setState('FAILED')
      else if (cs === 'closed' || cs === 'disconnected') this.setState('CLOSED')
    })
    pc.addEventListener('datachannel', e => this.attachRtcChannel(e.channel))
    this.pc = pc
    return pc
  }

  private attachRtcChannel(ch: RTCDataChannel) {
    ch.binaryType = 'arraybuffer'
    this.channel = {
      send: (data) => ch.send(data as any),
      close: () => { try { ch.close() } catch { /* noop */ } },
      readyState: () => ch.readyState as any,
      bufferedAmount: () => ch.bufferedAmount,
    }
    ch.addEventListener('open', () => {
      this.setState('CONNECTED')
      if (this.role === 'GUEST') this.startClockSync()
    })
    ch.addEventListener('message', e => this.onMessage(e.data))
  }

  /** HOST：offer コードを生成（手動モード）。 */
  async createOffer(): Promise<string> {
    this.setState('CREATING_OFFER')
    const pc = this.initManualPc()
    const ch = pc.createDataChannel('control', { ordered: true })
    this.attachRtcChannel(ch)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceComplete(pc)
    this.setState('WAITING_ANSWER')
    return encodeSignal(pc.localDescription!)
  }

  /** HOST：GUEST から受け取った answer コードを適用。 */
  async acceptAnswer(answerCode: string): Promise<void> {
    if (!this.pc) throw new Error('PC 未初期化')
    this.setState('CONNECTING')
    await this.pc.setRemoteDescription(decodeSignal(answerCode))
  }

  /** GUEST：HOST の offer コードから answer コードを生成。 */
  async createAnswer(offerCode: string): Promise<string> {
    this.setState('CREATING_ANSWER')
    const pc = this.initManualPc()
    await pc.setRemoteDescription(decodeSignal(offerCode))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceComplete(pc)
    this.setState('CONNECTING')
    return encodeSignal(pc.localDescription!)
  }

  // ════════════════════════════════════════════════════════
  //  共通：制御メッセージ／時計同期／録画／ファイル転送
  // ════════════════════════════════════════════════════════

  private send(msg: Msg) {
    if (this.channel?.readyState() === 'open') {
      this.channel.send(JSON.stringify(msg))
    }
  }

  private onMessage(data: unknown) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data) as Msg
        this.handleControl(msg)
      } catch { /* noop */ }
    } else if (data instanceof ArrayBuffer) {
      this.onChunk(data)
    } else if (data && typeof data === 'object' && 't' in (data as any)) {
      // PeerJS はオブジェクトを直接渡してくることがある
      this.handleControl(data as Msg)
    } else if (ArrayBuffer.isView(data)) {
      this.onChunk((data as ArrayBufferView).buffer as ArrayBuffer)
    }
  }

  private handleControl(msg: Msg) {
    switch (msg.t) {
      case 'ping': {
        const t1 = Date.now()
        this.send({ t: 'pong', t0: msg.t0, t1, t2: Date.now() })
        break
      }
      case 'pong': {
        const t3 = Date.now()
        const { t0, t1, t2 } = msg
        const rtt = (t3 - t0) - (t2 - t1)
        const offset = ((t1 - t0) + (t2 - t3)) / 2
        if (rtt < this.bestRttMs) {
          this.bestRttMs = rtt
          this.clockOffsetMs = offset
          this.events.onClockSynced?.(offset, rtt)
        }
        break
      }
      case 'role':
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

  // ── 時計同期 ──
  private clockSyncTimer: number | null = null
  startClockSync(rounds = 12) {
    let n = 0
    const tick = () => {
      if (n >= rounds || this.channel?.readyState() !== 'open') {
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
    return this.role === 'HOST' ? hostEpoch : hostEpoch + this.clockOffsetMs
  }

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

  // ── 動画ファイル転送 ──
  async sendVideo(
    blob: Blob, mime: string, durationSec: number,
    cameraRole: CameraRole, startEpoch: number,
  ): Promise<void> {
    const ch = this.channel
    if (!ch || ch.readyState() !== 'open') throw new Error('接続されていません')
    this.send({
      t: 'file-begin', mime, size: blob.size, durationSec, cameraRole, startEpoch,
    })
    const total = blob.size
    let sent = 0
    let offset = 0
    while (offset < total) {
      const slice = blob.slice(offset, offset + CHUNK_SIZE)
      const buf = await slice.arrayBuffer()
      while (ch.bufferedAmount() > BUFFER_HIGH) {
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
    try { this.conn?.close() } catch { /* noop */ }
    try { this.peer?.destroy() } catch { /* noop */ }
    try { this.pc?.close() } catch { /* noop */ }
    this.setState('CLOSED')
  }
}
