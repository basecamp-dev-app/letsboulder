'use client'

import { Loader2, Save } from 'lucide-react'
import { DISCIPLINE_OPTIONS } from '@/features/admin/gyms/types'
import type { EditableRoute } from '@/features/admin/gyms/types'

interface StarterRoutesEditorProps {
  routes: EditableRoute[]
  savingRoutes: boolean
  onSave: () => void
  onRemoveRoute: (routeId: string) => void
  onUpdateRoute: (routeId: string, patch: Partial<EditableRoute>) => void
  onSelectMarker: (routeId: string) => void
}

export default function StarterRoutesEditor({
  onRemoveRoute,
  onSave,
  onSelectMarker,
  onUpdateRoute,
  routes,
  savingRoutes,
}: StarterRoutesEditorProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Starter routes ({routes.length})</h4>
        <button
          type="button"
          onClick={onSave}
          disabled={savingRoutes}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {savingRoutes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
        {routes.map((route, index) => (
          <div key={route.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
              <span>Route {index + 1}</span>
              <button
                type="button"
                onClick={() => onRemoveRoute(route.id)}
                className="text-red-300 hover:text-red-200"
              >
                Remove
              </button>
            </div>
            <div className="space-y-2">
              <input
                value={route.name}
                onChange={event => onUpdateRoute(route.id, { name: event.target.value })}
                placeholder="Name (optional)"
                className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={route.grade}
                  onChange={event => onUpdateRoute(route.id, { grade: event.target.value })}
                  placeholder="Grade"
                  className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-500"
                />
                <select
                  value={route.discipline}
                  onChange={event => onUpdateRoute(route.id, { discipline: event.target.value as EditableRoute['discipline'] })}
                  className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white"
                >
                  {DISCIPLINE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={route.color}
                  onChange={event => onUpdateRoute(route.id, { color: event.target.value })}
                  placeholder="Color (optional)"
                  className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-500"
                />
                <input
                  value={route.setter_name}
                  onChange={event => onUpdateRoute(route.id, { setter_name: event.target.value })}
                  placeholder="Setter (optional)"
                  className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={() => onSelectMarker(route.id)}
                className="text-xs text-blue-300 hover:text-blue-200"
              >
                {route.marker ? 'Reposition marker' : 'Set marker'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
