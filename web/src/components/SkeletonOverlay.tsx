import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { SKELETON_EDGES } from '../lib/poseDetector'

interface Props {
  landmarks: NormalizedLandmark[] | null
  /** プロ理想フォームの骨格を半透明オーバーレイ。 */
  idealLandmarks?: NormalizedLandmark[] | null
  /**
   * 描画位置を <video> の表示矩形に正確に合わせるためのリファレンス。
   * MediaPipe の正規化座標 [0..1] は元映像のフレーム基準なので、
   * object-fit による letterbox / crop を考慮して描く必要がある。
   */
  videoRef: React.RefObject<HTMLVideoElement>
  /** <video> の object-fit。'contain' = レターボックス, 'cover' = はみ出しクロップ。 */
  objectFit?: 'contain' | 'cover'
  /** mirror = true でカメラ映像と同期して左右反転（フロントカメラ用）。 */
  mirror?: boolean
  /** 色。 */
  color?: string
  idealColor?: string
}

interface Rect {
  /** キャンバスの実寸（CSSピクセル）。 */
  canvasW: number
  canvasH: number
  /** 映像が表示されている矩形（CSSピクセル、キャンバス左上が原点）。 */
  videoX: number
  videoY: number
  videoW: number
  videoH: number
}

export function SkeletonOverlay({
  landmarks, idealLandmarks, videoRef, objectFit = 'contain', mirror = false,
  color = '#42A5F5', idealColor = '#F9A825',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rect, setRect] = useState<Rect | null>(null)

  // ── キャンバスのサイズと、映像の表示矩形を追跡 ──
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const compute = (): Rect | null => {
      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      if (cw <= 0 || ch <= 0) return null
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!vw || !vh) {
        return { canvasW: cw, canvasH: ch, videoX: 0, videoY: 0, videoW: cw, videoH: ch }
      }
      const cAspect = cw / ch
      const vAspect = vw / vh
      let rW = cw, rH = ch, rX = 0, rY = 0
      if (objectFit === 'contain') {
        if (vAspect > cAspect) {
          rW = cw
          rH = cw / vAspect
          rX = 0
          rY = (ch - rH) / 2
        } else {
          rH = ch
          rW = ch * vAspect
          rY = 0
          rX = (cw - rW) / 2
        }
      } else {
        // cover
        if (vAspect > cAspect) {
          rH = ch
          rW = ch * vAspect
          rY = 0
          rX = (cw - rW) / 2
        } else {
          rW = cw
          rH = cw / vAspect
          rX = 0
          rY = (ch - rH) / 2
        }
      }
      return { canvasW: cw, canvasH: ch, videoX: rX, videoY: rY, videoW: rW, videoH: rH }
    }

    const update = () => {
      const r = compute()
      if (!r) return
      // DPR を考慮して内部解像度を上げる
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(r.canvasW * dpr)
      canvas.height = Math.round(r.canvasH * dpr)
      setRect(r)
    }

    update()

    const ro = new ResizeObserver(update)
    ro.observe(canvas)
    const onMeta = () => update()
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('resize', onMeta)
    return () => {
      ro.disconnect()
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('resize', onMeta)
    }
  }, [videoRef, objectFit])

  // ── 骨格の描画 ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !rect) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.canvasW, rect.canvasH)

    if (idealLandmarks) drawSkeleton(ctx, idealLandmarks, rect, mirror, idealColor, 0.4)
    if (landmarks) drawSkeleton(ctx, landmarks, rect, mirror, color, 0.9)
  }, [landmarks, idealLandmarks, rect, mirror, color, idealColor])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  lms: NormalizedLandmark[],
  rect: Rect,
  mirror: boolean,
  color: string,
  alpha: number,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3

  // 正規化座標 [0..1] を映像表示矩形に写像
  const xOf = (x: number) =>
    rect.videoX + (mirror ? (1 - x) : x) * rect.videoW
  const yOf = (y: number) => rect.videoY + y * rect.videoH

  // ── エッジ ──
  for (const [a, b] of SKELETON_EDGES) {
    const la = lms[a]; const lb = lms[b]
    if (!la || !lb) continue
    if ((la.visibility ?? 1) < 0.3 || (lb.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.moveTo(xOf(la.x), yOf(la.y))
    ctx.lineTo(xOf(lb.x), yOf(lb.y))
    ctx.stroke()
  }
  // ── 関節 ──
  for (let i = 0; i < lms.length; i++) {
    const p = lms[i]
    if (!p || (p.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.arc(xOf(p.x), yOf(p.y), 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
