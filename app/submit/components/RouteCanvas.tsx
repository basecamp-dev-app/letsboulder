'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouteSelection, RoutePoint, generateRouteId, findRouteAtPoint } from '@/lib/useRouteSelection'
import { 
  drawSmoothCurve, 
  drawRoundedLabel,
  getTruncatedText,
  getGradeLabelPosition,
  getNameLabelPosition
} from '@/lib/canvas-utils'
import GradePicker from '@/components/GradePicker'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import type { ImageSelection, NewRouteData, RouteLine } from '@/lib/submission-types'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { draftStorageGetItem, draftStorageRemoveItem, draftStorageSetItem } from '@/lib/submit-draft-storage'

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DRAFT_WRITE_DEBOUNCE_MS = 750

interface ExistingRoute {
  id: string
  points: RoutePoint[]
  grade: string
  name: string
  description?: string
}

interface EditableExistingRoute {
  id: string
  name: string
  description?: string
  points: RoutePoint[]
}

interface RouteCanvasProps {
  imageSelection: ImageSelection
  onRoutesUpdate: (routes: NewRouteData[]) => void
  existingRouteLines?: RouteLine[]
  draftKey?: string
  mode?: 'submit' | 'edit-existing'
  allowCreateRoutesInEditMode?: boolean
  onEditRoutesUpdate?: (routes: EditableExistingRoute[]) => void
  onSaveEdits?: () => void
  savingEdits?: boolean
  onSaveNewRoutes?: (routes: NewRouteData[]) => void
  savingNewRoutes?: boolean
}

interface RouteCanvasDraft {
  updatedAt: number
  expiresAt: number
  completedRoutes: ExistingRoute[]
  currentPoints: RoutePoint[]
  currentName: string
  currentGrade: string
  currentDescription: string
}

function convertNormalizedPointsToCanvas(
  points: RoutePoint[],
  dims: { width: number; height: number; naturalWidth: number; naturalHeight: number }
): RoutePoint[] {
  if (points.length < 2) return points

  const maxX = Math.max(...points.map((p) => p.x))
  const maxY = Math.max(...points.map((p) => p.y))
  const seemsNormalized = maxX <= 1.2 && maxY <= 1.2
  if (!seemsNormalized) return points

  const canvasAspectRatio = dims.width / dims.height
  const imageAspectRatio = dims.naturalWidth / dims.naturalHeight

  let displayedImageWidth = dims.width
  let displayedImageHeight = dims.height
  let offsetX = 0
  let offsetY = 0

  if (canvasAspectRatio > imageAspectRatio) {
    displayedImageHeight = dims.height
    displayedImageWidth = displayedImageHeight * imageAspectRatio
    offsetX = (dims.width - displayedImageWidth) / 2
  } else {
    displayedImageWidth = dims.width
    displayedImageHeight = displayedImageWidth / imageAspectRatio
    offsetY = (dims.height - displayedImageHeight) / 2
  }

  return points.map((point) => ({
    x: offsetX + point.x * displayedImageWidth,
    y: offsetY + point.y * displayedImageHeight,
  }))
}

function readDraftState(draftKey?: string): RouteCanvasDraft | null {
  if (!draftKey) return null

  try {
    const rawDraft = draftStorageGetItem(draftKey)
    if (!rawDraft) return null

    const parsed = JSON.parse(rawDraft) as Partial<RouteCanvasDraft>
    const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0
    if (expiresAt > 0 && expiresAt < Date.now()) {
      draftStorageRemoveItem(draftKey)
      return null
    }

    return {
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : Date.now() + DRAFT_TTL_MS,
      completedRoutes: Array.isArray(parsed.completedRoutes) ? parsed.completedRoutes : [],
      currentPoints: Array.isArray(parsed.currentPoints) ? parsed.currentPoints : [],
      currentName: typeof parsed.currentName === 'string' ? parsed.currentName : '',
      currentGrade: typeof parsed.currentGrade === 'string' ? parsed.currentGrade : '6A',
      currentDescription: typeof parsed.currentDescription === 'string' ? parsed.currentDescription : '',
    }
  } catch {
    return null
  }
}

