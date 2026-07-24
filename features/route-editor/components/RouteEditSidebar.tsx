'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Trash2, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useRouteStore } from '@/features/route-editor/store'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import GradePicker from '@/features/grades/components/GradePicker'
import { getGradeSystemForClimbType, useGradePreferences } from '@/features/grades/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { ClimbType } from '@/types/climbing'

const ROUTE_TYPES = [
  { value: 'sport', label: 'Sport' },
  { value: 'boulder', label: 'Boulder' },
  { value: 'trad', label: 'Trad' },
  { value: 'deep-water-solo', label: 'Deep Water Solo' },
]

const DEFAULT_GRADE = '6A'

function isClimbType(value: string | null | undefined): value is ClimbType {
  return value === 'sport' || value === 'boulder' || value === 'trad' || value === 'deep-water-solo' || value === 'deep_water_solo'
}

interface RouteEditSidebarProps {
  onClose?: () => void
  allowDelete?: boolean
}

export function RouteEditSidebar({ onClose, allowDelete = false }: RouteEditSidebarProps) {
  const {
    routes,
    selectedRouteId,
    routeEditorDraft,
    editorIntent,
    deleteRoute,
    setEditorDraft,
    updateEditorDraft,
    setEditorIntent,
    setEditorPanelOpen,
    setSelectedRoute,
  } = useRouteStore(useShallow((state) => ({
    routes: state.routes,
    selectedRouteId: state.selectedRouteId,
    routeEditorDraft: state.routeEditorDraft,
    editorIntent: state.editorIntent,
    deleteRoute: state.deleteRoute,
    setEditorDraft: state.setEditorDraft,
    updateEditorDraft: state.updateEditorDraft,
    setEditorIntent: state.setEditorIntent,
    setEditorPanelOpen: state.setEditorPanelOpen,
    setSelectedRoute: state.setSelectedRoute,
  })))
  const gradePreferences = useGradePreferences()
  const selectedRoute = routes.find((r) => r.id === selectedRouteId)
  const [gradePickerOpen, setGradePickerOpen] = useState(false)

  const nameInputRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const gradeButtonRef = useRef<HTMLButtonElement>(null)
  const typeSelectRef = useRef<HTMLSelectElement>(null)

  const currentGrade = routeEditorDraft?.grade || selectedRoute?.climb?.grade || DEFAULT_GRADE
  const currentClimbType = routeEditorDraft?.climbType || (isClimbType(selectedRoute?.climb?.route_type) ? selectedRoute.climb.route_type : 'boulder')
  const name = routeEditorDraft?.name ?? selectedRoute?.climb?.name ?? ''
  const description = routeEditorDraft?.description ?? selectedRoute?.climb?.description ?? ''

  const getGradeDisplay = useCallback(
    (grade: string | null | undefined, climbType: ClimbType = currentClimbType) => {
      const gradeSystem = getGradeSystemForClimbType(climbType, gradePreferences)
      return formatGradeForDisplay(grade, gradeSystem)
    },
    [currentClimbType, gradePreferences]
  )

  const formattedCurrentGrade = getGradeDisplay(currentGrade)

  useEffect(() => {
    if (!selectedRouteId || !selectedRoute) return
    if (routeEditorDraft?.routeId === selectedRouteId) return

    setEditorDraft({
      routeId: selectedRouteId,
      name: selectedRoute.climb?.name || '',
      grade: selectedRoute.climb?.grade || DEFAULT_GRADE,
      climbType: isClimbType(selectedRoute.climb?.route_type) ? selectedRoute.climb.route_type : 'boulder',
      description: selectedRoute.climb?.description || '',
    })
  }, [selectedRouteId, selectedRoute, routeEditorDraft?.routeId, setEditorDraft])

  const openGradePicker = useCallback(() => {
    setGradePickerOpen(true)
  }, [setGradePickerOpen])

  useEffect(() => {
    if (!editorIntent) return

    if (editorIntent === 'grade') {
      setEditorPanelOpen(true)
      queueMicrotask(openGradePicker)
      gradeButtonRef.current?.focus()
    }

    if (editorIntent === 'name') {
      setEditorPanelOpen(true)
      queueMicrotask(() => {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
      })
    }

    if (editorIntent === 'type') {
      typeSelectRef.current?.focus()
    }

    if (editorIntent === 'description') {
      descriptionRef.current?.focus()
    }

    setEditorIntent(null)
  }, [editorIntent, openGradePicker, routeEditorDraft?.routeId, selectedRouteId, setEditorIntent, setEditorPanelOpen])

  const handleClose = () => {
    setEditorPanelOpen(false)
    setEditorIntent(null)
    onClose?.()
  }

  const handleGradeSelect = (newGrade: string) => {
    updateEditorDraft({ grade: newGrade })
  }

  const handleDeleteRoute = () => {
    if (!selectedRouteId) return
    deleteRoute(selectedRouteId)
    setEditorPanelOpen(false)
    setEditorIntent(null)
    setSelectedRoute(null)
  }

  if (!routeEditorDraft && !selectedRouteId) {
    return null
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-[5200] flex max-h-[min(78dvh,40rem)] flex-col rounded-t-[2rem] border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 md:inset-y-0 md:right-0 md:left-auto md:w-[360px] md:max-h-none md:rounded-none md:rounded-l-[2rem] md:border-y-0 md:border-r-0 md:border-l"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)',
          top: 'auto',
        }}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-700 md:hidden" />
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Route</h2>
          <button
            onClick={handleClose}
            className="rounded-lg border border-transparent p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="route-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <Input
              ref={nameInputRef}
              id="route-name"
              value={name}
              onChange={(e) => updateEditorDraft({ name: e.target.value })}
              placeholder="Enter route name"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="route-grade" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Grade
            </label>
            <button
              ref={gradeButtonRef}
              id="route-grade"
              onClick={openGradePicker}
              className="w-full px-3 py-2 text-left border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {formattedCurrentGrade}
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="route-type" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Type
            </label>
            <select
              ref={typeSelectRef}
              id="route-type"
              value={currentClimbType}
              onChange={(e) => {
                if (isClimbType(e.target.value)) {
                  updateEditorDraft({ climbType: e.target.value })
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ROUTE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="route-description" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              ref={descriptionRef}
              id="route-description"
              value={description}
              onChange={(e) => updateEditorDraft({ description: e.target.value })}
              placeholder="Add a description..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {allowDelete ? (
            <button
              type="button"
              onClick={handleDeleteRoute}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-4 w-4" />
              Delete Route
            </button>
          ) : null}
        </div>
      </div>

      <Dialog open={gradePickerOpen} onOpenChange={setGradePickerOpen}>
        <DialogContent className="z-[6200] sm:max-w-md" overlayClassName="z-[6190]">
          <DialogTitle className="sr-only">Select route grade</DialogTitle>
          <GradePicker
            isOpen={gradePickerOpen}
            onClose={() => setGradePickerOpen(false)}
            onSelect={handleGradeSelect}
            currentGrade={currentGrade}
            climbType={currentClimbType}
            mode="select"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
