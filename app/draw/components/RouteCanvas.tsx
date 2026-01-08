'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouteSelection, RoutePoint, generateRouteId, findRouteAtPoint } from '@/lib/useRouteSelection'
import GradePicker, { FRENCH_GRADES } from './GradePicker'

interface RouteCanvasProps {
  imageUrl: string
  latitude: number | null
  longitude: number | null
  sessionId: string
  hasGps: boolean
  captureDate: string | null
}

interface Climb {
  id: string
  name: string
  grade: string
  image_url?: string
  description?: string
  crags: { name: string; latitude: number; longitude: number }
  _fullLoaded?: boolean
}

interface RouteWithLabels {
  id: string
  points: RoutePoint[]
  grade: string
  name: string
}

export default function RouteCanvas({ imageUrl, latitude, longitude, sessionId, hasGps, captureDate }: RouteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [climbs, setClimbs] = useState<Climb[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [selectedClimb, setSelectedClimb] = useState<Climb | null>(null)
  const [imageError, setImageError] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>([])
  const [currentGrade, setCurrentGrade] = useState('5A')
  const [currentName, setCurrentName] = useState('')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [routes, setRoutes] = useState<RouteWithLabels[]>([])
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null)
  const [gradePickerOpen, setGradePickerOpen] = useState(false)
  const [gradePickerMode, setGradePickerMode] = useState<'select' | 'vote'>('select')
  const [routeGradeInfo, setRouteGradeInfo] = useState<{
    consensusGrade: string | null
    voteCount: number
    userVote: string | null
  }>({ consensusGrade: null, voteCount: 0, userVote: null })
  const { selectedIds, selectRoute, deselectRoute, isSelected } = useRouteSelection()

  function drawSmoothCurve(ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, dash?: number[]) {
    if (points.length < 2) return

    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (dash) ctx.setLineDash(dash)
    else ctx.setLineDash([])

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)

    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2
      const yc = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
    }

    ctx.quadraticCurveTo(
      points[points.length - 1].x,
      points[points.length - 1].y,
      points[points.length - 1].x,
      points[points.length - 1].y
    )
    ctx.stroke()
    ctx.setLineDash([])
  }

  function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  function drawRoundedLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    bgColor: string,
    font: string
  ) {
    ctx.font = font
    const metrics = ctx.measureText(text)
    const padding = 6
    const cornerRadius = 4
    const bgWidth = metrics.width + padding * 2
    const bgHeight = parseInt(ctx.font, 10) + padding

    const bgX = x - bgWidth / 2
    const bgY = y - bgHeight / 2

    ctx.save()
    drawRoundedRect(ctx, bgX, bgY, bgWidth, bgHeight, cornerRadius)
    ctx.fillStyle = bgColor
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 3
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.restore()

    ctx.fillStyle = 'white'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }

  function getGradeLabelPosition(
    points: RoutePoint[],
    canvasWidth: number,
    canvasHeight: number,
    ctx: CanvasRenderingContext2D
  ): { x: number; y: number } {
    const midIndex = Math.floor(points.length / 2)
    const midPoint = points[midIndex]

    let perpDx = 0, perpDy = 0
    if (points.length >= 3) {
      const prevPoint = points[Math.max(0, midIndex - 1)]
      const nextPoint = points[Math.min(points.length - 1, midIndex + 1)]
      const dx = nextPoint.x - prevPoint.x
      const dy = nextPoint.y - prevPoint.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        perpDx = -dy / len
        perpDy = dx / len
      }
    } else if (points.length === 2) {
      const dx = points[1].x - points[0].x
      const dy = points[1].y - points[0].y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        perpDx = -dy / len
        perpDy = dx / len
      }
    }

    const offset = 12
    const testX = midPoint.x + perpDx * offset
    const testY = midPoint.y + perpDy * offset

    const margin = 30
    if (testX > margin && testX < canvasWidth - margin && testY > margin && testY < canvasHeight - margin) {
      return { x: testX, y: testY }
    }

    return { x: midPoint.x, y: midPoint.y - 15 }
  }

  function getNameLabelPosition(
    points: RoutePoint[],
    canvasWidth: number,
    canvasHeight: number,
    ctx: CanvasRenderingContext2D
  ): { x: number; y: number } {
    const lastPoint = points[points.length - 1]
    const secondLastPoint = points[points.length - 2]

    const dx = lastPoint.x - secondLastPoint.x
    const dy = lastPoint.y - secondLastPoint.y
    const len = Math.sqrt(dx * dx + dy * dy)
    let perpDx = 0, perpDy = 0
    if (len > 0) {
      perpDx = -dy / len
      perpDy = dx / len
    }

    const offset = 10
    const testX = lastPoint.x + perpDx * offset
    const testY = lastPoint.y + perpDy * offset

    const margin = 30
    if (testX > margin && testX < canvasWidth - margin && testY > margin && testY < canvasHeight - margin) {
      return { x: testX, y: testY }
    }

    return { x: lastPoint.x + 15, y: lastPoint.y + 5 }
  }

  function getTruncatedText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text
    let truncated = text
    while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
      truncated = truncated.slice(0, -1)
    }
    return truncated + '...'
  }

  const drawRouteWithLabels = (ctx: CanvasRenderingContext2D, route: RouteWithLabels, scaleX = 1, scaleY = 1, isHighlighted = false, isPreview = false) => {
    const { points, grade, name, id } = route
    const isSelectedRoute = selectedIds.includes(id)

    const scaledPoints = points.map(point => ({
      x: point.x * scaleX,
      y: point.y * scaleY
    }))

    if (isSelectedRoute || isHighlighted) {
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 10
      drawSmoothCurve(ctx, scaledPoints, '#fbbf24', 5, [8, 4])
      ctx.shadowBlur = 0
    }

    const routeColor = isPreview ? '#3b82f6' : '#dc2626'
    drawSmoothCurve(ctx, scaledPoints, routeColor, 3, [8, 4])

    if (scaledPoints.length > 1) {
      const bgColor = isPreview ? 'rgba(59, 130, 246, 0.95)' : 'rgba(220, 38, 38, 0.95)'

      const gradePos = getGradeLabelPosition(scaledPoints, ctx.canvas.width, ctx.canvas.height, ctx)
      drawRoundedLabel(ctx, grade, gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

      const truncatedName = getTruncatedText(ctx, name, 120)
      const namePos = getNameLabelPosition(scaledPoints, ctx.canvas.width, ctx.canvas.height, ctx)
      drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, bgColor, '12px Arial')
    }
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const scaleX = canvas.width / image.naturalWidth
    const scaleY = canvas.height / image.naturalHeight

    routes.forEach(route => {
      const isRouteSelected = selectedIds.includes(route.id)
      drawRouteWithLabels(ctx, route, scaleX, scaleY, isRouteSelected)
    })

    if (currentPoints.length > 0) {
      ctx.fillStyle = 'blue'
      currentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI)
        ctx.fill()
      })

      if (currentPoints.length > 1) {
        drawSmoothCurve(ctx, currentPoints, 'blue', 2, [5, 5])
      }

      if (currentPoints.length > 1 && currentGrade && currentName) {
        const previewRoute: RouteWithLabels = {
          id: 'preview',
          points: currentPoints,
          grade: currentGrade,
          name: currentName
        }
        drawRouteWithLabels(ctx, previewRoute, 1, 1, false, true)
      }
    }
   }, [routes, currentPoints, currentGrade, currentName, imageUrl, selectedIds])

  useEffect(() => {
    if (imageLoaded) redraw()
  }, [routes, currentPoints, imageLoaded, redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

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
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - canvasRect.left
    const canvasY = e.clientY - canvasRect.top

    if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
      return
    }

    const scaleX = image.naturalWidth / canvas.width
    const scaleY = image.naturalHeight / canvas.height
    const x = canvasX * scaleX
    const y = canvasY * scaleY

    const clickedRoute = findRouteAtPoint(routes, { x, y }, 20)

    if (clickedRoute) {
      selectRoute(clickedRoute.id)
      const routeIndex = routes.findIndex(r => r.id === clickedRoute.id)
      if (routeIndex !== -1) {
        setSelectedRouteIndex(routeIndex)
        setCurrentName(clickedRoute.name)
        setCurrentGrade(clickedRoute.grade)
      }
    } else {
      setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
      deselectRoute(selectedIds[0] || '')
      setSelectedRouteIndex(null)
    }
  }, [routes, selectedIds, selectRoute, deselectRoute])

  const handleCanvasTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const touch = e.changedTouches[0]

    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = touch.clientX - canvasRect.left
    const canvasY = touch.clientY - canvasRect.top

    if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
      return
    }

    setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
  }, [])

  const handleFinishRoute = useCallback(() => {
    console.log('Finish Route button clicked - Points:', currentPoints.length, 'Name:', currentName.trim())
    if (currentPoints.length > 1) {
      const routeName = currentName.trim() || `Route ${routes.length + 1}`
      console.log('Finishing route:', routeName, currentGrade, currentPoints.length, 'points')

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
        name: routeName
      }
      setRoutes(prev => [...prev, newRoute])
      setCurrentPoints([])
      setCurrentName('')
      setSelectedRouteIndex(null)
      console.log('Route finished, total routes:', routes.length + 1)
    } else {
      console.log('Cannot finish route: points =', currentPoints.length)
      alert('Please add at least 2 points to the route')
    }
  }, [currentPoints, currentName, currentGrade, routes.length])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      console.log('Enter key pressed - Points:', currentPoints.length, 'Name:', currentName.trim())
      if (currentPoints.length >= 2) {
        console.log('Finishing route via Enter key')
        handleFinishRoute()
      } else {
        console.log('Cannot finish: need 2+ points')
      }
    }
  }, [currentPoints, currentName, handleFinishRoute])



  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])



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

  const handleSave = () => {
    console.log('Save button clicked - routes to save:', routes.length)
    if (routes.length === 0) {
      alert('Please finish at least one route before saving')
      return
    }
    const routeData = {
      imageUrl,
      latitude,
      longitude,
      routes,
      sessionId,
      captureDate
    }
    localStorage.setItem('routeSession', JSON.stringify(routeData))
    console.log('Routes saved, redirecting to name-routes')
    window.location.href = `/name-routes?sessionId=${sessionId}`
  }

  const handleClearCurrent = () => {
    setCurrentPoints([])
    setCurrentName('')
    setSelectedRouteIndex(null)
  }

  const handleSelectRoute = (index: number) => {
    const route = routes[index]
    setSelectedRouteIndex(index)
    setCurrentName(route.name)
    setCurrentGrade(route.grade)
    setCurrentPoints([])
    if (route.id) {
      fetchRouteGradeInfo(route.id)
    }
  }

  const handleUpdateRoute = () => {
    if (selectedRouteIndex !== null) {
      setRoutes(prev => prev.map((route, i) =>
        i === selectedRouteIndex
          ? { ...route, name: currentName.trim() || route.name, grade: currentGrade }
          : route
      ))
      setSelectedRouteIndex(null)
      setCurrentName('')
    }
  }

  const handleGradeVote = async (grade: string) => {
    if (selectedRouteIndex === null) return

    const route = routes[selectedRouteIndex]
    if (!route || !route.id) return

    try {
      const response = await fetch(`/api/routes/${route.id}/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade })
      })

      if (response.ok) {
        fetchRouteGradeInfo(route.id)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to submit grade')
      }
    } catch (err) {
      console.error('Grade vote error:', err)
      alert('Failed to submit grade')
    }
  }

  const fetchRouteGradeInfo = async (routeId: string) => {
    try {
      const response = await fetch(`/api/routes/${routeId}/grades`)
      if (response.ok) {
        const data = await response.json()
        setRouteGradeInfo({
          consensusGrade: data.consensusGrade,
          voteCount: data.voteCount,
          userVote: data.userVote
        })
      }
    } catch (err) {
      console.error('Failed to fetch grade info:', err)
    }
  }

    return (
    <div className="h-screen flex flex-col relative overflow-hidden bg-gray-900 dark:bg-gray-950">
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
          onTouchEnd={handleCanvasTouch}
          style={{ pointerEvents: 'auto', touchAction: 'none' }}
        />
      </div>

      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-3">
        <div className="flex flex-col gap-2 w-full max-w-md mx-auto">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Route name"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={() => {
                setGradePickerMode('select')
                setGradePickerOpen(true)
              }}
              className="w-20 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {currentGrade || 'Grade'}
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={handleFinishRoute}
              className="flex-1 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              disabled={currentPoints.length < 2 || !currentGrade}
            >
              Finish Route
            </button>
            <button
              onClick={handleUndo}
              className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              disabled={currentPoints.length === 0 && routes.length === 0}
            >
              Undo
            </button>
            <button
              onClick={handleClearCurrent}
              className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              disabled={currentPoints.length === 0 && selectedRouteIndex === null}
            >
              Clear
            </button>
            {selectedRouteIndex !== null && (
              <button
                onClick={handleUpdateRoute}
                className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Update
              </button>
            )}
          </div>

          <button
            onClick={handleSave}
            className="bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
            disabled={routes.length === 0 || routes.some(r => !r.grade)}
          >
            Save & Continue ({routes.length})
          </button>

          {selectedRouteIndex !== null && (
            <button
              onClick={() => {
                setGradePickerMode('vote')
                setGradePickerOpen(true)
              }}
              className="bg-blue-600 dark:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
            >
              Log Grade
            </button>
          )}

          {routes.length > 0 && (
            <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Click a route to select:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {routes.map((route, index) => {
                  const isSel = selectedIds.includes(route.id)
                  const displayGrade = route.grade
                  const voteCount = route.id === routes[selectedRouteIndex || 0]?.id ? routeGradeInfo.voteCount : 0
                  const consensusGrade = route.id === routes[selectedRouteIndex || 0]?.id ? routeGradeInfo.consensusGrade : null
                  
                  return (
                    <button
                      key={route.id}
                      onClick={() => {
                        selectRoute(route.id)
                        handleSelectRoute(index)
                      }}
                      className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors ${
                        isSel
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-gray-900 dark:text-yellow-100 border border-yellow-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        isSel ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span className="flex-1 truncate">{route.name}</span>
                      <span className="text-xs opacity-70 flex items-center gap-1">
                        {displayGrade}
                        {voteCount > 0 && (
                          <span className="text-[10px] opacity-50">• {voteCount} votes</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {routes.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {routes.length} route{routes.length !== 1 ? 's' : ''} drawn
            </div>
          )}

          <GradePicker
            isOpen={gradePickerOpen}
            onClose={() => setGradePickerOpen(false)}
            onSelect={(grade) => {
              if (gradePickerMode === 'select') {
                setCurrentGrade(grade)
              } else {
                handleGradeVote(grade)
              }
            }}
            currentGrade={gradePickerMode === 'select' ? currentGrade : undefined}
            userVote={routeGradeInfo.userVote || undefined}
            consensusGrade={routeGradeInfo.consensusGrade || undefined}
            voteCount={routeGradeInfo.voteCount}
            mode={gradePickerMode}
          />
        </div>
      </div>
    </div>
  )
}