export default function RouteCanvas({
  imageSelection,
  onRoutesUpdate,
  existingRouteLines,
  draftKey,
  mode = 'submit',
  allowCreateRoutesInEditMode = false,
  onEditRoutesUpdate,
  onSaveEdits,
  savingEdits = false,
  onSaveNewRoutes,
  savingNewRoutes = false,
}: RouteCanvasProps) {
  const isEditExistingMode = mode === 'edit-existing'
  const canCreateRoutesInEditMode = isEditExistingMode && allowCreateRoutesInEditMode
  const initialDraft = readDraftState(draftKey)
  const gradeSystem = useGradeSystem()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const imageUrl = imageSelection.mode === 'existing' ? imageSelection.imageUrl : imageSelection.uploadedUrl

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>(() => initialDraft?.currentPoints ?? [])
  const [currentName, setCurrentName] = useState(() => initialDraft?.currentName ?? '')
  const [currentGrade, setCurrentGrade] = useState(() => initialDraft?.currentGrade ?? '6A')
  const [currentDescription, setCurrentDescription] = useState(() => initialDraft?.currentDescription ?? '')
  const [gradePickerOpen, setGradePickerOpen] = useState(false)
  const [completedRoutes, setCompletedRoutes] = useState<ExistingRoute[]>(() => initialDraft?.completedRoutes ?? [])
  const [existingRoutes, setExistingRoutes] = useState<ExistingRoute[]>(() => {
    if (existingRouteLines && existingRouteLines.length > 0) {
      return existingRouteLines.map((rl, index) => ({
        id: rl.id,
        points: rl.points,
        grade: rl.climb?.grade || '6A',
        name: rl.climb?.name || `Route ${index + 1}`,
        description: rl.climb?.description || undefined,
      }))
    }
    return []
  })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<{
    width: number
    height: number
    naturalWidth: number
    naturalHeight: number
  } | null>(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null)
  const draftWriteTimeoutRef = useRef<number | null>(null)

  const persistDraft = useCallback(() => {
    if (!draftKey) return

    const hasDraftContent =
      completedRoutes.length > 0 ||
      currentPoints.length > 0 ||
      currentName.trim().length > 0 ||
      currentDescription.trim().length > 0

    if (!hasDraftContent) {
      draftStorageRemoveItem(draftKey)
      return
    }

    const now = Date.now()
    const draft: RouteCanvasDraft = {
      updatedAt: now,
      expiresAt: now + DRAFT_TTL_MS,
      completedRoutes,
      currentPoints,
      currentName,
      currentGrade,
      currentDescription,
    }

    draftStorageSetItem(draftKey, JSON.stringify(draft))
  }, [draftKey, completedRoutes, currentPoints, currentName, currentGrade, currentDescription])

  useEffect(() => {
    if (!draftKey) return

    if (draftWriteTimeoutRef.current) {
      window.clearTimeout(draftWriteTimeoutRef.current)
    }

    draftWriteTimeoutRef.current = window.setTimeout(() => {
      persistDraft()
      draftWriteTimeoutRef.current = null
    }, DRAFT_WRITE_DEBOUNCE_MS)

    return () => {
      if (draftWriteTimeoutRef.current) {
        window.clearTimeout(draftWriteTimeoutRef.current)
        draftWriteTimeoutRef.current = null
      }
    }
  }, [draftKey, persistDraft])

  useEffect(() => {
    if (!draftKey) return

    const flushDraft = () => {
      if (draftWriteTimeoutRef.current) {
        window.clearTimeout(draftWriteTimeoutRef.current)
        draftWriteTimeoutRef.current = null
      }
      persistDraft()
    }

    window.addEventListener('pagehide', flushDraft)
    return () => {
      window.removeEventListener('pagehide', flushDraft)
      flushDraft()
    }
  }, [draftKey, persistDraft])

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

  const getTouchPos = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || e.touches.length === 0) return { x: 0, y: 0 }

    const touch = e.touches[0]
    const rect = canvas.getBoundingClientRect()

    return {
      x: (touch.clientX - rect.left) * zoom,
      y: (touch.clientY - rect.top) * zoom,
    }
  }, [zoom])

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
      x: (e.clientX - rect.left) * zoom,
      y: (e.clientY - rect.top) * zoom
    }
  }, [zoom])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (e.button === 0 && !e.altKey) {
      const pos = getMousePos(e)

      const dragHandleIndex = getDragHandleIndex(pos)
      if (dragHandleIndex !== null) {
        setDraggingPointIndex(dragHandleIndex)
        return
      }

      const allRoutes = [...existingRoutes, ...completedRoutes]
      const clickedRoute = findRouteAtPoint(allRoutes, pos, 20)

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
        setCurrentPoints([pos])
      } else {
        setCurrentPoints(prev => [...prev, pos])
      }
    }
  }, [getMousePos, getDragHandleIndex, isEditExistingMode, canCreateRoutesInEditMode, currentPoints, existingRoutes, completedRoutes, selectRoute, clearSelection])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const pos = getTouchPos(e)
    const dragHandleIndex = getDragHandleIndex(pos)
    if (dragHandleIndex !== null) {
      setDraggingPointIndex(dragHandleIndex)
      e.preventDefault()
    }
  }, [getDragHandleIndex, getTouchPos])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (draggingPointIndex !== null) {
      setDraggingPointIndex(null)
      return
    }

    const touch = e.changedTouches[0]
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const canvasX = (touch.clientX - rect.left) * zoom
    const canvasY = (touch.clientY - rect.top) * zoom

    const allRoutes = [...existingRoutes, ...completedRoutes]
    const clickedRoute = findRouteAtPoint(allRoutes, { x: canvasX, y: canvasY }, 20)

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
  }, [zoom, draggingPointIndex, isEditExistingMode, canCreateRoutesInEditMode, currentPoints, existingRoutes, completedRoutes, selectRoute, clearSelection])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
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
  }, [draggingPointIndex, editableRoute, getTouchPos, isEditExistingMode, selectedExistingRoute, updateSelectedExistingRoute, updateSelectedNewRoute])

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

    if ((!isEditExistingMode || canCreateRoutesInEditMode) && e.buttons === 1 && !e.altKey && currentPoints.length > 0) {
      const pos = getMousePos(e)
      const lastPoint = currentPoints[currentPoints.length - 1]
      const distance = Math.sqrt(
        Math.pow(pos.x - lastPoint.x, 2) + Math.pow(pos.y - lastPoint.y, 2)
      )

      if (distance > 10) {
        setCurrentPoints(prev => [...prev, pos])
      }
    }
  }, [draggingPointIndex, editableRoute, isEditExistingMode, canCreateRoutesInEditMode, selectedExistingRoute, updateSelectedExistingRoute, updateSelectedNewRoute, isPanning, lastPanPoint, getMousePos, currentPoints])

  const handleMouseUp = useCallback(() => {
    setDraggingPointIndex(null)
    setIsPanning(false)
  }, [])

  const handleCompleteRoute = useCallback(() => {
    if (currentPoints.length < 2) return

    const routeId = generateRouteId()
    const trimmedDescription = currentDescription.trim()
    const route: ExistingRoute = {
      id: routeId,
      points: currentPoints,
      name: currentName || `Route ${completedRoutes.length + 1}`,
      grade: currentGrade,
      description: trimmedDescription || undefined
    }

    setCompletedRoutes(prev => [...prev, route])
    setCurrentPoints([])
    setCurrentName('')
    setCurrentGrade('6A')
    setCurrentDescription('')
    selectRoute(routeId)
  }, [currentPoints, currentName, currentGrade, currentDescription, completedRoutes, selectRoute])

  const handleDeleteSelected = useCallback(() => {
    setCompletedRoutes(prev => prev.filter(route => !selectedIds.includes(route.id)))
    clearSelection()
  }, [selectedIds, clearSelection])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

    existingRoutes.forEach(route => {
      const isSelected = selectedIds.includes(route.id)
      const lineColor = isEditExistingMode ? (isSelected ? '#fbbf24' : '#ef4444') : (isSelected ? '#fbbf24' : '#9ca3af')
      const lineWidth = isEditExistingMode ? (isSelected ? 4 : 3) : (isSelected ? 3 : 2)

      ctx.shadowColor = isSelected ? '#fbbf24' : '#6b7280'
      ctx.shadowBlur = isSelected ? 8 : 2
      drawSmoothCurve(ctx, route.points, lineColor, lineWidth, isEditExistingMode ? [8, 4] : [4, 4])
      ctx.shadowBlur = 0

      if (route.points.length > 1 && isSelected) {
        const bgColor = 'rgba(251, 191, 36, 0.95)'
        const gradePos = getGradeLabelPosition(route.points)
        drawRoundedLabel(ctx, formatGradeForDisplay(route.grade, gradeSystem), gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

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

      if (isSelected) {
        ctx.shadowColor = '#fbbf24'
        ctx.shadowBlur = 10
        drawSmoothCurve(ctx, route.points, '#fbbf24', 4)
        ctx.shadowBlur = 0
      }

      drawSmoothCurve(ctx, route.points, '#dc2626', isSelected ? 4 : 3, [8, 4])

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
        drawRoundedLabel(ctx, formatGradeForDisplay(route.grade, gradeSystem), gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

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
        drawSmoothCurve(ctx, currentPoints, '#3b82f6', 2, [5, 5])
      }

      if (currentPoints.length > 1 && currentGrade && currentName) {
        drawSmoothCurve(ctx, currentPoints, '#3b82f6', 3, [8, 4])

        const gradePos = getGradeLabelPosition(currentPoints)
        drawRoundedLabel(ctx, formatGradeForDisplay(currentGrade, gradeSystem), gradePos.x, gradePos.y, 'rgba(59, 130, 246, 0.95)', 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, currentName, 150)
        const namePos = getNameLabelPosition(currentPoints)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, 'rgba(59, 130, 246, 0.95)', '12px Arial')
      }
    }

    ctx.restore()
  }, [completedRoutes, currentPoints, currentGrade, currentName, existingRoutes, selectedIds, pan, zoom, gradeSystem, isEditExistingMode])

  useEffect(() => {
    if (imageLoaded) {
      redraw()
    }
  }, [imageLoaded, redraw])

  const getDisplayedImageBounds = useCallback((dims: { width: number; height: number; naturalWidth: number; naturalHeight: number }) => {
    const canvasAspectRatio = dims.width / dims.height
    const imageAspectRatio = dims.naturalWidth / dims.naturalHeight

    let displayedImageWidth = dims.width
    let displayedImageHeight = dims.height
    let offsetX = 0
    let offsetY = 0

    if (canvasAspectRatio > imageAspectRatio) {
      displayedImageHeight = dims.height
      displayedImageWidth = displayedImageHeight * imageAspectRatio
      offsetX = (dims.width - displayedImageWidth) / 2
    } else {
      displayedImageWidth = dims.width
      displayedImageHeight = displayedImageWidth / imageAspectRatio
      offsetY = (dims.height - displayedImageHeight) / 2
    }

    return { displayedImageWidth, displayedImageHeight, offsetX, offsetY }
  }, [])

  const normalizeCanvasPoints = useCallback((points: RoutePoint[], dims: { width: number; height: number; naturalWidth: number; naturalHeight: number }) => {
    const bounds = getDisplayedImageBounds(dims)
    return points.map((point) => ({
      x: Math.min(1, Math.max(0, (point.x - bounds.offsetX) / bounds.displayedImageWidth)),
      y: Math.min(1, Math.max(0, (point.y - bounds.offsetY) / bounds.displayedImageHeight)),
    }))
  }, [getDisplayedImageBounds])

  useEffect(() => {
    const image = imageRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!image || !canvas || !container || !image.complete || !imageDimensions) return

    canvas.width = imageDimensions.width
    canvas.height = imageDimensions.height

    const normalizedRoutes = completedRoutes.map((route, index) => {
      return {
        id: route.id,
        name: route.name,
        grade: route.grade,
        description: route.description,
        points: normalizeCanvasPoints(route.points, imageDimensions),
        sequenceOrder: index,
        imageWidth: imageDimensions.naturalWidth,
        imageHeight: imageDimensions.naturalHeight,
        imageNaturalWidth: imageDimensions.naturalWidth,
        imageNaturalHeight: imageDimensions.naturalHeight
      }
    })

    onRoutesUpdate(normalizedRoutes)
    redraw()
  }, [completedRoutes, imageDimensions, normalizeCanvasPoints, onRoutesUpdate, redraw])

  useEffect(() => {
    if (!isEditExistingMode || !imageDimensions || !onEditRoutesUpdate) return

    onEditRoutesUpdate(existingRoutes.map((route) => ({
      id: route.id,
      name: route.name,
      description: route.description,
      points: normalizeCanvasPoints(route.points, imageDimensions),
    })))
  }, [isEditExistingMode, imageDimensions, existingRoutes, normalizeCanvasPoints, onEditRoutesUpdate])

  const handleAddNewRouteInEditMode = useCallback(() => {
    if (!canCreateRoutesInEditMode || !onSaveNewRoutes || !imageDimensions || currentPoints.length < 2) return

    const trimmedDescription = currentDescription.trim()
    const routeName = currentName.trim() || `Route ${existingRoutes.length + 1}`

    onSaveNewRoutes([{
      id: generateRouteId(),
      name: routeName,
      grade: currentGrade,
      description: trimmedDescription || undefined,
      points: normalizeCanvasPoints(currentPoints, imageDimensions),
      sequenceOrder: 0,
      imageWidth: imageDimensions.naturalWidth,
      imageHeight: imageDimensions.naturalHeight,
      imageNaturalWidth: imageDimensions.naturalWidth,
      imageNaturalHeight: imageDimensions.naturalHeight,
    }])

    setCurrentPoints([])
    setCurrentName('')
    setCurrentGrade('6A')
    setCurrentDescription('')
    clearSelection()
  }, [canCreateRoutesInEditMode, onSaveNewRoutes, imageDimensions, currentPoints, currentDescription, currentName, existingRoutes.length, currentGrade, normalizeCanvasPoints, clearSelection])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !image.complete) return

    const rect = image.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
    redraw()
  }, [redraw])

  useEffect(() => {
    setupCanvas()
  }, [setupCanvas])

  useEffect(() => {
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
  }, [setupCanvas])

  const activeName = editableRoute ? editableRoute.name : currentName
  const activeGrade = editableRoute ? editableRoute.grade : currentGrade
  const activeDescription = editableRoute ? (editableRoute.description || '') : currentDescription
  const isEditingExistingRoute = !isEditExistingMode && Boolean(selectedExistingRoute)
  const disableEditInputs = isEditExistingMode ? (!canCreateRoutesInEditMode && !selectedExistingRoute) : isEditingExistingRoute
  const disableGradePicker = disableEditInputs || (isEditExistingMode && Boolean(selectedExistingRoute))
  const routeCount = completedRoutes.length
  const nextRouteNumber = routeCount + 1

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <p className="text-xs font-medium text-gray-800 dark:text-gray-100">
          {isEditExistingMode
            ? (canCreateRoutesInEditMode
              ? 'Select an existing route to edit, or draw and save a new route as a new climb.'
              : 'Select a route, then adjust its line, name, and description.')
            : `Draw route ${nextRouteNumber}, press Save Route, then tap the image to draw route ${nextRouteNumber + 1}.`}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          {isEditExistingMode ? 'Routes loaded' : `Routes added: ${routeCount}`}
          {existingRoutes.length > 0 && ` • Existing on image: ${existingRoutes.length}`}
        </p>
        {!isEditExistingMode && completedRoutes.length > 0 && currentPoints.length < 2 && (
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Route saved. Tap the image to add another route, or select one to edit its line and details.
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1 bg-gray-100 dark:bg-gray-900 overflow-hidden rounded-lg" ref={containerRef}>
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Route"
            className={`absolute inset-0 w-full h-full object-contain ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => {
              const img = imageRef.current
              if (img) {
                const rect = img.getBoundingClientRect()
                const nextDims = {
                  width: rect.width,
                  height: rect.height,
                  naturalWidth: img.naturalWidth,
                  naturalHeight: img.naturalHeight,
                }
                setImageDimensions({
                  width: nextDims.width,
                  height: nextDims.height,
                  naturalWidth: nextDims.naturalWidth,
                  naturalHeight: nextDims.naturalHeight
                })

                if (isEditExistingMode) {
                  setExistingRoutes(prev => prev.map((route) => ({
                    ...route,
                    points: convertNormalizedPointsToCanvas(route.points, nextDims),
                  })))
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
              width: '100%',
              height: '100%',
              touchAction: currentPoints.length > 0 || draggingPointIndex !== null ? 'none' : 'pan-y',
              WebkitTapHighlightColor: 'transparent'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        </div>

        <div className="w-full md:w-72 shrink-0 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 overflow-y-auto">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {selectedNewRoute ? 'Edit Selected Route' : 'Route Details'}
          </p>

          {isEditingExistingRoute && (
            <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
              Existing routes are read-only. Select a new route you drew to edit name, grade, description, and points.
            </p>
          )}

          {isEditExistingMode && (
            <p className="mb-2 text-xs text-blue-700 dark:text-blue-300">
              Existing route grades stay community-controlled after submission.
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
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-2 disabled:opacity-60"
          />

          <div className="relative mb-2">
            <button
              onClick={() => !disableGradePicker && setGradePickerOpen(true)}
              disabled={disableGradePicker}
              className="w-full px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {formatGradeForDisplay(activeGrade, gradeSystem)}
            </button>
            {gradePickerOpen && !isEditingExistingRoute && !selectedExistingRoute && (
              <GradePicker
                isOpen={gradePickerOpen}
                currentGrade={activeGrade}
                onSelect={(grade) => {
                  if (selectedNewRoute) {
                    updateSelectedNewRoute({ grade })
                  } else {
                    setCurrentGrade(grade)
                  }
                  setGradePickerOpen(false)
                }}
                onClose={() => setGradePickerOpen(false)}
              />
            )}
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
            placeholder="Optional beta / gear / crux notes"
            maxLength={500}
            rows={4}
            disabled={disableEditInputs}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none mb-2 disabled:opacity-60"
          />

          {selectedNewRoute && (
            <button
              onClick={handleDeleteSelected}
              className="w-full mb-2 px-3 py-2 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
            >
              Delete Selected Route
            </button>
          )}

          {(currentPoints.length >= 2 && (!isEditExistingMode || canCreateRoutesInEditMode)) && (
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setCurrentPoints([])}
                className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              {!isEditExistingMode ? (
                <button
                  onClick={handleCompleteRoute}
                  className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Route
                </button>
              ) : (
                <button
                  onClick={handleAddNewRouteInEditMode}
                  disabled={!onSaveNewRoutes || savingNewRoutes}
                  className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {savingNewRoutes ? 'Adding...' : 'Add New Route'}
                </button>
              )}
            </div>
          )}

          {!isEditExistingMode && currentPoints.length < 2 && completedRoutes.length > 0 && (
            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Submit Routes
            </button>
          )}

          {isEditExistingMode && (
            <button
              onClick={onSaveEdits}
              disabled={!onSaveEdits || savingEdits}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {savingEdits ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

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
                  window.dispatchEvent(new CustomEvent('open-climb-type'))
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
