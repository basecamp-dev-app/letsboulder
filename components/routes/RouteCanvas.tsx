'use client'

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { useRouteSelection, RoutePoint, generateRouteId } from '@/lib/useRouteSelection'
import { 
  createSmoothCurvePath,
  drawSmoothCurve,
  drawRoundedLabel,
  getTruncatedText,
  getGradeLabelPosition,
  getNameLabelPosition
} from '@/lib/canvas-utils'
import GradePicker from '@/components/GradePicker'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import type { ImageSelection, NewRouteData, RouteLine, ClimbType } from '@/lib/submission-types'
import { useGradePreferences, getGradeSystemForClimbType } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

interface ExistingRoute {
  id: string
  points: RoutePoint[]
  grade: string
  name: string
  description?: string
  climbType?: string
  image_width?: number
  image_height?: number
}

interface EditableExistingRoute {
  id: string
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
}

interface RouteCanvasProps {
  imageSelection: ImageSelection
  onRoutesUpdate: (routes: NewRouteData[]) => void
  onSubmitRoutes?: (routes: NewRouteData[]) => void
  existingRouteLines?: RouteLine[]
  mode?: 'submit' | 'edit-existing'
  allowCreateRoutesInEditMode?: boolean
  onEditRoutesUpdate?: (routes: EditableExistingRoute[]) => void
  onSaveEdits?: () => void
  savingEdits?: boolean
  showEditSaveButton?: boolean
  onSaveNewRoutes?: (routes: NewRouteData[]) => void
  savingNewRoutes?: boolean
  defaultClimbType?: ClimbType
  onDeleteExistingRoute?: (routeLineId: string) => Promise<void>
  deletingExistingRouteId?: string | null
}

function convertNormalizedPointsToCanvas(
  points: RoutePoint[],
  dims: { width: number; height: number; naturalWidth: number; naturalHeight: number },
  originalImageWidth?: number,
  originalImageHeight?: number
): RoutePoint[] {
  if (points.length < 2) return points

  const maxX = Math.max(...points.map((p) => p.x))
  const maxY = Math.max(...points.map((p) => p.y))
  const seemsNormalized = maxX <= 1.2 && maxY <= 1.2
  if (seemsNormalized) {
    return points.map((point) => ({
      x: Math.min(1, Math.max(0, point.x)) * dims.width,
      y: Math.min(1, Math.max(0, point.y)) * dims.height,
    }))
  }

  const hasOriginalDimensions = Boolean(
    originalImageWidth &&
    originalImageWidth > 0 &&
    originalImageHeight &&
    originalImageHeight > 0
  )

  if (hasOriginalDimensions) {
    const baseWidth = originalImageWidth as number
    const baseHeight = originalImageHeight as number
    return points.map((point) => ({
      x: (point.x / baseWidth) * dims.width,
      y: (point.y / baseHeight) * dims.height,
    }))
  }

  const alreadyCanvasSpace = maxX <= dims.width * 1.05 && maxY <= dims.height * 1.05
  if (alreadyCanvasSpace) return points

  if (!dims.naturalWidth || !dims.naturalHeight) return points

  return points.map((point) => ({
    x: (point.x / dims.naturalWidth) * dims.width,
    y: (point.y / dims.naturalHeight) * dims.height,
  }))
}

