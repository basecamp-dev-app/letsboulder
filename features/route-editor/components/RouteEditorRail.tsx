'use client'

import { GripHorizontal } from 'lucide-react'
import { getGradeSystemForClimbType, useGradePreferences } from '@/features/grades/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { RouteLine } from '@/types/domain'

interface RouteEditorRailProps {
  routes: RouteLine[]
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  onReorderRoutes?: (routeIds: string[]) => void
}

export function RouteEditorRail({ routes, selectedRouteId, onSelectRoute, onReorderRoutes }: RouteEditorRailProps) {
  const gradePreferences = useGradePreferences()

  if (routes.length === 0) return null

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, routeId: string) => {
    if (!onReorderRoutes) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', routeId)
  }

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>, targetRouteId: string) => {
    if (!onReorderRoutes) return
    event.preventDefault()
    const sourceRouteId = event.dataTransfer.getData('text/plain')
    if (!sourceRouteId || sourceRouteId === targetRouteId) return
    const currentOrder = routes.map((route) => route.id)
    const sourceIndex = currentOrder.indexOf(sourceRouteId)
    const targetIndex = currentOrder.indexOf(targetRouteId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const nextOrder = [...currentOrder]
    const [moved] = nextOrder.splice(sourceIndex, 1)
    nextOrder.splice(targetIndex, 0, moved)
    onReorderRoutes(nextOrder)
  }

  return (
    <div className="rounded-3xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
        {routes.map((route) => {
          const isActive = route.id === selectedRouteId
          const climbType = route.climb?.route_type ?? undefined
          const gradeSystem = getGradeSystemForClimbType(climbType || undefined, gradePreferences)

          return (
            <button
              key={route.id}
              type="button"
              draggable={Boolean(onReorderRoutes)}
              onDragStart={(event) => handleDragStart(event, route.id)}
              onDragOver={(event) => {
                if (!onReorderRoutes) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => handleDrop(event, route.id)}
              onClick={() => onSelectRoute(route.id)}
              className={`snap-center shrink-0 rounded-xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? 'border-blue-500 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,0.45)] dark:border-blue-400 dark:bg-blue-950/40'
                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
              }`}
              aria-pressed={isActive}
              aria-label={`Select route ${route.climb?.name || 'Unnamed route'}`}
            >
              <div className="flex items-center gap-2">
                {onReorderRoutes ? <GripHorizontal className="h-3.5 w-3.5 text-gray-400" /> : null}
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: route.color }} aria-hidden="true" />
                <span className={`text-xs font-semibold ${isActive ? 'text-blue-800 dark:text-blue-100' : 'text-gray-600 dark:text-gray-300'}`}>
                  {formatGradeForDisplay(route.climb?.grade || '6A', gradeSystem)}
                </span>
              </div>
              <p className={`mt-1 max-w-[14rem] truncate text-sm font-medium ${isActive ? 'text-blue-900 dark:text-blue-50' : 'text-gray-900 dark:text-gray-100'}`}>
                {route.climb?.name || 'Unnamed route'}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
