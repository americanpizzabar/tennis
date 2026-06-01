import { useRef } from 'react'
import type { BallLandingPoint, CourtZone } from '../types/match'

interface Props {
  landings: BallLandingPoint[]
  tappable: boolean
  onTap?: (p: BallLandingPoint) => void
  height?: number
}

export function CourtMap({ landings, tappable, onTap, height = 160 }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (!tappable || !onTap) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let cx: number, cy: number
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0]
      cx = t.clientX; cy = t.clientY
    } else {
      cx = e.clientX; cy = e.clientY
    }
    const x = Math.max(0, Math.min(1, (cx - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (cy - rect.top) / rect.height))
    const zone: CourtZone =
      y < 0.05 || y > 0.95 || x < 0.05 || x > 0.95 ? 'OUT'
      : y < 0.5 && x < 0.5 ? 'DEUCE_SERVICE_BOX'
      : y < 0.5 && x >= 0.5 ? 'AD_SERVICE_BOX'
      : y >= 0.5 && x < 0.33 ? 'DEUCE_BASELINE'
      : y >= 0.5 && x > 0.67 ? 'AD_BASELINE'
      : 'CENTER_BASELINE'
    onTap({ x, y, isInCourt: zone !== 'OUT', zone, timestampMs: Date.now() })
  }

  return (
    <div
      ref={ref}
      onClick={handleClick}
      style={{ height }}
      className={`relative w-full rounded-lg overflow-hidden bg-emerald-900 ${
        tappable ? 'cursor-crosshair ring-2 ring-court-warning' : ''
      }`}
    >
      {/* コートライン */}
      <div className="absolute inset-0">
        {/* ネット */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/80" />
        {/* センターライン */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/40" />
        {/* サービスライン */}
        <div className="absolute left-0 right-0 top-1/4 h-px bg-white/40" />
        <div className="absolute left-0 right-0 top-3/4 h-px bg-white/40" />
        {/* シングルスサイドライン（上下） */}
        <div className="absolute top-0 bottom-0 left-[10%] w-px bg-white/30" />
        <div className="absolute top-0 bottom-0 right-[10%] w-px bg-white/30" />
      </div>
      {/* 着弾点 */}
      {landings.map((p, i) => {
        const alpha = Math.max(0.4, (i + 1) / Math.max(1, landings.length))
        const color =
          p.zone === 'OUT' ? `rgba(239,83,80,${alpha})`
          : p.zone === 'NET' ? `rgba(249,168,37,${alpha})`
          : `rgba(76,175,80,${alpha})`
        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `calc(${p.x * 100}% - 6px)`,
              top: `calc(${p.y * 100}% - 6px)`,
              width: 12, height: 12, background: color,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            }}
          />
        )
      })}
      {tappable && (
        <div className="absolute bottom-1 left-2 text-xs text-court-warning">
          コートをタップで着弾点を追加
        </div>
      )}
    </div>
  )
}
