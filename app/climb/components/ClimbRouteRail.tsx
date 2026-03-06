'use client'

import { formatGradeForDisplay } from '@/lib/grade-display'
import type { GradeSystem } from '@/lib/grades'

interface RouteRailClimb {
  name: string
  grade: string
}

interface RouteRailItem {
  id: string
  color: string
  climb: RouteRailClimb
}

interface ClimbRouteRailProps {
  routeLines: RouteRailItem[]
  selectedIds: string[]
  gradeSystem: GradeSystem
  routeCardRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>
  onSelectRoute: (routeId: string) => void
}

export default function ClimbRouteRail({ routeLines, selectedIds, gradeSystem, routeCardRefs, onSelectRoute }: ClimbRouteRailProps) {
  if (routeLines.length <= 1) return null

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
          {routeLines.map((route) => {
            const isActive = selectedIds.includes(route.id)

            return (
              <button
                key={route.id}
                ref={(node) => {
                  routeCardRefs.current[route.id] = node
                }}
                type="button"
                onClick={() => onSelectRoute(route.id)}
                className={`snap-center shrink-0 rounded-xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,0.45)] dark:border-blue-400 dark:bg-blue-950/40'
                    : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
                }`}
                aria-pressed={isActive}
                aria-label={`Select route ${route.climb.name}`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: route.color }} aria-hidden="true" />
                  <span className={`text-xs font-semibold ${isActive ? 'text-blue-800 dark:text-blue-100' : 'text-gray-600 dark:text-gray-300'}`}>
                    {formatGradeForDisplay(route.climb.grade, gradeSystem)}
                  </span>
                </div>
                <p className={`mt-1 max-w-[14rem] truncate text-sm font-medium ${isActive ? 'text-blue-900 dark:text-blue-50' : 'text-gray-900 dark:text-gray-100'}`}>
                  {route.climb.name}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
