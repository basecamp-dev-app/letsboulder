
'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { SubmissionStep, Crag, ImageSelection, NewRouteData, SubmissionContext, GpsData } from '@/lib/submission-types'
import { trackRouteSubmitted } from '@/lib/posthog'
import { csrfFetch } from '@/hooks/useCsrf'

const dynamic = nextDynamic

const CragSelector = dynamic(() => import('./components/CragSelector'), { ssr: false })
const ImagePicker = dynamic(() => import('./components/ImagePicker'), { ssr: false })
const RouteCanvas = dynamic(() => import('./components/RouteCanvas'), { ssr: false })
const LocationPicker = dynamic(() => import('./components/LocationPicker'), { ssr: false })

function SubmitPageContent() {
  const [step, setStep] = useState<SubmissionStep>({ step: 'image' })
  const [context, setContext] = useState<SubmissionContext>({
    crag: null,
    image: null,
    imageGps: null,
    routes: []
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth?redirect_to=/submit')
        return
      }

      const pendingUpload = sessionStorage.getItem('pendingUpload')
      if (pendingUpload) {
        try {
          const data = JSON.parse(pendingUpload)
          sessionStorage.removeItem('pendingUpload')

          const newImageSelection: ImageSelection = {
            mode: 'new',
            file: new File([], 'uploaded.jpg'),
            gpsData: { latitude: data.latitude, longitude: data.longitude },
            captureDate: data.captureDate || null,
            width: 1200,
            height: 1200,
            naturalWidth: 1200,
            naturalHeight: 1200,
            uploadedUrl: data.imageUrl
          }

          const gps = { latitude: data.latitude, longitude: data.longitude }
          setContext(prev => ({ ...prev, image: newImageSelection, imageGps: gps }))
          setStep({
            step: 'crag',
            imageGps: gps
          })
        } catch (e) {
          sessionStorage.removeItem('pendingUpload')
        }
      }
    }
    checkAuth()
  }, [router])

  const handleImageSelect = useCallback((selection: ImageSelection, gpsData: GpsData | null) => {
    const gps = gpsData ? { latitude: gpsData.latitude, longitude: gpsData.longitude } : null
    setContext(prev => ({ ...prev, image: selection, imageGps: gps }))

    setStep({
      step: 'location',
      imageGps: gps
    })
  }, [])

  const handleLocationConfirm = useCallback((gps: GpsData) => {
    setContext(prev => ({ ...prev, imageGps: gps }))
    setStep({
      step: 'crag',
      imageGps: gps
    })
  }, [])

  const handleCragSelect = useCallback((crag: Crag) => {
    setContext(prev => ({
      ...prev,
      crag: { id: crag.id, name: crag.name, latitude: crag.latitude, longitude: crag.longitude }
    }))
    setStep({
      step: 'draw',
      imageGps: context.imageGps,
      cragId: crag.id,
      cragName: crag.name,
      image: context.image!
    })
  }, [context.imageGps, context.image])

  const handleRoutesUpdate = useCallback((routes: NewRouteData[]) => {
    setContext(prev => ({ ...prev, routes }))
  }, [])

  const handleBack = useCallback(() => {
    setError(null)
    switch (step.step) {
      case 'image':
        setStep({ step: 'image' })
        break
      case 'location':
        setStep({ step: 'image' })
        break
      case 'crag':
        setStep({ step: 'location', imageGps: context.imageGps })
        break
      case 'draw':
        setStep({
          step: 'crag',
          imageGps: context.imageGps,
          cragId: context.crag?.id,
          cragName: context.crag?.name
        })
        break
    }
  }, [step, context])

  const handleSubmit = async () => {
    if (!context.crag || !context.image || context.routes.length === 0) {
      setError('Incomplete submission data')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Please log in to submit routes')
        setSubmitting(false)
        return
      }

      const payload = context.image.mode === 'new' ? {
        mode: 'new' as const,
        imageUrl: context.image.uploadedUrl,
        imageLat: context.image.gpsData?.latitude ?? null,
        imageLng: context.image.gpsData?.longitude ?? null,
        captureDate: context.image.captureDate,
        width: context.image.width,
        height: context.image.height,
        naturalWidth: context.image.naturalWidth,
        naturalHeight: context.image.naturalHeight,
        cragId: context.crag?.id || ('cragId' in step ? (step as { cragId?: string }).cragId : undefined),
        routes: context.routes
      } : {
        mode: 'existing' as const,
        imageId: context.image.imageId,
        routes: context.routes
      }

      if (context.image.mode === 'new' && !payload.cragId) {
        setError('Please select a crag before submitting')
        setSubmitting(false)
        return
      }

      const response = await csrfFetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Submission failed')
      }

      const data = await response.json()

      trackRouteSubmitted(data.climbsCreated)

      setStep({
        step: 'success',
        climbsCreated: data.climbsCreated,
        imageId: data.imageId
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
      setSubmitting(false)
    }
  }

  const handleStartOver = () => {
    setContext({ crag: null, image: null, imageGps: null, routes: [] })
    setStep({ step: 'image' })
    setError(null)
  }

  const renderStep = () => {
    switch (step.step) {
      case 'image':
        return (
          <div className="max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Upload Route Photo</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Upload a photo of the route to begin. GPS location will be extracted to help find nearby crags.
            </p>
            <ImagePicker
              onSelect={(selection, gpsData) => handleImageSelect(selection, gpsData)}
              showBackButton={false}
            />
          </div>
        )

      case 'location':
        const locationStep = step as { imageGps: { latitude: number; longitude: number } | null }
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to image
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Set Route Location</h2>
            <LocationPicker
              initialGps={locationStep.imageGps}
              onConfirm={handleLocationConfirm}
            />
          </div>
        )

      case 'crag':
        const cragStep = step as { cragId?: string; cragName?: string }
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to location
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Select a Crag</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select or create a crag near your image location.
            </p>
            <CragSelector
              latitude={context.imageGps?.latitude ?? null}
              longitude={context.imageGps?.longitude ?? null}
              onSelect={handleCragSelect}
              selectedCragId={cragStep.cragId}
            />
          </div>
        )

      case 'draw':
        return (
          <div className="h-[calc(100dvh-5rem)] md:h-[calc(100vh-64px)]">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handleBack}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 flex items-center gap-1"
              >
                ← Back to crag
              </button>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Draw Your Routes</h2>
              <div className="w-20" />
            </div>
            <div className="h-[calc(100%-48px)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <RouteCanvas
                imageSelection={step.image}
                onRoutesUpdate={handleRoutesUpdate}
              />
            </div>
            {context.routes.length > 0 && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Routes'}
              </button>
            )}
          </div>
        )

      case 'success':
        return (
          <div className="max-w-md mx-auto text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Routes Submitted!</h2>
              <p className="text-gray-600 dark:text-gray-400">
                {step.climbsCreated} route{step.climbsCreated !== 1 ? 's' : ''} visible on map. After 3 community verifications, they&apos;ll be marked as verified.
              </p>
            </div>

            <button
              onClick={handleStartOver}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors mb-4"
            >
              Submit More Routes
            </button>

            {step.imageId && (
              <Link
                href={`/image/${step.imageId}`}
                className="block w-full bg-gray-800 text-white py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors mb-4"
              >
                View Routes on Image →
              </Link>
            )}

            <Link
              href="/map"
              className="block text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              ← Back to Map
            </Link>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {renderStep()}
      </main>
    </div>
  )
}

export default function SubmitPage() {
  return <SubmitPageContent />
}