export default function RouteCanvas({
  imageSelection,
  onRoutesUpdate,
  onSubmitRoutes,
  existingRouteLines,
  mode = 'submit',
  allowCreateRoutesInEditMode = false,
  onEditRoutesUpdate,
  onSaveEdits,
  savingEdits = false,
  showEditSaveButton = true,
  onSaveNewRoutes,
  savingNewRoutes = false,
  defaultClimbType,
  onDeleteExistingRoute,
  deletingExistingRouteId = null,
}: RouteCanvasProps) {
  const isEditExistingMode = mode === 'edit-existing'
  const canCreateRoutesInEditMode = isEditExistingMode && allowCreateRoutesInEditMode
  const gradePreferences = useGradePreferences()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)

  // Get grade system for a specific climb type
  const getGradeSystemForRoute = useCallback((climbType?: string) => 
    getGradeSystemForClimbType(climbType || defaultClimbType, gradePreferences),
  [defaultClimbType, gradePreferences])

  // Get formatted grade for a specific climb type
  const getGradeDisplay = useCallback((grade: string, climbType?: string) => {
    const system = getGradeSystemForRoute(climbType)
    return formatGradeForDisplay(grade, system)
  }, [getGradeSystemForRoute])

  const imageUrl = imageSelection.mode === 'existing'
    ? imageSelection.imageUrl
    : imageSelection.mode === 'new'
      ? imageSelection.images[imageSelection.primaryIndex]?.uploadedUrl || ''
      : imageSelection.imageUrl

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [pinchStartZoom, setPinchStartZoom] = useState<number | null>(null)
  const [pinchStartDistance, setPinchStartDistance] = useState<number | null>(null)
  const [pinchCenter, setPinchCenter] = useState<{ x: number; y: number } | null>(null)
  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>([])
  const [currentName, setCurrentName] = useState('')
  const [currentGrade, setCurrentGrade] = useState('6A')
  const [currentClimbType, setCurrentClimbType] = useState<string | undefined>(defaultClimbType)
  const [currentDescription, setCurrentDescription] = useState('')
  const [gradePickerOpen, setGradePickerOpen] = useState(false)
  const [completedRoutes, setCompletedRoutes] = useState<ExistingRoute[]>([])
  const [existingRoutes, setExistingRoutes] = useState<ExistingRoute[]>(() => {
    if (existingRouteLines && existingRouteLines.length > 0) {
      return existingRouteLines.map((rl, index) => ({
        id: rl.id,
        points: rl.points,
        grade: rl.climb?.grade || '6A',
        name: rl.climb?.name || `Route ${index + 1}`,
        description: rl.climb?.description || undefined,
        climbType: rl.climb?.route_type || undefined,
        image_width: rl.image_width,
        image_height: rl.image_height,
      }))
    }
    return []
  })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<{
    width: number
    height: number
    naturalWidth: number
    naturalHeight: number
  } | null>(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null)
  const [descriptionFocused, setDescriptionFocused] = useState(false)
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true)
  const [interactionMode, setInteractionMode] = useState<'browse' | 'draw'>('browse')
  const previousCanvasSizeRef = useRef<{ width: number; height: number } | null>(null)
  const hasHydratedExistingRoutesRef = useRef(false)
  const touchStartCanvasPointRef = useRef<RoutePoint | null>(null)
  const isDrawingInProgress = currentPoints.length > 0
  const touchTapThreshold = 14
  const isDrawMode = interactionMode === 'draw'
  const canDrawRoutes = !isEditExistingMode || canCreateRoutesInEditMode

  useEffect(() => {
    hasHydratedExistingRoutesRef.current = false
    previousCanvasSizeRef.current = null
  }, [imageUrl])

  useOverlayHistory({
    open: showSubmitConfirm,
    onClose: () => setShowSubmitConfirm(false),
    id: 'route-submit-confirm',
  })

  const { selectRoute, clearSelection, selectedIds } = useRouteSelection()

  const selectedNewRoute = selectedIds.length === 1
    ? completedRoutes.find(route => route.id === selectedIds[0]) ?? null
    : null
  const selectedExistingRoute = selectedIds.length === 1
    ? existingRoutes.find(route => route.id === selectedIds[0]) ?? null
    : null
  const editableRoute = isEditExistingMode ? (selectedExistingRoute || selectedNewRoute) : selectedNewRoute
  const existingRoutePaths = useMemo(() => new Map(
    existingRoutes.map((route) => [route.id, createSmoothCurvePath(route.points)])
  ), [existingRoutes])
  const completedRoutePaths = useMemo(() => new Map(
    completedRoutes.map((route) => [route.id, createSmoothCurvePath(route.points)])
  ), [completedRoutes])
  const currentRoutePath = useMemo(
    () => createSmoothCurvePath(currentPoints),
    [currentPoints]
  )
  const selectableRoutes = useMemo(() => {
    const newRouteItems = completedRoutes.map((route, index) => ({
      id: route.id,
      name: route.name.trim() || `Route ${index + 1}`,
      grade: route.grade,
      climbType: route.climbType,
      isDraft: true,
    }))

    const existingRouteItems = isEditExistingMode
      ? existingRoutes.map((route, index) => ({
          id: route.id,
          name: route.name.trim() || `Route ${index + 1}`,
          grade: route.grade,
          climbType: route.climbType,
          isDraft: false,
        }))
      : []

    return [...newRouteItems, ...existingRouteItems]
  }, [completedRoutes, existingRoutes, isEditExistingMode])

  const updateSelectedNewRoute = useCallback((updates: Partial<ExistingRoute>) => {
    if (!selectedNewRoute) return

    setCompletedRoutes(prev => prev.map(route => {
      if (route.id !== selectedNewRoute.id) return route
      return { ...route, ...updates }
    }))
  }, [selectedNewRoute])

  const updateSelectedExistingRoute = useCallback((updates: Partial<ExistingRoute>) => {
    if (!selectedExistingRoute) return

    setExistingRoutes(prev => prev.map(route => {
      if (route.id !== selectedExistingRoute.id) return route
      return { ...route, ...updates }
    }))
  }, [selectedExistingRoute])

  const handleSelectRouteFromList = useCallback((routeId: string) => {
    selectRoute(routeId)
    setInteractionMode('browse')
    setIsDetailsExpanded(true)
  }, [selectRoute])

  const getTouchPos = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || e.touches.length === 0) return { x: 0, y: 0 }

    const touch = e.touches[0]
    const rect = canvas.getBoundingClientRect()

    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }
  }, [])

  const getDragHandleIndex = useCallback((point: RoutePoint, threshold: number = 14) => {
    if (!editableRoute) return null

    for (let i = 0; i < editableRoute.points.length; i++) {
      const handle = editableRoute.points[i]
      const distance = Math.hypot(point.x - handle.x, point.y - handle.y)
      if (distance <= threshold) {
        return i
      }
    }

    return null
  }, [editableRoute])

  const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const getCanvasDisplaySize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const width = canvas.clientWidth
    const height = canvas.clientHeight

    if (width === 0 || height === 0) return null

    return { width, height }
  }, [])

  const getRouteAtPoint = useCallback((point: RoutePoint) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return null

    const routeGroups = [
      [...completedRoutes].reverse().map((route) => ({ route, path: completedRoutePaths.get(route.id) ?? null, hitWidth: 20 })),
      [...existingRoutes].reverse().map((route) => ({ route, path: existingRoutePaths.get(route.id) ?? null, hitWidth: 20 })),
    ]

    for (const group of routeGroups) {
      for (const entry of group) {
        if (!entry.path) continue
        ctx.save()
        ctx.lineWidth = entry.hitWidth
        const isHit = ctx.isPointInStroke(entry.path, point.x, point.y)
        ctx.restore()
        if (isHit) {
          return entry.route
        }
      }
    }

    return null
  }, [completedRoutes, completedRoutePaths, existingRoutes, existingRoutePaths])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (e.button === 0 && !e.altKey) {
      const pos = getMousePos(e)

      if (isDrawMode && isDrawingInProgress) {
        setCurrentPoints(prev => [...prev, pos])
        return
      }

      const dragHandleIndex = getDragHandleIndex(pos)
      if (dragHandleIndex !== null) {
        setDraggingPointIndex(dragHandleIndex)
        return
      }

      if (!isDrawMode) {
        const clickedRoute = getRouteAtPoint(pos)
        if (clickedRoute) {
          selectRoute(clickedRoute.id)
        } else {
          clearSelection()
        }
        return
      }

      const clickedRoute = getRouteAtPoint(pos)
      if (clickedRoute) {
        selectRoute(clickedRoute.id)
        return
      }

      clearSelection()

      if (isEditExistingMode && !canCreateRoutesInEditMode) {
        return
      }

      if (currentPoints.length === 0) {
        setCurrentPoints([pos])
      } else {
        setCurrentPoints(prev => [...prev, pos])
      }
    }
  }, [getMousePos, isDrawMode, isDrawingInProgress, getDragHandleIndex, getRouteAtPoint, isEditExistingMode, canCreateRoutesInEditMode, currentPoints.length, selectRoute, clearSelection])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasReady) return

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.hypot(dx, dy)
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      setPinchStartZoom(zoom)
      setPinchStartDistance(distance)
      setPinchCenter({ x: centerX, y: centerY })
      return
    }

    const pos = getTouchPos(e)
    touchStartCanvasPointRef.current = pos
    const dragHandleIndex = getDragHandleIndex(pos)
    if (dragHandleIndex !== null) {
      setDraggingPointIndex(dragHandleIndex)
      e.preventDefault()
      return
    }

    if (canDrawRoutes && e.touches.length === 1) {
      e.preventDefault()
    }
  }, [canvasReady, getTouchPos, getDragHandleIndex, zoom, canDrawRoutes])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasReady) return

    if (pinchStartZoom !== null) {
      setPinchStartZoom(null)
      setPinchStartDistance(null)
      setPinchCenter(null)
      touchStartCanvasPointRef.current = null
      return
    }

    if (draggingPointIndex !== null) {
      setDraggingPointIndex(null)
      touchStartCanvasPointRef.current = null
      return
    }

    const touch = e.changedTouches[0]
    const canvas = canvasRef.current
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0 || !touch) return

    const rect = canvas.getBoundingClientRect()
    const canvasX = touch.clientX - rect.left
    const canvasY = touch.clientY - rect.top

    const touchStartPoint = touchStartCanvasPointRef.current
    touchStartCanvasPointRef.current = null

    if (touchStartPoint) {
      const moveDistance = Math.hypot(canvasX - touchStartPoint.x, canvasY - touchStartPoint.y)
      if (moveDistance > touchTapThreshold) {
        return
      }
    }

    if (!isDrawMode) {
      const clickedRoute = getRouteAtPoint({ x: canvasX, y: canvasY })
      if (clickedRoute) {
        selectRoute(clickedRoute.id)
      } else {
        clearSelection()
      }
      return
    }

    if (isDrawingInProgress) {
      setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
      return
    }

    const clickedRoute = getRouteAtPoint({ x: canvasX, y: canvasY })

    if (clickedRoute) {
      const routeId = clickedRoute.id
      selectRoute(routeId)
      return
    }

    clearSelection()

    if (isEditExistingMode && !canCreateRoutesInEditMode) {
      return
    }

    if (currentPoints.length === 0) {
      setCurrentPoints([{ x: canvasX, y: canvasY }])
    } else {
      setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
    }
  }, [canvasReady, pinchStartZoom, draggingPointIndex, isDrawingInProgress, getRouteAtPoint, isEditExistingMode, canCreateRoutesInEditMode, currentPoints.length, selectRoute, clearSelection, isDrawMode])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasReady) return

    if (e.touches.length === 2 && pinchStartZoom !== null && pinchStartDistance !== null && pinchCenter) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.hypot(dx, dy)
      const scale = distance / pinchStartDistance
      const newZoom = Math.min(3, Math.max(1, pinchStartZoom * scale))
      
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      
      const zoomDelta = newZoom / zoom
      const newPanX = centerX - (centerX - pan.x) * zoomDelta
      const newPanY = centerY - (centerY - pan.y) * zoomDelta
      
      setZoom(newZoom)
      setPan({ x: newPanX, y: newPanY })
      e.preventDefault()
      return
    }

    if (canDrawRoutes && e.touches.length === 1) {
      e.preventDefault()
    }

    if (draggingPointIndex === null || !editableRoute) return

    const pos = getTouchPos(e)
    const nextPoints = editableRoute.points.map((point, index) => {
        if (index !== draggingPointIndex) return point
        return pos
      })

    if (isEditExistingMode && selectedExistingRoute) {
      updateSelectedExistingRoute({ points: nextPoints })
    } else {
      updateSelectedNewRoute({ points: nextPoints })
    }

    e.preventDefault()
  }, [canvasReady, draggingPointIndex, editableRoute, getTouchPos, isEditExistingMode, selectedExistingRoute, updateSelectedExistingRoute, updateSelectedNewRoute, pinchStartZoom, pinchStartDistance, pinchCenter, zoom, pan, canDrawRoutes])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingPointIndex !== null && editableRoute) {
      const pos = getMousePos(e)
      const nextPoints = editableRoute.points.map((point, index) => {
          if (index !== draggingPointIndex) return point
          return pos
        })

      if (isEditExistingMode && selectedExistingRoute) {
        updateSelectedExistingRoute({ points: nextPoints })
      } else {
        updateSelectedNewRoute({ points: nextPoints })
      }
      return
    }

    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x
      const dy = e.clientY - lastPanPoint.y
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (isDrawMode && (!isEditExistingMode || canCreateRoutesInEditMode) && e.buttons === 1 && !e.altKey && currentPoints.length > 0) {
      const pos = getMousePos(e)
      const lastPoint = currentPoints[currentPoints.length - 1]
      const distance = Math.sqrt(
        Math.pow(pos.x - lastPoint.x, 2) + Math.pow(pos.y - lastPoint.y, 2)
      )

      if (distance > 10) {
        setCurrentPoints(prev => [...prev, pos])
      }
    }
  }, [draggingPointIndex, editableRoute, isDrawMode, isEditExistingMode, canCreateRoutesInEditMode, selectedExistingRoute, updateSelectedExistingRoute, updateSelectedNewRoute, isPanning, lastPanPoint, getMousePos, currentPoints])

  const handleMouseUp = useCallback(() => {
    setDraggingPointIndex(null)

    setIsPanning(false)
  }, [])

  const cancelCurrentDrawing = useCallback(() => {
    setCurrentPoints([])
    setInteractionMode('browse')
  }, [])

  const undoLastPoint = useCallback(() => {
    setCurrentPoints((prev) => prev.slice(0, -1))
  }, [])

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingInProgress) return
    e.preventDefault()
    cancelCurrentDrawing()
  }, [isDrawingInProgress, cancelCurrentDrawing])

  useEffect(() => {
    if (!isDrawingInProgress) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancelCurrentDrawing()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDrawingInProgress, cancelCurrentDrawing])

  const handleCompleteRoute = useCallback(() => {
    if (currentPoints.length < 2) return

    const routeId = generateRouteId()
    const trimmedDescription = currentDescription.trim()
    const routeName = currentName.trim() || `Route ${completedRoutes.length + 1}`
    const route: ExistingRoute = {
      id: routeId,
      points: currentPoints,
      name: routeName,
      grade: currentGrade,
      description: trimmedDescription || undefined,
      climbType: currentClimbType,
    }

    setCompletedRoutes(prev => [...prev, route])
    setCurrentPoints([])
    setCurrentName('')
    setCurrentGrade('6A')
    setCurrentDescription('')
    setInteractionMode('browse')
    selectRoute(routeId)
  }, [currentPoints, currentName, currentGrade, currentClimbType, currentDescription, completedRoutes, selectRoute])

  const handleDeleteSelected = useCallback(() => {
    setCompletedRoutes(prev => prev.filter(route => !selectedIds.includes(route.id)))
    clearSelection()
  }, [selectedIds, clearSelection])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    existingRoutes.forEach(route => {
      const isSelected = selectedIds.includes(route.id)
      const lineColor = isEditExistingMode ? (isSelected ? '#fbbf24' : '#ef4444') : (isSelected ? '#fbbf24' : '#9ca3af')
      const lineWidth = isEditExistingMode ? (isSelected ? 4 : 3) : (isSelected ? 3 : 2)
      const routePath = existingRoutePaths.get(route.id) ?? null

      ctx.shadowColor = isSelected ? '#fbbf24' : '#6b7280'
      ctx.shadowBlur = isSelected ? 8 : 2
      if (routePath) {
        drawSmoothCurve(ctx, routePath, lineColor, lineWidth, isEditExistingMode ? [8, 4] : [4, 4])
      }
      ctx.shadowBlur = 0

      if (route.points.length > 1 && isSelected) {
        const bgColor = 'rgba(251, 191, 36, 0.95)'
        const gradePos = getGradeLabelPosition(route.points)
        drawRoundedLabel(ctx, getGradeDisplay(route.grade, route.climbType), gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, route.name, 150)
        const namePos = getNameLabelPosition(route.points)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, bgColor, '12px Arial')

        if (isEditExistingMode) {
          route.points.forEach((point, index) => {
            ctx.beginPath()
            ctx.arc(point.x, point.y, index === 0 ? 6 : 5, 0, 2 * Math.PI)
            ctx.fillStyle = '#ffffff'
            ctx.fill()
            ctx.lineWidth = 2
            ctx.strokeStyle = '#dc2626'
            ctx.stroke()
          })
        }
      }
    })

    completedRoutes.forEach(route => {
      const isSelected = selectedIds.includes(route.id)
      const routePath = completedRoutePaths.get(route.id) ?? null

      if (isSelected && routePath) {
        ctx.shadowColor = '#fbbf24'
        ctx.shadowBlur = 10
        drawSmoothCurve(ctx, routePath, '#fbbf24', 4)
        ctx.shadowBlur = 0
      }

      if (routePath) {
        drawSmoothCurve(ctx, routePath, '#dc2626', isSelected ? 4 : 3, [8, 4])
      }

      if (isSelected) {
        route.points.forEach((point, index) => {
          ctx.beginPath()
          ctx.arc(point.x, point.y, index === 0 ? 6 : 5, 0, 2 * Math.PI)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = '#dc2626'
          ctx.stroke()
        })
      }

      if (route.points.length > 1) {
        const bgColor = 'rgba(220, 38, 38, 0.95)'
        const gradePos = getGradeLabelPosition(route.points)
        drawRoundedLabel(ctx, getGradeDisplay(route.grade, route.climbType), gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, route.name, 150)
        const namePos = getNameLabelPosition(route.points)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, bgColor, '12px Arial')
      }
    })

    if (currentPoints.length > 0) {
      ctx.fillStyle = '#3b82f6'
      currentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI)
        ctx.fill()
      })

      if (currentPoints.length > 1) {
        if (currentRoutePath) {
          drawSmoothCurve(ctx, currentRoutePath, '#3b82f6', 2, [5, 5])
        }
      }

      if (currentPoints.length > 1 && currentGrade && currentName && currentRoutePath) {
        drawSmoothCurve(ctx, currentRoutePath, '#3b82f6', 3, [8, 4])

        const gradePos = getGradeLabelPosition(currentPoints)
        drawRoundedLabel(ctx, getGradeDisplay(currentGrade, currentClimbType), gradePos.x, gradePos.y, 'rgba(59, 130, 246, 0.95)', 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, currentName, 150)
        const namePos = getNameLabelPosition(currentPoints)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, 'rgba(59, 130, 246, 0.95)', '12px Arial')
      }
    }
  }, [completedRoutePaths, completedRoutes, currentPoints, currentGrade, currentName, currentClimbType, currentRoutePath, existingRoutePaths, existingRoutes, selectedIds, isEditExistingMode, getGradeDisplay])

  useEffect(() => {
    if (imageLoaded) {
      redraw()
    }
  }, [imageLoaded, redraw])

  const normalizeCanvasPoints = useCallback((points: RoutePoint[]) => {
    const canvasDisplaySize = getCanvasDisplaySize()
    if (!canvasDisplaySize) return points

    return points.map((point) => ({
      x: Math.min(1, Math.max(0, point.x / canvasDisplaySize.width)),
      y: Math.min(1, Math.max(0, point.y / canvasDisplaySize.height)),
    }))
  }, [getCanvasDisplaySize])

  const getNormalizedCompletedRoutes = useCallback((): NewRouteData[] => {
    if (!imageDimensions) return []

    return completedRoutes.map((route, index) => ({
      id: route.id,
      name: route.name,
      grade: route.grade,
      description: route.description,
      climbType: route.climbType as NewRouteData['climbType'],
      points: normalizeCanvasPoints(route.points),
      sequenceOrder: index,
      imageWidth: imageDimensions.naturalWidth,
      imageHeight: imageDimensions.naturalHeight,
      imageNaturalWidth: imageDimensions.naturalWidth,
      imageNaturalHeight: imageDimensions.naturalHeight,
    }))
  }, [completedRoutes, imageDimensions, normalizeCanvasPoints])

  useEffect(() => {
    const image = imageRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!image || !canvas || !container || !image.complete || !imageDimensions) return

    const normalizedRoutes = getNormalizedCompletedRoutes()

    onRoutesUpdate(normalizedRoutes)
    redraw()
  }, [getNormalizedCompletedRoutes, imageDimensions, onRoutesUpdate, redraw])

  useEffect(() => {
    if (!isEditExistingMode || !imageDimensions || !onEditRoutesUpdate || !canvasReady) return

    const canvas = canvasRef.current
    if (!canvas || canvas.clientWidth < 32 || canvas.clientHeight < 32) return

    onEditRoutesUpdate(existingRoutes.map((route) => ({
      id: route.id,
      name: route.name,
      grade: route.grade,
      description: route.description,
      points: normalizeCanvasPoints(route.points),
    })))
  }, [isEditExistingMode, imageDimensions, existingRoutes, normalizeCanvasPoints, onEditRoutesUpdate, canvasReady])

  const handleAddNewRouteInEditMode = useCallback(() => {
    if (!canCreateRoutesInEditMode || !onSaveNewRoutes || !imageDimensions || currentPoints.length < 2) return

    const trimmedDescription = currentDescription.trim()
    const routeName = currentName.trim() || `Route ${existingRoutes.length + 1}`

    onSaveNewRoutes([{
      id: generateRouteId(),
      name: routeName,
      grade: currentGrade,
      description: trimmedDescription || undefined,
      points: normalizeCanvasPoints(currentPoints),
      sequenceOrder: 0,
      imageWidth: imageDimensions.naturalWidth,
      imageHeight: imageDimensions.naturalHeight,
      imageNaturalWidth: imageDimensions.naturalWidth,
      imageNaturalHeight: imageDimensions.naturalHeight,
      climbType: currentClimbType as ClimbType,
    }])

    setCurrentPoints([])
    setCurrentName('')
    setCurrentGrade('6A')
    setCurrentDescription('')
    setInteractionMode('browse')
    clearSelection()
  }, [canCreateRoutesInEditMode, onSaveNewRoutes, imageDimensions, currentPoints, currentDescription, currentName, existingRoutes.length, currentGrade, currentClimbType, normalizeCanvasPoints, clearSelection])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !image.complete) {
      setCanvasReady(false)
      return
    }

    const rect = image.getBoundingClientRect()
    const untransformedWidth = rect.width / zoom
    const untransformedHeight = rect.height / zoom

    const containerAspect = untransformedWidth / untransformedHeight
    const naturalAspect = image.naturalWidth / image.naturalHeight

    let displayedWidth: number
    let displayedHeight: number

    if (naturalAspect > containerAspect) {
      displayedWidth = untransformedWidth
      displayedHeight = untransformedWidth / naturalAspect
    } else {
      displayedHeight = untransformedHeight
      displayedWidth = untransformedHeight * naturalAspect
    }

    const offsetX = (untransformedWidth - displayedWidth) / 2
    const offsetY = (untransformedHeight - displayedHeight) / 2

    if (displayedWidth <= 0 || displayedHeight <= 0) {
      setCanvasReady(false)
      return
    }

    const previousCanvasSize = previousCanvasSizeRef.current
    if (previousCanvasSize && previousCanvasSize.width > 0 && previousCanvasSize.height > 0) {
      const widthScale = displayedWidth / previousCanvasSize.width
      const heightScale = displayedHeight / previousCanvasSize.height
      const sizeChanged = Math.abs(widthScale - 1) > 0.001 || Math.abs(heightScale - 1) > 0.001

      if (sizeChanged) {
        const scalePoints = (points: RoutePoint[]) => points.map((point) => ({
          x: point.x * widthScale,
          y: point.y * heightScale,
        }))

        setExistingRoutes((prev) => prev.map((route) => ({
          ...route,
          points: scalePoints(route.points),
        })))
        setCompletedRoutes((prev) => prev.map((route) => ({
          ...route,
          points: scalePoints(route.points),
        })))
        setCurrentPoints((prev) => scalePoints(prev))
      }
    }

    previousCanvasSizeRef.current = { width: displayedWidth, height: displayedHeight }

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

    canvas.style.left = offsetX + 'px'
    canvas.style.top = offsetY + 'px'
    canvas.width = Math.round(displayedWidth * dpr)
    canvas.height = Math.round(displayedHeight * dpr)
    canvas.style.width = displayedWidth + 'px'
    canvas.style.height = displayedHeight + 'px'

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    setCanvasReady(true)
    redraw()
  }, [redraw, zoom])

  useEffect(() => {
    if (!imageLoaded) return

    let rafId = 0
    rafId = window.requestAnimationFrame(() => {
      setupCanvas()
    })

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [imageLoaded, setupCanvas])

  useEffect(() => {
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
  }, [setupCanvas])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        redraw()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [redraw])

  useEffect(() => {
    if (!imageLoaded || typeof ResizeObserver === 'undefined') return

    const imageContainer = imageContainerRef.current
    if (!imageContainer) return

    const observer = new ResizeObserver(() => {
      setupCanvas()
    })

    observer.observe(imageContainer)

    return () => {
      observer.disconnect()
    }
  }, [imageLoaded, setupCanvas])

  const activeName = editableRoute ? editableRoute.name : currentName
  const activeGrade = editableRoute ? editableRoute.grade : currentGrade
  const activeClimbType = editableRoute ? editableRoute.climbType : currentClimbType
  const activeDescription = editableRoute ? (editableRoute.description || '') : currentDescription
  const isEditingExistingRoute = !isEditExistingMode && Boolean(selectedExistingRoute)
  const disableEditInputs = isEditExistingMode ? (!canCreateRoutesInEditMode && !selectedExistingRoute) : isEditingExistingRoute
  const disableGradePicker = disableEditInputs
  const allRoutesValid = completedRoutes.every(route => route.name.trim().length > 0)
  return (
    <div className="h-full w-full flex flex-col md:flex-row">
      <div className="flex-1 min-h-0 relative bg-gray-100 dark:bg-gray-900" ref={containerRef}>
        <div
          ref={imageContainerRef}
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          <Image
            ref={imageRef}
            src={imageUrl}
            alt="Route"
            fill
            unoptimized
            sizes="100vw"
            className={`absolute inset-0 w-full h-full object-contain ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => {
              const img = imageRef.current
              if (img) {
                const rect = img.getBoundingClientRect()
                const untransformedWidth = rect.width / zoom
                const untransformedHeight = rect.height / zoom
                const containerAspect = untransformedWidth / untransformedHeight
                const naturalAspect = img.naturalWidth / img.naturalHeight

                let displayedWidth: number
                let displayedHeight: number

                if (naturalAspect > containerAspect) {
                  displayedWidth = untransformedWidth
                  displayedHeight = untransformedWidth / naturalAspect
                } else {
                  displayedHeight = untransformedHeight
                  displayedWidth = untransformedHeight * naturalAspect
                }

                const nextDims = {
                  width: displayedWidth,
                  height: displayedHeight,
                  naturalWidth: img.naturalWidth,
                  naturalHeight: img.naturalHeight,
                }
                setImageDimensions({
                  width: nextDims.width,
                  height: nextDims.height,
                  naturalWidth: nextDims.naturalWidth,
                  naturalHeight: nextDims.naturalHeight
                })

                if (isEditExistingMode && !hasHydratedExistingRoutesRef.current) {
                  setExistingRoutes((prev) => prev.map((route) => ({
                    ...route,
                    points: convertNormalizedPointsToCanvas(
                      route.points,
                      nextDims,
                      route.image_width,
                      route.image_height
                    ),
                  })))
                  hasHydratedExistingRoutesRef.current = true
                }
              }
              setImageLoaded(true)
            }}
            onError={() => setImageError(true)}
            draggable={false}
          />

          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center text-red-500">
              Failed to load image
            </div>
          )}

          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}

              <canvas
                ref={canvasRef}
                className="absolute cursor-crosshair select-none"
              style={{
                left: 0,
                top: 0,
                touchAction: 'none',
                WebkitTapHighlightColor: 'transparent'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onContextMenu={handleCanvasContextMenu}
            />
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 md:relative md:w-64 md:shrink-0 bg-white dark:bg-gray-800 md:border-l md:border-gray-200 md:dark:border-gray-700 overflow-y-auto md:max-h-none">
          <>
            <div className="border-b border-gray-200 px-2 py-2 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInteractionMode((current) => current === 'draw' ? 'browse' : 'draw')}
                  className={`w-full rounded-md px-2 py-2 text-xs font-semibold ${interactionMode === 'draw' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'}`}
                >
                  {interactionMode === 'draw' ? 'Stop drawing' : 'Draw'}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                Use the route list below to select routes. Turn on Draw to place points.
              </p>
            </div>
            {selectableRoutes.length > 0 ? (
              <div className="border-b border-gray-200 px-2 py-2 dark:border-gray-700">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Routes
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
                  {selectableRoutes.map((route, index) => {
                    const isSelected = selectedIds.includes(route.id)
                    return (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => handleSelectRouteFromList(route.id)}
                        className={`min-w-40 shrink-0 rounded-lg border px-3 py-2 text-left transition-colors md:min-w-0 ${isSelected ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-100' : 'border-gray-200 bg-gray-50 text-gray-800 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-800'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{route.name}</span>
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{getGradeDisplay(route.grade, route.climbType)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                          {route.isDraft ? `Draft route ${index + 1}` : 'Existing route'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
            <button
              onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
              className="w-full flex items-center justify-between px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400"
            >
              <span>{isDetailsExpanded ? '▼' : '▶'} {selectedNewRoute ? 'Edit Selected' : 'Route Details'}</span>
            </button>
            
            {isDetailsExpanded && (
            <div>
              {isEditingExistingRoute && (
                <p className="px-2 text-xs text-amber-700 dark:text-amber-300">
                  Existing routes are read-only. Select a new route you drew.
                </p>
              )}

              {isEditExistingMode && (
                <p className="px-2 text-xs text-blue-700 dark:text-blue-300">
                  Grade changes are saved as collaborator votes when you save all changes.
                </p>
              )}

              <input
                type="text"
                value={activeName}
                onChange={(e) => {
                  const value = e.target.value
                  if (selectedNewRoute) {
                    updateSelectedNewRoute({ name: value })
                  } else if (isEditExistingMode && selectedExistingRoute) {
                    updateSelectedExistingRoute({ name: value })
                  } else {
                    setCurrentName(value)
                  }
                }}
                placeholder="Route name"
                disabled={disableEditInputs}
                className="w-full px-2 py-1 text-sm border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-60"
              />

              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!disableGradePicker) {
                    setGradePickerOpen(true)
                  }
                }}
                disabled={disableGradePicker}
                className="w-full px-2 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {getGradeDisplay(activeGrade, activeClimbType)}
              </button>

              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Type:</span>
                <select
                  value={activeClimbType || defaultClimbType || 'boulder'}
                  onChange={(e) => {
                    const value = e.target.value as string
                    if (selectedNewRoute) {
                      updateSelectedNewRoute({ climbType: value })
                    } else if (isEditExistingMode && selectedExistingRoute) {
                      updateSelectedExistingRoute({ climbType: value })
                    } else {
                      setCurrentClimbType(value)
                    }
                  }}
                  disabled={disableEditInputs}
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-60"
                >
                  <option value="boulder">Boulder</option>
                  <option value="sport">Sport</option>
                  <option value="deep_water_solo">DWS</option>
                  <option value="trad">Trad</option>
                </select>
              </div>

              <textarea
                value={activeDescription}
                onChange={(e) => {
                  const value = e.target.value
                  if (selectedNewRoute) {
                    updateSelectedNewRoute({ description: value.length > 0 ? value : undefined })
                  } else if (isEditExistingMode && selectedExistingRoute) {
                    updateSelectedExistingRoute({ description: value.length > 0 ? value : undefined })
                  } else {
                    setCurrentDescription(value)
                  }
                }}
                onFocus={() => setDescriptionFocused(true)}
                onBlur={() => setDescriptionFocused(false)}
                placeholder="Optional beta / gear / crux notes"
                maxLength={500}
                rows={descriptionFocused || activeDescription ? 3 : 1}
                disabled={disableEditInputs}
                className="w-full px-2 py-1 text-sm border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none disabled:opacity-60"
              />

              {(selectedNewRoute || (isEditExistingMode && selectedExistingRoute)) && (
                <button
                  onClick={() => {
                    if (selectedNewRoute) {
                      handleDeleteSelected()
                      return
                    }
                    if (isEditExistingMode && selectedExistingRoute && onDeleteExistingRoute) {
                      void onDeleteExistingRoute(selectedExistingRoute.id)
                    }
                  }}
                  disabled={Boolean(isEditExistingMode && selectedExistingRoute && deletingExistingRouteId === selectedExistingRoute.id)}
                  className="w-full px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                >
                  {isEditExistingMode && selectedExistingRoute && deletingExistingRouteId === selectedExistingRoute.id ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
            )}
          </>
          

          {currentPoints.length > 0 && (!isEditExistingMode || canCreateRoutesInEditMode) && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={undoLastPoint}
                disabled={currentPoints.length === 0}
                className="flex-1 px-2 py-2 bg-amber-100 text-amber-800 text-sm disabled:opacity-60 dark:bg-amber-900/30 dark:text-amber-200"
              >
                Undo point
              </button>
              <button
                type="button"
                onClick={cancelCurrentDrawing}
                className="flex-1 px-2 py-2 bg-gray-800 text-white text-sm"
              >
                Cancel
              </button>
              {!isEditExistingMode ? (
                <button
                  type="button"
                  onClick={handleCompleteRoute}
                  disabled={currentPoints.length < 2}
                  className="flex-1 px-2 py-2 bg-blue-600 text-white text-sm disabled:opacity-60"
                >
                  Finish route
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAddNewRouteInEditMode}
                  disabled={!onSaveNewRoutes || savingNewRoutes || currentPoints.length < 2}
                  className="flex-1 px-2 py-2 bg-emerald-600 text-white text-sm disabled:opacity-60"
                >
                  {savingNewRoutes ? 'Adding...' : 'Finish route'}
                </button>
              )}
            </div>
          )}

          {!isEditExistingMode && currentPoints.length < 2 && completedRoutes.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const normalizedRoutes = getNormalizedCompletedRoutes()
                  if (onSubmitRoutes) {
                    onSubmitRoutes(normalizedRoutes)
                    return
                  }
                  window.dispatchEvent(new CustomEvent('submit-routes'))
                }}
                disabled={!allRoutesValid}
                className="flex-1 px-2 py-2 bg-blue-600 text-white text-sm disabled:opacity-60"
              >
                Publish {completedRoutes.length} Route{completedRoutes.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {isEditExistingMode && showEditSaveButton && (
            <button
              onClick={onSaveEdits}
              disabled={!onSaveEdits || savingEdits}
              className="w-full px-2 py-2 bg-blue-600 text-white text-sm disabled:opacity-60"
            >
              {savingEdits ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

      {gradePickerOpen && !isEditingExistingRoute && (
        <GradePicker
          isOpen={gradePickerOpen}
          currentGrade={activeGrade}
          onSelect={(grade) => {
            if (selectedNewRoute) {
              updateSelectedNewRoute({ grade })
            } else if (isEditExistingMode && selectedExistingRoute) {
              updateSelectedExistingRoute({ grade })
            } else {
              setCurrentGrade(grade)
            }
            setGradePickerOpen(false)
          }}
          onClose={() => setGradePickerOpen(false)}
        />
      )}

      {!isEditExistingMode && showSubmitConfirm && (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
            <p className="text-lg font-medium mb-4 text-gray-900 dark:text-gray-100">
              Submit {completedRoutes.length} route{completedRoutes.length !== 1 ? 's' : ''}?
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Double-check you did not miss any.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-gray-100 hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSubmitConfirm(false)
                  const normalizedRoutes = getNormalizedCompletedRoutes()
                  if (onSubmitRoutes) {
                    onSubmitRoutes(normalizedRoutes)
                    return
                  }
                  window.dispatchEvent(new CustomEvent('submit-routes'))
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
