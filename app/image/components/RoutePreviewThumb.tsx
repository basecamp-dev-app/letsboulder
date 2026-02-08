'use client'

import { useMemo } from 'react'

import type { RoutePoint } from '@/lib/useRouteSelection'

function smoothSvgPath(points: RoutePoint[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`
  }

  let path = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i]!.x + points[i + 1]!.x) / 2
    const yc = (points[i]!.y + points[i + 1]!.y) / 2
    path += ` Q ${points[i]!.x} ${points[i]!.y} ${xc} ${yc}`
  }
  const last = points[points.length - 1]!
  path += ` Q ${last.x} ${last.y} ${last.x} ${last.y}`
  return path
}

interface RoutePreviewThumbProps {
  imageUrl: string
  naturalWidth: number
  naturalHeight: number
  points: RoutePoint[]
  stroke?: string
  onClick?: () => void
  className?: string
}

export default function RoutePreviewThumb({
  imageUrl,
  naturalWidth,
  naturalHeight,
  points,
  stroke,
  onClick,
  className,
}: RoutePreviewThumbProps) {
  const d = useMemo(() => smoothSvgPath(points), [points])
  const canDraw = !!d && naturalWidth > 0 && naturalHeight > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ||
        'relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 shrink-0'
      }
      aria-label="View route on image"
    >
      <img
        src={imageUrl}
        alt="Route preview"
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {canDraw && (
        <svg
          className="absolute inset-0"
          viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <path
            d={d}
            stroke={stroke || '#22c55e'}
            strokeWidth={Math.max(3, Math.round(Math.min(naturalWidth, naturalHeight) / 260))}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div className="absolute inset-0 ring-1 ring-inset ring-black/5 dark:ring-white/5" />
    </button>
  )
}
