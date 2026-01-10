'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import CragSelector from '../../components/CragSelector'

interface RoutePoint {
  x: number
  y: number
}

interface RouteWithLabels {
  points: RoutePoint[]
  grade: string
  name: string
}

interface RouteData {
  imageUrl: string
  latitude: number
  longitude: number
  routes: RouteWithLabels[]
  sessionId: string
  captureDate: string | null
}

interface RouteForm {
  name: string
  grade: string
  description: string
}

export default function NameRoutesForm({ sessionId }: { sessionId: string }) {
  const [routeData, setRouteData] = useState<RouteData | null>(null)
  const [forms, setForms] = useState<RouteForm[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [selectedCrag, setSelectedCrag] = useState<{ id: string; name: string } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const data = localStorage.getItem('routeSession')
    if (data) {
      const parsed = JSON.parse(data) as RouteData
      setRouteData(parsed)
      setForms(parsed.routes.map(route => ({
        name: route.name || '',
        grade: route.grade || 'V0',
        description: ''
      })))
    }
  }, [sessionId])

  const drawRoutesOnCanvas = useCallback(() => {
    if (!routeData || !canvasRef.current || !imageRef.current) return

    const canvas = canvasRef.current
    const image = imageRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match displayed image size
    canvas.width = image.clientWidth
    canvas.height = image.clientHeight

    // Calculate scale factors from natural to displayed size
    const scaleX = canvas.width / image.naturalWidth
    const scaleY = canvas.height / image.naturalHeight

    // Draw routes with labels, scaled to display size
    routeData.routes.forEach(route => {
      drawRouteWithLabels(ctx, route, scaleX, scaleY)
    })
  }, [routeData])

  const drawRouteWithLabels = (ctx: CanvasRenderingContext2D, route: RouteWithLabels, scaleX = 1, scaleY = 1) => {
    const { points, grade, name } = route

    // Scale points to display size
    const scaledPoints = points.map(point => ({
      x: point.x * scaleX,
      y: point.y * scaleY
    }))

    // Draw dotted route line
    drawCurve(ctx, scaledPoints, 'red', 3, [8, 4])

    if (scaledPoints.length > 1) {
      // Calculate midpoint for grade
      const midIndex = Math.floor(scaledPoints.length / 2)
      const gradePoint = scaledPoints[midIndex]

      // Draw grade label with red background
      ctx.font = 'bold 14px Arial'
      const gradeWidth = ctx.measureText(grade).width
      const gradeHeight = 16 // Approximate text height
      const gradePadding = 2

      // Draw red background - center on the text position
      ctx.fillStyle = 'red'
      ctx.fillRect(
        gradePoint.x - gradeWidth/2 - gradePadding,
        gradePoint.y - gradeHeight/2 - 2, // Center vertically on text
        gradeWidth + gradePadding * 2,
        gradeHeight
      )

      // Draw white text
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.fillText(grade, gradePoint.x, gradePoint.y + 4) // Adjust baseline

      // Calculate end point for name (bottom of climb)
      const lastPoint = scaledPoints[scaledPoints.length - 1]
      const nameX = lastPoint.x + 15 // Position to the right of endpoint
      const nameY = lastPoint.y + 5

      // Draw name label with red background
      ctx.font = '12px Arial'
      const nameWidth = ctx.measureText(name).width
      const nameHeight = 14 // Approximate text height
      const namePadding = 2

      // Draw red background - position properly around text
      ctx.fillStyle = 'red'
      ctx.fillRect(
        nameX - namePadding,
        nameY - nameHeight + 3, // Adjust to properly contain text
        nameWidth + namePadding * 2,
        nameHeight
      )

      // Draw white text
      ctx.fillStyle = 'white'
      ctx.textAlign = 'left'
      ctx.fillText(name, nameX, nameY)
    }
  }

  const drawCurve = (ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, dash?: number[]) => {
    if (points.length < 2) return

    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (dash) ctx.setLineDash(dash)
    else ctx.setLineDash([])

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y) // Use straight lines
    }

    ctx.stroke()
    ctx.setLineDash([])
  }

  useEffect(() => {
    if (routeData) {
      // Small delay to ensure image is loaded
      const timer = setTimeout(() => {
        drawRoutesOnCanvas()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [routeData, drawRoutesOnCanvas])

  const handleImageLoad = () => {
    drawRoutesOnCanvas()
  }

  const handleFormChange = (index: number, field: keyof RouteForm, value: string) => {
    setForms(prev => prev.map((form, i) => i === index ? { ...form, [field]: value } : form))
  }

  const handleSubmit = async () => {
    if (!routeData || forms.some(form => !form.name)) {
      alert('Please fill in names for all routes')
      return
    }

    if (!selectedCrag) {
      alert('Please select or create a crag')
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error('Not authenticated')

      // Step 1: Create image record
      const { data: image, error: imageError } = await supabase
        .from('images')
        .insert({
          url: routeData.imageUrl,
          latitude: routeData.latitude,
          longitude: routeData.longitude,
          capture_date: routeData.captureDate,
          crag_id: selectedCrag.id,
          created_by: user.id
        })
        .select()
        .single()

      if (imageError) throw imageError

      // Step 2: Create climb records
      const climbsData = forms.map(form => ({
        name: form.name,
        grade: form.grade,
        description: form.description || null,
        route_type: 'sport',
        status: 'pending',
        user_id: user.id
      }))

      const { data: climbs, error: climbsError } = await supabase
        .from('climbs')
        .insert(climbsData)
        .select()

      if (climbsError) throw climbsError
      if (!climbs || climbs.length === 0) throw new Error('Failed to create climbs')

      // Step 3: Create route_lines records linking climbs to image
      const routeLinesData = routeData.routes.map((route, index) => ({
        image_id: image.id,
        climb_id: climbs[index].id,
        points: route.points,
        color: 'red',
        sequence_order: index
      }))

      const { error: routeLinesError } = await supabase
        .from('route_lines')
        .insert(routeLinesData)

      if (routeLinesError) throw routeLinesError

      // Clear session and redirect
      localStorage.removeItem('routeSession')
      alert('Routes submitted for approval!')
      window.location.href = '/'

    } catch (error) {
      console.error('Submit error:', error)
      alert('Failed to submit routes')
    } finally {
      setSubmitting(false)
    }
  }

  if (!routeData) {
    return <div className="text-gray-900 dark:text-gray-100">Loading route data...</div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900">
        <CragSelector
          latitude={routeData.latitude}
          longitude={routeData.longitude}
          onSelect={(crag) => setSelectedCrag({ id: crag.id, name: crag.name })}
          selectedCragId={selectedCrag?.id}
        />
      </div>

      <div className="mb-6 relative">
        <img
          ref={imageRef}
          src={routeData.imageUrl}
          alt="Routes"
          className="w-full h-auto rounded"
          onLoad={handleImageLoad}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-auto pointer-events-none"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
      {forms.map((form, index) => (
        <div key={index} className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Route {index + 1}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleFormChange(index, 'name', e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Grade</label>
              <select
                value={form.grade}
                onChange={(e) => handleFormChange(index, 'grade', e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {Array.from({ length: 18 }, (_, i) => `V${i}`).map(grade => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => handleFormChange(index, 'description', e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              rows={3}
            />
          </div>
        </div>
      ))}
      <button
        onClick={handleSubmit}
        disabled={submitting || forms.some(form => !form.name) || !selectedCrag}
        className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-6 rounded disabled:opacity-50 hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
      >
        {submitting ? 'Submitting...' : 'Submit for Approval'}
      </button>
    </div>
  )
}