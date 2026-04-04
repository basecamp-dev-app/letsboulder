'use client'

import { MouseEvent } from 'react'
import NextImage from 'next/image'
import type { EditableRoute, FloorPlan } from '@/features/admin/gyms/types'

interface StarterRouteCanvasProps {
  activeFloorPlan: FloorPlan
  routes: EditableRoute[]
  markerTargetId: string | null
  onCanvasClick: (event: MouseEvent<HTMLDivElement>) => void
  onSelectMarker: (routeId: string) => void
}

export default function StarterRouteCanvas({
  activeFloorPlan,
  markerTargetId,
  onCanvasClick,
  onSelectMarker,
  routes,
}: StarterRouteCanvasProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-xs text-gray-400">
        <span>Click floor plan to add a route marker.</span>
        {markerTargetId ? <span className="rounded bg-blue-900/40 px-2 py-1 text-blue-300">Click map to reposition selected marker</span> : null}
      </div>
      <div className="relative overflow-hidden rounded-lg border border-gray-800 bg-black">
        <div className="relative" onClick={onCanvasClick}>
          <NextImage
            src={activeFloorPlan.image_url}
            alt={activeFloorPlan.name}
            width={activeFloorPlan.image_width}
            height={activeFloorPlan.image_height}
            sizes="(max-width: 1024px) 100vw, 66vw"
            className="block h-auto w-full select-none"
          />
          {routes.map((route, index) => route.marker ? (
            <button
              key={route.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onSelectMarker(route.id)
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white shadow"
              style={{
                left: `${route.marker.x_norm * 100}%`,
                top: `${route.marker.y_norm * 100}%`,
              }}
              title={`Route ${index + 1}`}
            >
              {route.grade || index + 1}
            </button>
          ) : null)}
        </div>
      </div>
    </div>
  )
}
