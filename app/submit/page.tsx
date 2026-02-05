
'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { SubmissionStep, Crag, ImageSelection, NewRouteData, SubmissionContext, GpsData, ClimbType } from '@/lib/submission-types'
import { csrfFetch } from '@/hooks/useCsrf'
import { useSubmitContext } from '@/lib/submit-context'

const dynamic = nextDynamic

const CragSelector = dynamic(() => import('./components/CragSelector'), { ssr: false })
const ImagePicker = dynamic(() => import('./components/ImagePicker'), { ssr: false })
const RouteCanvas = dynamic(() => import('./components/RouteCanvas'), { ssr: false })
const LocationPicker = dynamic(() => import('./components/LocationPicker'), { ssr: false })

function SubmitPageContent() {
  const { routes, setRoutes, setIsSubmitting, isSubmitting } = useSubmitContext()
  const [step, setStep] = useState<SubmissionStep>({ step: 'image' })
  const [selectedRouteType, setSelectedRouteType] = useState<ClimbType | null>(null)
  const [context, setContext] = useState<SubmissionContext>({
    crag: null,
    image: null,
    imageGps: null,
    routes: [],
    routeType: null
  })
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

  useEffect(() => {
    setRoutes(context.routes)
  }, [context.routes, setRoutes])

  useEffect(() => {
    const handleSubmitRoutes = () => {
      if (routes.length > 0 && !isSubmitting) {
        handleSubmit()
      }
    }
    window.addEventListener('submit-routes', handleSubmitRoutes)
    return () => window.removeEventListener('submit-routes', handleSubmitRoutes)
  }, [routes.length, isSubmitting])

  useEffect(() => {
    const handleOpenClimbType = () => {
      if (step.step === 'draw') {
        setStep({
          step: 'climbType',
          imageGps: step.imageGps,
          cragId: step.cragId,
          cragName: step.cragName,
          image: step.image
        })
      }
    }
    window.addEventListener('open-climb-type', handleOpenClimbType)
    return () => window.removeEventListener('open-climb-type', handleOpenClimbType)
  }, [step])

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

  const handleClimbTypeSelect = useCallback((routeType: ClimbType) => {
    if (isSubmitting) return
    setSelectedRouteType(routeType)
    setContext(prev => ({ ...prev, routeType }))
    handleSubmit(routeType)
  }, [context.image, context.crag, context.routes, isSubmitting])

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
      case 'climbType':
        if (context.crag && context.image) {
          setStep({
            step: 'draw',
            imageGps: context.imageGps,
            cragId: context.crag.id,
            cragName: context.crag.name,
            image: context.image
          })
        }
        break
    }
  }, [step, context])

  const handleSubmit = async (routeType?: ClimbType) => {
    if (isSubmitting) return
    if (!context.crag || !context.image || context.routes.length === 0) {
      setError('Incomplete submission data')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Please log in to submit routes')
        setIsSubmitting(false)
        return
      }

      const payload = context.image.mode === 'new' ? {
        mode: 'new' as const,
        imageUrl: context.image.uploadedUrl,
        imageLat: context.imageGps?.latitude ?? null,
        imageLng: context.imageGps?.longitude ?? null,
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
        setIsSubmitting(false)
        return
      }

      const response = await csrfFetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, routeType: routeType || 'sport' })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Submission failed')
      }

      const data = await response.json()

      setStep({
        step: 'success',
        climbsCreated: data.climbsCreated,
        imageId: data.imageId
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
      setIsSubmitting(false)
    }
  }

  const handleStartOver = () => {
    setContext({ crag: null, image: null, imageGps: null, routes: [], routeType: null })
    setSelectedRouteType(null)
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
          <div className="h-[calc(100dvh-5rem)] md:h-[calc(100vh-64px)] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={handleBack}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 flex items-center gap-1"
              >
                ← Back
              </button>
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Draw Routes</h2>
              <div className="w-16" />
            </div>
            <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <RouteCanvas
                imageSelection={step.image}
                onRoutesUpdate={handleRoutesUpdate}
              />
            </div>
            </div>
          )

        case 'climbType':
          return (
            <div className="max-w-md mx-auto">
              <button
                onClick={handleBack}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
              >
                ← Back
              </button>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Select Climb Type</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                What type of climbing are these routes?
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { type: 'sport' as const, label: 'Sport' },
                  { type: 'bouldering' as const, label: 'Bouldering' },
                  { type: 'trad' as const, label: 'Trad' },
                  { type: 'deep-water-solo' as const, label: 'Deep Water Solo' }
                ].map(({ type, label }) => (
                  <button
                    key={type}
                    onClick={() => handleClimbTypeSelect(type)}
                    disabled={isSubmitting}
                    className={`p-4 border border-gray-300 dark:border-gray-600 rounded-lg transition-colors capitalize text-gray-900 dark:text-gray-100 ${
                      isSubmitting
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-500 dark:hover:border-blue-500'
                    }`}
                  >
                    {isSubmitting && selectedRouteType === type ? 'Submitting...' : label}
                  </button>
                ))}
              </div>
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
