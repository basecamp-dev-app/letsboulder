'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { RoutePoint, generateRouteId } from '@/lib/useRouteSelection'
import { drawSmoothCurve, drawRoundedLabel, getGradeLabelPosition, getNameLabelPosition, getTruncatedText } from '@/lib/curveUtils'
import CragSelector from '../../components/CragSelector'

const FRENCH_GRADES = [
  '5A', '5A+', '5B', '5B+', '5C', '5C+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+'
]

interface RouteWithLabels {
  id: string
  points: RoutePoint[]
  grade: string
  name: string
  description?: string
}

interface RouteEditorProps {
  imageUrl: string
  latitude: number | null
  longitude: number | null
  sessionId: string
  hasGps: boolean
  captureDate: string | null
}

export default function RouteEditor({ imageUrl, latitude, longitude, sessionId, hasGps, captureDate }: RouteEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>([])
  const [routes, setRoutes] = useState<RouteWithLabels[]>([])
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null)
  const [mode, setMode] = useState<'draw' | 'review'>('draw')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [currentName, setCurrentName] = useState('')
  const [currentGrade, setCurrentGrade] = useState('5A')
  const [currentDescription, setCurrentDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [gradePickerOpen, setGradePickerOpen] = useState(false)
  const [selectedCrag, setSelectedCrag] = useState<{ id: string; name: string } | null>(null)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (mode === 'draw' && currentPoints.length > 0) {
      ctx.fillStyle = '#3b82f6'
      currentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI)
        ctx.fill()
      })

      if (currentPoints.length > 1) {
        drawSmoothCurve(ctx, currentPoints, '#3b82f6', 2, [5, 5])
      }

      if (currentPoints.length > 1 && currentName && currentGrade) {
        const previewRoute: RouteWithLabels = {
          id: 'preview',
          points: currentPoints,
          grade: currentGrade,
          name: currentName
        }
        drawRouteWithLabels(ctx, previewRoute, 1, 1, false)
      }
    }

    routes.forEach((route, index) => {
      const isSelected = selectedRouteIndex === index
      const scaleX = canvas.width / image.naturalWidth
      const scaleY = canvas.height / image.naturalHeight
      drawRouteWithLabels(ctx, route, scaleX, scaleY, isSelected)
    })
  }, [routes, currentPoints, currentName, currentGrade, selectedRouteIndex, mode])

  const drawRouteWithLabels = (ctx: CanvasRenderingContext2D, route: RouteWithLabels, scaleX = 1, scaleY = 1, isSelected = false) => {
    const { points, grade, name } = route
    const scaledPoints = points.map(point => ({
      x: point.x * scaleX,
      y: point.y * scaleY
    }))

    if (isSelected) {
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 10
      drawSmoothCurve(ctx, scaledPoints, '#fbbf24', 5, [8, 4])
      ctx.shadowBlur = 0
    }

    const bgColor = 'rgba(220, 38, 38, 0.95)'
    drawSmoothCurve(ctx, scaledPoints, '#dc2626', 3, [8, 4])

    if (scaledPoints.length > 1) {
      const gradePos = getGradeLabelPosition(scaledPoints, ctx.canvas.width, ctx.canvas.height)
      drawRoundedLabel(ctx, grade, gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

      const truncatedName = getTruncatedText(ctx, name, 120)
      const namePos = getNameLabelPosition(scaledPoints)
      drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, bgColor, '12px Arial')
    }
  }

  useEffect(() => {
    if (imageLoaded) redraw()
  }, [imageLoaded, redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const handleImageLoad = () => {
      const container = canvas.parentElement
      if (container) {
        const containerRect = container.getBoundingClientRect()
        const containerAspect = containerRect.width / containerRect.height
        const imageAspect = image.naturalWidth / image.naturalHeight

        let displayWidth, displayHeight, offsetX = 0, offsetY = 0
        if (imageAspect > containerAspect) {
          displayWidth = containerRect.width
          displayHeight = containerRect.width / imageAspect
          offsetY = (containerRect.height - displayHeight) / 2
        } else {
          displayHeight = containerRect.height
          displayWidth = containerRect.height * imageAspect
          offsetX = (containerRect.width - displayWidth) / 2
        }

        canvas.style.left = `${offsetX}px`
        canvas.style.top = `${offsetY}px`
        canvas.width = displayWidth
        canvas.height = displayHeight
      }
      setImageLoaded(true)
      redraw()
    }

    if (image.complete) {
      handleImageLoad()
    } else {
      image.addEventListener('load', handleImageLoad)
    }

    return () => image.removeEventListener('load', handleImageLoad)
  }, [imageUrl, redraw])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (mode !== 'draw') return

    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - canvasRect.left
    const canvasY = e.clientY - canvasRect.top

    if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
      return
    }

    setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
  }, [mode])

  const handleFinishRoute = useCallback(() => {
    if (currentPoints.length < 2 || !currentGrade) return

    const routeName = currentName.trim() || `Route ${routes.length + 1}`
    const scaleX = canvasRef.current ? canvasRef.current.width / (imageRef.current?.naturalWidth || 1) : 1
    const scaleY = canvasRef.current ? canvasRef.current.height / (imageRef.current?.naturalHeight || 1) : 1

    const naturalPoints = currentPoints.map(p => ({
      x: p.x / scaleX,
      y: p.y / scaleY
    }))

    const newRoute: RouteWithLabels = {
      id: generateRouteId(),
      points: naturalPoints,
      grade: currentGrade,
      name: routeName,
      description: currentDescription
    }

    setRoutes(prev => [...prev, newRoute])
    setCurrentPoints([])
    setCurrentName('')
    setCurrentDescription('')
  }, [currentPoints, currentName, currentGrade, currentDescription, routes.length])

  const handleUndo = () => {
    if (currentPoints.length > 0) {
      setCurrentPoints(prev => prev.slice(0, -1))
    } else if (routes.length > 0) {
      setRoutes(prev => prev.slice(0, -1))
      if (selectedRouteIndex !== null && selectedRouteIndex >= routes.length - 1) {
        setSelectedRouteIndex(null)
      }
    }
  }

  const handleClearCurrent = () => {
    setCurrentPoints([])
    setCurrentName('')
    setCurrentDescription('')
    setSelectedRouteIndex(null)
  }

  const handleSelectRoute = (index: number) => {
    const route = routes[index]
    setSelectedRouteIndex(index)
    setCurrentName(route.name)
    setCurrentGrade(route.grade)
    setCurrentDescription(route.description || '')
    setCurrentPoints([])
  }

  const handleDeleteRoute = (index: number) => {
    setRoutes(prev => prev.filter((_, i) => i !== index))
    setSelectedRouteIndex(null)
    setCurrentName('')
    setCurrentDescription('')
  }

  const handleSave = async () => {
    if (routes.length === 0) {
      alert('Please draw at least one route')
      return
    }

    if (routes.some(route => !route.name || !route.grade)) {
      alert('Please fill in name and grade for all routes')
      return
    }

    if (!selectedCrag) {
      alert('Please select or create a crag')
      return
    }

    if (!latitude || !longitude) {
      alert('GPS coordinates are required')
      return
    }

    setSubmitting(true)
    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        alert('Please sign in to save routes')
        setSubmitting(false)
        return
      }

      const climbs = routes.map(route => ({
        crag_id: selectedCrag.id,
        name: route.name,
        grade: route.grade,
        description: route.description || null,
        coordinates: route.points,
        image_url: imageUrl,
        image_capture_date: captureDate,
        created_by: user.id,
        status: 'approved'
      }))

      const { error } = await supabase.from('climbs').insert(climbs)
      if (error) throw error

      localStorage.removeItem('routeSession')
      alert('Route submitted! It is now visible on the map.')
      window.location.href = '/map'

    } catch (error) {
      alert('Failed to save routes')
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && mode === 'draw') {
      if (currentPoints.length >= 2 && currentGrade) {
        handleFinishRoute()
      }
    }
  }, [mode, currentPoints, currentGrade, handleFinishRoute])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="h-dvh flex flex-col relative overflow-hidden bg-gray-900 dark:bg-gray-950">
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Climbing route"
          className="max-w-full max-h-full object-contain"
        />
        <canvas
          ref={canvasRef}
          className="absolute cursor-crosshair"
          onClick={handleCanvasClick}
          style={{ pointerEvents: 'auto', touchAction: 'none' }}
        />
      </div>

      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-3">
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setMode('draw')}
            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              mode === 'draw' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            }`}
          >
            Draw ({currentPoints.length > 0 ? `${currentPoints.length} pts` : 'Routes'})
          </button>
          {routes.length > 0 && (
            <button
              onClick={() => setMode('review')}
              className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                mode === 'review' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              }`}
            >
              Review ({routes.length})
            </button>
          )}
        </div>

        {mode === 'draw' ? (
          <div className="flex flex-col gap-2">
            {!hasGps && (
              <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-200">
                GPS coordinates not available. Please ensure location services are enabled.
              </div>
            )}

            {latitude && longitude && (
              <CragSelector
                latitude={latitude}
                longitude={longitude}
                onSelect={(crag) => setSelectedCrag({ id: crag.id, name: crag.name })}
                selectedCragId={selectedCrag?.id}
              />
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Route name"
                value={currentName}
                onChange={(e) => setCurrentName(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button
                onClick={() => setGradePickerOpen(true)}
                className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {currentGrade}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleFinishRoute}
                disabled={currentPoints.length < 2 || !currentGrade}
                className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                Finish Route
              </button>
              <button
                onClick={handleUndo}
                disabled={currentPoints.length === 0 && routes.length === 0}
                className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Undo
              </button>
              <button
                onClick={handleClearCurrent}
                disabled={currentPoints.length === 0}
                className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>

            {routes.length > 0 && (
              <button
                onClick={handleSave}
                disabled={submitting || routes.some(r => !r.name || !r.grade) || !selectedCrag}
                className="w-full bg-green-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 hover:bg-green-700 transition-colors"
              >
                {submitting ? 'Saving...' : 'Save All Routes'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedRouteIndex !== null ? (
              <div className="flex flex-col gap-3 p-3 border border-yellow-400 dark:border-yellow-500 rounded bg-yellow-50 dark:bg-yellow-900/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Editing Route {selectedRouteIndex + 1}</span>
                  <button
                    onClick={() => handleDeleteRoute(selectedRouteIndex)}
                    className="text-red-600 dark:text-red-400 text-sm hover:underline"
                  >
                    Delete Route
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Route name"
                  value={currentName}
                  onChange={(e) => {
                    setCurrentName(e.target.value)
                    setRoutes(prev => prev.map((r, i) => i === selectedRouteIndex ? { ...r, name: e.target.value } : r))
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={() => setGradePickerOpen(true)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Grade: {currentGrade}
                </button>
                <textarea
                  placeholder="Description (optional)"
                  value={currentDescription}
                  onChange={(e) => {
                    setCurrentDescription(e.target.value)
                    setRoutes(prev => prev.map((r, i) => i === selectedRouteIndex ? { ...r, description: e.target.value } : r))
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  rows={2}
                />
                <button
                  onClick={() => setSelectedRouteIndex(null)}
                  className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  Done Editing
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Click a route below to edit name, grade, or description
              </p>
            )}

            <div className="max-h-[30vh] overflow-y-auto space-y-1">
              {routes.map((route, index) => (
                <button
                  key={route.id}
                  onClick={() => handleSelectRoute(index)}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    selectedRouteIndex === index
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-gray-900 dark:text-yellow-100 border border-yellow-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    selectedRouteIndex === index ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <span className="flex-1 truncate">{route.name}</span>
                  <span className="text-xs opacity-70">{route.grade}</span>
                </button>
              ))}
            </div>

            {routes.length > 0 && (
              <button
                onClick={handleSave}
                disabled={submitting || routes.some(r => !r.name || !r.grade) || !selectedCrag}
                className="w-full bg-green-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 hover:bg-green-700 transition-colors"
              >
                {submitting ? 'Saving...' : 'Save All Routes'}
              </button>
            )}
          </div>
        )}

        {gradePickerOpen && (
          <GradePicker
            isOpen={gradePickerOpen}
            onClose={() => setGradePickerOpen(false)}
            onSelect={(grade) => {
              setCurrentGrade(grade)
              if (selectedRouteIndex !== null) {
                setRoutes(prev => prev.map((r, i) => i === selectedRouteIndex ? { ...r, grade } : r))
              }
              setGradePickerOpen(false)
            }}
            currentGrade={currentGrade}
          />
        )}
      </div>
    </div>
  )
}

function GradePicker({
  isOpen,
  onClose,
  onSelect,
  currentGrade
}: {
  isOpen: boolean
  onClose: () => void
  onSelect: (grade: string) => void
  currentGrade: string
}) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const filteredGrades = FRENCH_GRADES.filter(grade =>
    grade.toLowerCase().includes(search.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select Grade</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose a French grade for this route</p>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search grades..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="max-h-64 overflow-y-auto">
          {filteredGrades.map(grade => (
            <button
              key={grade}
              onClick={() => onSelect(grade)}
              className={`w-full px-4 py-3 text-left font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                currentGrade === grade 
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                  : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {grade}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
