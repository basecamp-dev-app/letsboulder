'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { useRouteStore } from '@/store/routeStore'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import GradePicker from '@/components/GradePicker'

const ROUTE_TYPES = [
  { value: 'sport', label: 'Sport' },
  { value: 'boulder', label: 'Boulder' },
  { value: 'trad', label: 'Trad' },
  { value: 'deep-water-solo', label: 'Deep Water Solo' },
]

interface RouteEditSidebarProps {
  onClose?: () => void
}

export function RouteEditSidebar({ onClose }: RouteEditSidebarProps) {
  const { routes, selectedRouteId, setSelectedRoute, updateRoute } = useRouteStore()
  const [isGradePickerOpen, setIsGradePickerOpen] = useState(false)
  const [localName, setLocalName] = useState('')
  const [localGrade, setLocalGrade] = useState('')
  const [localRouteType, setLocalRouteType] = useState('boulder')
  const [localDescription, setLocalDescription] = useState('')

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)

  const selectedRoute = routes.find((r) => r.id === selectedRouteId)

  useEffect(() => {
    if (!selectedRoute) return
    if (initializedRef.current) return

    initializedRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalName(selectedRoute.climb?.name || '')
    setLocalGrade(selectedRoute.climb?.grade || '')
    setLocalRouteType(selectedRoute.climb?.route_type || 'boulder')
    setLocalDescription(selectedRoute.climb?.description || '')
  }, [selectedRoute])

  const saveChanges = useCallback(() => {
    if (!selectedRouteId) return
    updateRoute(selectedRouteId, {
      climb: {
        ...selectedRoute?.climb,
        id: selectedRoute?.climb?.id || '',
        name: localName,
        grade: localGrade,
        route_type: localRouteType,
        description: localDescription,
        status: selectedRoute?.climb?.status || 'pending',
      },
    } as Partial<(typeof routes)[0]>)
  }, [selectedRouteId, selectedRoute, updateRoute, localName, localGrade, localRouteType, localDescription])

  useEffect(() => {
    if (!selectedRouteId) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveChanges()
    }, 500)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [localName, localGrade, localRouteType, localDescription, selectedRouteId, saveChanges])

  const handleClose = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveChanges()
    }
    setSelectedRoute(null)
    onClose?.()
  }

  const handleGradeSelect = (newGrade: string) => {
    setLocalGrade(newGrade)
  }

  if (!selectedRouteId || !selectedRoute) {
    return null
  }

  return (
    <>
      <div className="fixed top-0 right-0 h-full w-[360px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Route</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="route-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <Input
              id="route-name"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              placeholder="Enter route name"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="route-grade" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Grade
            </label>
            <button
              id="route-grade"
              onClick={() => setIsGradePickerOpen(true)}
              className="w-full px-3 py-2 text-left border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {localGrade || 'Select grade'}
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="route-type" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Type
            </label>
            <select
              id="route-type"
              value={localRouteType}
              onChange={(e) => setLocalRouteType(e.target.value)}
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
              id="route-description"
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              placeholder="Add a description..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </div>

      <Dialog open={isGradePickerOpen} onOpenChange={setIsGradePickerOpen}>
        <DialogContent className="sm:max-w-md">
          <GradePicker
            isOpen={isGradePickerOpen}
            onClose={() => setIsGradePickerOpen(false)}
            onSelect={handleGradeSelect}
            currentGrade={localGrade}
            mode="select"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
