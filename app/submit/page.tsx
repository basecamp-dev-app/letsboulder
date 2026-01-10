'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { SubmissionStep, Region, Crag, ImageSelection, NewRouteData, SubmissionContext } from '@/lib/submission-types'
import RegionSelector from './components/RegionSelector'
import CragSelector from './components/CragSelector'
import ImagePicker from './components/ImagePicker'
import RouteCanvas from './components/RouteCanvas'

export default function SubmitPage() {
  const [step, setStep] = useState<SubmissionStep>({ step: 'region' })
  const [context, setContext] = useState<SubmissionContext>({
    region: null,
    crag: null,
    image: null,
    routes: []
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRegionSelect = useCallback((region: Region) => {
    setContext(prev => ({ ...prev, region: { id: region.id, name: region.name } }))
    setStep({ step: 'crag', regionId: region.id, regionName: region.name })
  }, [])

  const handleCragSelect = useCallback((crag: Crag) => {
    setContext(prev => ({ 
      ...prev, 
      crag: { id: crag.id, name: crag.name, latitude: crag.latitude, longitude: crag.longitude }
    }))
    setStep({ 
      step: 'image', 
      regionId: context.region!.id, 
      regionName: context.region!.name,
      cragId: crag.id, 
      cragName: crag.name 
    })
  }, [context.region])

  const handleImageSelect = useCallback((selection: ImageSelection) => {
    setContext(prev => ({ ...prev, image: selection }))
    setStep({
      step: 'draw',
      regionId: context.region!.id,
      regionName: context.region!.name,
      cragId: context.crag!.id,
      cragName: context.crag!.name,
      image: selection
    })
  }, [context.region, context.crag])

  const handleRoutesUpdate = useCallback((routes: NewRouteData[]) => {
    setContext(prev => ({ ...prev, routes }))
  }, [])

  const handleContinueToReview = useCallback(() => {
    if (context.routes.length === 0) {
      setError('Please draw at least one route before continuing')
      return
    }
    setError(null)
    setStep({
      step: 'review',
      regionId: context.region!.id,
      regionName: context.region!.name,
      cragId: context.crag!.id,
      cragName: context.crag!.name,
      image: context.image!,
      routes: context.routes
    })
  }, [context])

  const handleSubmit = async () => {
    if (!context.region || !context.crag || !context.image || context.routes.length === 0) {
      setError('Incomplete submission data')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
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
        cragId: context.crag.id,
        routes: context.routes.map((r, i) => ({
          name: r.name,
          grade: r.grade,
          description: r.description,
          points: r.points,
          sequenceOrder: i
        }))
      } : {
        mode: 'existing' as const,
        imageId: context.image.imageId,
        routes: context.routes.map((r, i) => ({
          name: r.name,
          grade: r.grade,
          description: r.description,
          points: r.points,
          sequenceOrder: i
        }))
      }

      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Submission failed')
      }

      setStep({ step: 'success', climbsCreated: result.climbsCreated })
    } catch (err) {
      console.error('Submission error:', err)
      setError(err instanceof Error ? err.message : 'Failed to submit routes')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    setError(null)
    if (step.step === 'crag') {
      setStep({ step: 'region' })
    } else if (step.step === 'image') {
      setStep({ step: 'crag', regionId: context.region!.id, regionName: context.region!.name })
    } else if (step.step === 'draw') {
      setStep({ 
        step: 'image', 
        regionId: context.region!.id, 
        regionName: context.region!.name,
        cragId: context.crag!.id, 
        cragName: context.crag!.name 
      })
    } else if (step.step === 'review') {
      setStep({
        step: 'draw',
        regionId: context.region!.id,
        regionName: context.region!.name,
        cragId: context.crag!.id,
        cragName: context.crag!.name,
        image: context.image!
      })
    }
  }

  const handleStartOver = () => {
    setContext({ region: null, crag: null, image: null, routes: [] })
    setStep({ step: 'region' })
    setError(null)
  }

  const renderStep = () => {
    switch (step.step) {
      case 'region':
        return (
          <div className="max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Select a Region</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Start by selecting the region where your climb is located.
            </p>
            <RegionSelector onSelect={handleRegionSelect} />
          </div>
        )

      case 'crag':
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to region
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Select a Crag</h2>
            <CragSelector
              region={{ id: step.regionId, name: step.regionName, country_code: null, center_lat: null, center_lon: null, created_at: '' }}
              latitude={0}
              longitude={0}
              onSelect={handleCragSelect}
            />
          </div>
        )

      case 'image':
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to crag
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Select an Image</h2>
            <ImagePicker
              cragId={step.cragId}
              cragName={step.cragName}
              onSelect={handleImageSelect}
            />
          </div>
        )

      case 'draw':
        return (
          <div className="h-[calc(100vh-200px)]">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to image
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Draw Your Routes</h2>
            <div className="h-[calc(100%-80px)]">
              <RouteCanvas
                imageSelection={step.image}
                onRoutesUpdate={handleRoutesUpdate}
              />
            </div>
            {context.routes.length > 0 && (
              <button
                onClick={handleContinueToReview}
                className="mt-2 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Review ({context.routes.length}) →
              </button>
            )}
          </div>
        )

      case 'review':
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to drawing
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Review Submission</h2>
            
            <div className="space-y-4 mb-6">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-sm text-gray-500 dark:text-gray-400">Region</div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{step.regionName}</div>
              </div>
              
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-sm text-gray-500 dark:text-gray-400">Crag</div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{step.cragName}</div>
              </div>
              
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-sm text-gray-500 dark:text-gray-400">Routes ({step.routes.length})</div>
                {step.routes.map((route, i) => (
                  <div key={route.id} className="mt-2 flex items-center gap-2">
                    <span className="w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{route.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">({route.grade})</span>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        )

      case 'success':
        return (
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Submission Received!</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Your {step.climbsCreated} route{step.climbsCreated !== 1 ? 's' : ''} ha{step.climbsCreated === 1 ? 's' : 've'} been submitted for approval.
              You&apos;ll receive an email once they&apos;re reviewed.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleStartOver}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Submit More
              </button>
              <Link
                href="/"
                className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Go Home
              </Link>
            </div>
          </div>
        )

      case 'error':
        return (
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Submission Failed</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{step.message}</p>
            <button
              onClick={handleBack}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Submit Routes</h1>
        </div>
      </header>
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        {renderStep()}
      </main>
    </div>
  )
}
