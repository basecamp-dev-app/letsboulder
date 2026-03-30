'use client'

import { ChangeEvent, MouseEvent } from 'react'
import { Loader2, Upload } from 'lucide-react'
import type { EditableRoute, FloorPlan, GymListItem } from '@/app/admin/gyms/types'
import StarterRouteCanvas from '@/app/admin/gyms/components/StarterRouteCanvas'
import StarterRoutesEditor from '@/app/admin/gyms/components/StarterRoutesEditor'

interface GymConfigurationPanelProps {
  selectedGym: GymListItem | null
  floorPlanName: string
  activeFloorPlan: FloorPlan | null
  routes: EditableRoute[]
  markerTargetId: string | null
  loadingConfig: boolean
  savingRoutes: boolean
  uploadingPlan: boolean
  onFloorPlanNameChange: (value: string) => void
  onFloorPlanUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onCanvasClick: (event: MouseEvent<HTMLDivElement>) => void
  onSelectMarker: (routeId: string) => void
  onRemoveRoute: (routeId: string) => void
  onUpdateRoute: (routeId: string, patch: Partial<EditableRoute>) => void
  onSaveStarterRoutes: () => void
}

export default function GymConfigurationPanel({
  activeFloorPlan,
  floorPlanName,
  loadingConfig,
  markerTargetId,
  onCanvasClick,
  onFloorPlanNameChange,
  onFloorPlanUpload,
  onRemoveRoute,
  onSaveStarterRoutes,
  onSelectMarker,
  onUpdateRoute,
  routes,
  savingRoutes,
  selectedGym,
  uploadingPlan,
}: GymConfigurationPanelProps) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Manage floor plan and starter routes</h2>
        {loadingConfig ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
      </div>

      {!selectedGym ? (
        <p className="mt-4 text-sm text-gray-400">Create your first gym to configure floor plans and routes.</p>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-white">{selectedGym.name}</span>
              {' '}
              • {selectedGym.country_code || 'N/A'} • {selectedGym.active_route_count} active starter routes
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {selectedGym.latitude ?? 'N/A'}, {selectedGym.longitude ?? 'N/A'}
            </p>
          </div>

          <div className="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-4">
            <h3 className="text-sm font-semibold text-white">Active floor plan</h3>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <input
                value={floorPlanName}
                onChange={event => onFloorPlanNameChange(event.target.value)}
                placeholder="Floor plan name"
                className="min-w-56 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
              />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                {uploadingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload floor plan
                <input type="file" accept="image/*" className="hidden" onChange={onFloorPlanUpload} disabled={uploadingPlan} />
              </label>
            </div>
            {!activeFloorPlan ? (
              <p className="mt-3 text-xs text-yellow-300">Upload a floor plan to start placing routes.</p>
            ) : (
              <p className="mt-3 text-xs text-gray-400">
                Active plan: {activeFloorPlan.name} ({activeFloorPlan.image_width}x{activeFloorPlan.image_height})
              </p>
            )}
          </div>

          {loadingConfig ? null : activeFloorPlan ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
              <StarterRouteCanvas
                activeFloorPlan={activeFloorPlan}
                markerTargetId={markerTargetId}
                onCanvasClick={onCanvasClick}
                onSelectMarker={onSelectMarker}
                routes={routes}
              />

              <StarterRoutesEditor
                onRemoveRoute={onRemoveRoute}
                onSave={onSaveStarterRoutes}
                onSelectMarker={onSelectMarker}
                onUpdateRoute={onUpdateRoute}
                routes={routes}
                savingRoutes={savingRoutes}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
