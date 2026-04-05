'use client'

import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

interface SortableRouteChipProps {
  route: RouteLine
  isActive: boolean
  onSelectRoute: (routeId: string) => void
  reorderingEnabled: boolean
}

function SortableRouteChip({ route, isActive, onSelectRoute, reorderingEnabled }: SortableRouteChipProps) {
  const gradePreferences = useGradePreferences()
  const climbType = route.climb?.route_type ?? undefined
  const gradeSystem = getGradeSystemForClimbType(climbType || undefined, gradePreferences)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: route.id,
    disabled: !reorderingEnabled,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
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
          {reorderingEnabled ? <GripHorizontal className="h-3.5 w-3.5 text-gray-400" /> : null}
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: route.color }} aria-hidden="true" />
          <span className={`text-xs font-semibold ${isActive ? 'text-blue-800 dark:text-blue-100' : 'text-gray-600 dark:text-gray-300'}`}>
            {formatGradeForDisplay(route.climb?.grade || '6A', gradeSystem)}
          </span>
        </div>
        <p className={`mt-1 max-w-[14rem] truncate text-sm font-medium ${isActive ? 'text-blue-900 dark:text-blue-50' : 'text-gray-900 dark:text-gray-100'}`}>
          {route.climb?.name || 'Unnamed route'}
        </p>
      </button>
    </div>
  )
}

export function RouteEditorRail({ routes, selectedRouteId, onSelectRoute, onReorderRoutes }: RouteEditorRailProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  )

  if (routes.length === 0) return null

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorderRoutes || !event.over || event.active.id === event.over.id) return

    const routeIds = routes.map((route) => route.id)
    const oldIndex = routeIds.indexOf(String(event.active.id))
    const newIndex = routeIds.indexOf(String(event.over.id))
    if (oldIndex < 0 || newIndex < 0) return

    onReorderRoutes(arrayMove(routeIds, oldIndex, newIndex))
  }

  return (
    <div className="rounded-3xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {onReorderRoutes ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={routes.map((route) => route.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
              {routes.map((route) => (
                <SortableRouteChip
                  key={route.id}
                  route={route}
                  isActive={route.id === selectedRouteId}
                  onSelectRoute={onSelectRoute}
                  reorderingEnabled
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
          {routes.map((route) => (
            <SortableRouteChip
              key={route.id}
              route={route}
              isActive={route.id === selectedRouteId}
              onSelectRoute={onSelectRoute}
              reorderingEnabled={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}
