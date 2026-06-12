/**
 * WebRTC シグナリングを QR コードで「カメラに映すだけ」交換するユーティリティ。
 *
 * - SDP（offer / answer）を gzip + base64 で圧縮（圧縮後 ~600B〜1KB）
 * - 単一 QR で済むサイズに収め、できない場合はフレーム分割（マルチパート QR）でアニメ表示
 * - スキャンは `BarcodeDetector`（モダン Chrome/Safari）優先、なければ jsQR にフォールバック
 */

import QRCode from 'qrcode'
import jsQR from 'jsqr'

/** マルチパート QR の 1 フレーム JSON 形式：`{ i, n, p }` = index, total, payload。 */
interface QrFrame {
  i: number
  n: number
  p: string
}

// ── 圧縮 ─────────────────────────────────────────────
async function gzipBase64(input: string): Promise<string> {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip')
    const writer = cs.writable.getWriter()
    writer.write(new TextEncoder().encode(input))
    writer.close()
    const chunks: Uint8Array[] = []
    const reader = cs.readable.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const total = chunks.reduce((s, c) => s + c.byteLength, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { out.set(c, off); off += c.byteLength }
    return bytesToBase64(out)
  }
  return btoa(unescape(encodeURIComponent(input)))
}

async function ungzipBase64(b64: string): Promise<string> {
  if (typeof DecompressionStream !== 'undefined') {
    const bytes = base64ToBytes(b64)
    const ds = new DecompressionStream('gzip')
    const writer = ds.writable.getWriter()
    // ArrayBuffer に明示コピーして SharedArrayBuffer 型不一致を回避
    const ab = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(ab).set(bytes)
    writer.write(new Uint8Array(ab))
    writer.close()
    const chunks: Uint8Array[] = []
    const reader = ds.readable.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const total = chunks.reduce((s, c) => s + c.byteLength, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { out.set(c, off); off += c.byteLength }
    return new TextDecoder().decode(out)
  }
  return decodeURIComponent(escape(atob(b64)))
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

// ── QR フレーム生成 ─────────────────────────────────
/**
 * 1 フレームに入れる上限。
 * QR バージョン 30（誤り訂正 L）の英数モード容量に近づけるため、以前の 700 → 1500 へ拡張。
 * 圧縮済み SDP（~600〜1200B）はほぼ常に 1 枚で収まるようになる。
 */
const MAX_PER_FRAME = 1500

/** 任意文字列を 1 つ以上の QR データ URL に変換。マルチパート時は配列。 */
export async function encodeToQRFrames(input: string): Promise<string[]> {
  const compressed = await gzipBase64(input)
  // 単フレームで足りるか
  if (compressed.length <= MAX_PER_FRAME) {
    // 1 枚で完結する場合、誤り訂正を L に下げて容量を最大化、密度を確保
    const dataUrl = await QRCode.toDataURL(JSON.stringify({ i: 0, n: 1, p: compressed }), {
      errorCorrectionLevel: 'L', margin: 1, width: 420,
    })
    return [dataUrl]
  }
  // 複数フレーム（保険）
  const n = Math.ceil(compressed.length / MAX_PER_FRAME)
  const frames: string[] = []
  for (let i = 0; i < n; i++) {
    const p = compressed.slice(i * MAX_PER_FRAME, (i + 1) * MAX_PER_FRAME)
    const frame: QrFrame = { i, n, p }
    const dataUrl = await QRCode.toDataURL(JSON.stringify(frame), {
      errorCorrectionLevel: 'L', margin: 1, width: 420,
    })
    frames.push(dataUrl)
  }
  return frames
}

// ── QR スキャン（カメラ） ─────────────────────────
export interface QrScanner {
  start: (video: HTMLVideoElement) => Promise<void>
  stop: () => void
}

/**
 * カメラから QR を連続スキャンし、マルチパート QR を組み立て切ったら resolved。
 * 進捗（received / total）はコールバックで通知。
 */
export function createQrScanner(
  onProgress: (received: number, total: number) => void,
  onComplete: (decoded: string) => void,
): QrScanner {
  let stream: MediaStream | null = null
  let raf = 0
  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let detector: any = null
  const collected = new Map<number, string>()
  let total = 1
  let finished = false

  const tryDecodeText = (text: string) => {
    let frame: QrFrame
    try {
      frame = JSON.parse(text)
    } catch { return }
    if (typeof frame.i !== 'number' || typeof frame.n !== 'number' || typeof frame.p !== 'string') return
    total = frame.n
    if (!collected.has(frame.i)) {
      collected.set(frame.i, frame.p)
      onProgress(collected.size, total)
    }
    if (collected.size === total && !finished) {
      finished = true
      const ordered: string[] = []
      for (let i = 0; i < total; i++) ordered.push(collected.get(i)!)
      const compressed = ordered.join('')
      ungzipBase64(compressed).then(onComplete).catch(() => { /* corrupt */ })
    }
  }

  const tick = async (video: HTMLVideoElement) => {
    if (finished) return
    if (video.readyState >= 2) {
      const w = video.videoWidth, h = video.videoHeight
      if (w && h) {
        if (!canvas) {
          canvas = document.createElement('canvas')
          ctx = canvas.getContext('2d', { willReadFrequently: true })!
        }
        canvas.width = w
        canvas.height = h
        ctx!.drawImage(video, 0, 0, w, h)
        if (detector) {
          try {
            const codes = await detector.detect(canvas)
            for (const c of codes) tryDecodeText(c.rawValue ?? c.cornerPoints?.[0] ?? '')
          } catch { /* noop */ }
        } else {
          const img = ctx!.getImageData(0, 0, w, h)
          const result = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
          if (result?.data) tryDecodeText(result.data)
        }
      }
    }
    raf = requestAnimationFrame(() => tick(video))
  }

  return {
    start: async (video: HTMLVideoElement) => {
      finished = false
      collected.clear()
      total = 1
      // BarcodeDetector の有無で分岐
      const W = (window as any)
      if ('BarcodeDetector' in W) {
        try {
          const supported: string[] = await W.BarcodeDetector.getSupportedFormats()
          if (supported.includes('qr_code')) {
            detector = new W.BarcodeDetector({ formats: ['qr_code'] })
          }
        } catch { detector = null }
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false,
      })
      video.srcObject = stream
      await video.play()
      tick(video)
    },
    stop: () => {
      finished = true
      if (raf) cancelAnimationFrame(raf)
      if (stream) {
        stream.getTracks().forEach(t => t.stop())
        stream = null
      }
    },
  }
}
