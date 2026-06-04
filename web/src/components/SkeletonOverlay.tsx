import { useEffect, useRef } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { SKELETON_EDGES } from '../lib/poseDetector'

interface Props {
  landmarks: NormalizedLandmark[] | null
  /** プロ理想フォームの骨格を半透明オーバーレイ。 */
  idealLandmarks?: NormalizedLandmark[] | null
  width: number
  height: number
  /** mirror = true でカメラ映像と同期して左右反転（フロントカメラ用）。 */
  mirror?: boolean
  /** 色。 */
  color?: string
  idealColor?: string
}

export function SkeletonOverlay({
  landmarks, idealLandmarks, width, height, mirror = false,
  color = '#42A5F5', idealColor = '#F9A825',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    if (idealLandmarks) drawSkeleton(ctx, idealLandmarks, width, height, mirror, idealColor, 0.4)
    if (landmarks) drawSkeleton(ctx, landmarks, width, height, mirror, color, 0.9)
  }, [landmarks, idealLandmarks, width, height, mirror, color, idealColor])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  lms: NormalizedLandmark[],
  w: number, h: number,
  mirror: boolean,
  color: string,
  alpha: number,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3
  const xOf = (x: number) => (mirror ? (1 - x) : x) * w
  const yOf = (y: number) => y * h

  // エッジ
  for (const [a, b] of SKELETON_EDGES) {
    const la = lms[a]; const lb = lms[b]
    if (!la || !lb) continue
    if ((la.visibility ?? 1) < 0.3 || (lb.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.moveTo(xOf(la.x), yOf(la.y))
    ctx.lineTo(xOf(lb.x), yOf(lb.y))
    ctx.stroke()
  }
  // 関節
  for (let i = 0; i < lms.length; i++) {
    const p = lms[i]
    if (!p || (p.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.arc(xOf(p.x), yOf(p.y), 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
