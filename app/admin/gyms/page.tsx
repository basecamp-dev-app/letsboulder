'use client'

import CreateGymForm from '@/features/admin/gyms/components/CreateGymForm'
import GymConfigurationPanel from '@/features/admin/gyms/components/GymConfigurationPanel'
import GymSelectorCard from '@/features/admin/gyms/components/GymSelectorCard'
import { useAdminGymEditor } from '@/features/admin/gyms/hooks'

export default function AdminGymsPage() {
  const {
    activeFloorPlan,
    creatingGym,
    error,
    floorPlanName,
    gymDisciplines,
    gymLocation,
    gymName,
    gymPrimaryDiscipline,
    gyms,
    handleCanvasClick,
    handleCreateGym,
    handleFloorPlanUpload,
    loadingConfig,
    loadingGyms,
    markerTargetId,
    removeRoute,
    routes,
    saveStarterRoutes,
    savingRoutes,
    selectedGym,
    selectedGymId,
    setFloorPlanName,
    setGymLocation,
    setGymName,
    setMarkerTargetId,
    setSelectedGymId,
    setGymPrimaryDiscipline,
    toast,
    toggleGymDiscipline,
    updateRoute,
    uploadingPlan,
  } = useAdminGymEditor()

  return (
    <div className="space-y-8">
      {toast ? (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <header>
        <h1 className="text-2xl font-bold text-white">Gyms</h1>
        <p className="mt-2 text-sm text-gray-400">Create gyms, upload one active floor plan, and set starter point markers.</p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <CreateGymForm
        creatingGym={creatingGym}
        gymDisciplines={gymDisciplines}
        gymLocation={gymLocation}
        gymName={gymName}
        gymPrimaryDiscipline={gymPrimaryDiscipline}
        onCreateGym={handleCreateGym}
        onGymLocationChange={setGymLocation}
        onGymNameChange={setGymName}
        onGymPrimaryDisciplineChange={setGymPrimaryDiscipline}
        onToggleGymDiscipline={toggleGymDiscipline}
      />

      <GymSelectorCard
        gyms={gyms}
        loadingGyms={loadingGyms}
        selectedGym={selectedGym}
        selectedGymId={selectedGymId}
        onSelectedGymIdChange={setSelectedGymId}
      />

      <GymConfigurationPanel
        activeFloorPlan={activeFloorPlan}
        floorPlanName={floorPlanName}
        loadingConfig={loadingConfig}
        markerTargetId={markerTargetId}
        onCanvasClick={handleCanvasClick}
        onFloorPlanNameChange={setFloorPlanName}
        onFloorPlanUpload={handleFloorPlanUpload}
        onRemoveRoute={removeRoute}
        onSaveStarterRoutes={saveStarterRoutes}
        onSelectMarker={setMarkerTargetId}
        onUpdateRoute={updateRoute}
        routes={routes}
        savingRoutes={savingRoutes}
        selectedGym={selectedGym}
        uploadingPlan={uploadingPlan}
      />
    </div>
  )
}
