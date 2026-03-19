'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ImagePicker from '@/app/submit/components/ImagePicker'
import { CountrySelector } from '@/app/submit/components/CountrySelector'
import AtlasContextCard from '@/components/submissions/atlas-context-card'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { useAtlasAutoSync } from '@/hooks/use-atlas-auto-sync'
import { csrfFetch } from '@/hooks/useCsrf'
import type { Crag, GpsData, ImageSelection } from '@/lib/submission-types'

const AUTO_ASSIGN_CRAG_RADIUS_METERS = 150

interface DraftCreateResponse {
  draft?: {
    id: string
  }
  error?: string
}

interface UploadedImagePayload {
  uploadedBucket: string
  uploadedPath: string
  gpsData: GpsData | null
  captureDate: string | null
  width: number
  height: number
}

interface NearbyCragMatch extends Pick<Crag, 'id' | 'name'> {
  distance?: number | null
}

export default function DraftIntakeView() {
  const router = useRouter()
  const { toasts, addToast, removeToast } = useToast()
  const [selectedImages, setSelectedImages] = useState<UploadedImagePayload[]>([])
  const [selectedGps, setSelectedGps] = useState<GpsData | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [nearbyCragMatch, setNearbyCragMatch] = useState<NearbyCragMatch | null>(null)
  const [uploadsInFlight, setUploadsInFlight] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const atlasSync = useAtlasAutoSync(selectedGps?.latitude ?? null, selectedGps?.longitude ?? null)

  const canCreateDraft = selectedImages.length > 0 && !submitting && !uploadsInFlight

  const selectedLabel = useMemo(() => {
    if (selectedImages.length === 0) return uploadsInFlight ? 'Uploading photos...' : 'No photos uploaded yet'
    return `${selectedImages.length} photo${selectedImages.length === 1 ? '' : 's'} uploaded`
  }, [selectedImages.length, uploadsInFlight])

  const handleImageSelect = useCallback((selection: ImageSelection | null, gpsData: GpsData | null) => {
    if (!selection) {
      setSelectedImages([])
      setSelectedGps(null)
      setNearbyCragMatch(null)
      setError(null)
      return
    }

    if (selection.mode !== 'new') {
      setError('Only new uploads can be used for draft intake')
      return
    }

    const images = selection.images.map((image) => ({
      uploadedBucket: image.uploadedBucket,
      uploadedPath: image.uploadedPath,
      gpsData: image.gpsData,
      captureDate: image.captureDate,
      width: image.width,
      height: image.height,
    }))

    setSelectedImages(images)
    setSelectedGps(gpsData)
    setNearbyCragMatch(null)
    setError(null)
  }, [])

  const findNearbyCragMatch = useCallback(async (gps: GpsData | null) => {
    if (!gps) return null

    const params = new URLSearchParams({
      lat: gps.latitude.toString(),
      lng: gps.longitude.toString(),
    })
    const response = await fetch(`/api/crags/nearby?${params.toString()}`)
    if (!response.ok) return null

    const payload = await response.json().catch(() => [] as NearbyCragMatch[])
    if (!Array.isArray(payload) || payload.length === 0) return null

    const nearest = payload[0]
    if (!nearest || typeof nearest.id !== 'string' || typeof nearest.name !== 'string') return null
    if (typeof nearest.distance !== 'number' || nearest.distance > AUTO_ASSIGN_CRAG_RADIUS_METERS) return null

    return nearest
  }, [])

  useEffect(() => {
    if (atlasSync.atlas?.countryCode && selectedGps) {
      setSelectedCountry((current) => current || atlasSync.atlas?.countryCode || null)
    }
  }, [atlasSync.atlas?.countryCode, selectedGps])

  useEffect(() => {
    let cancelled = false

    async function loadNearbyCragMatch() {
      if (!selectedGps) {
        setNearbyCragMatch(null)
        return
      }

      const matchedCrag = await findNearbyCragMatch(selectedGps)
      if (!cancelled) {
        setNearbyCragMatch(matchedCrag)
      }
    }

    void loadNearbyCragMatch()

    return () => {
      cancelled = true
    }
  }, [findNearbyCragMatch, selectedGps])

  const createDraft = useCallback(async () => {
    if (!canCreateDraft) return

    // Validate country selection if GPS is present
    if (selectedGps && !selectedCountry) {
      setError('Please select a country for the GPS coordinates')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const matchedCrag = nearbyCragMatch ?? atlasSync.nearbyCrag ?? await findNearbyCragMatch(selectedGps)

      const response = await csrfFetch('/api/submissions/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cragId: matchedCrag?.id ?? null,
          images: selectedImages,
          metadata: {
            primaryIndex: 0,
            location: selectedGps ? {
              latitude: selectedGps.latitude,
              longitude: selectedGps.longitude,
              countryId: atlasSync.atlas?.countryId ?? null,
              countryCode: atlasSync.atlas?.countryCode ?? selectedCountry,
              countryName: atlasSync.atlas?.countryName ?? null,
              adminRegionName: atlasSync.atlas?.adminRegionName ?? null,
              unRegionName: atlasSync.atlas?.unRegionName ?? null,
              continentName: atlasSync.atlas?.continentName ?? null,
            } : null,
            intake: {
              source: '/submit',
              createdAt: new Date().toISOString(),
            },
          },
        }),
      })

      const payload = await response.json().catch(() => ({} as DraftCreateResponse))
      if (!response.ok || !payload.draft?.id) {
        throw new Error(payload.error || 'Failed to create draft')
      }

      const draftHref = `/logbook/drafts/${payload.draft.id}/edit`
      if (matchedCrag) {
        addToast(`Draft created with nearby crag: ${matchedCrag.name}`, 'success')
      } else {
        addToast('Draft created. Continue editing in Draft Editor.', 'success')
      }
      router.replace(draftHref)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create draft'
      setError(message)
      addToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }, [addToast, atlasSync.atlas, atlasSync.nearbyCrag, canCreateDraft, findNearbyCragMatch, nearbyCragMatch, router, selectedGps, selectedImages, selectedCountry])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4">
          <Link href="/logbook/submissions" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
            ← Back to submissions
          </Link>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Start a new draft.</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Upload your photos to begin. In the Draft Editor, you&apos;ll be able to review the suggested crag, draw routes on any photo, and publish when ready.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Upload all photos for a single crag together. Every photo preserves its original GPS location.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Upload photos</h2>
          <ImagePicker onSelect={handleImageSelect} onUploadingStateChange={setUploadsInFlight} />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{selectedLabel}</p>
          {selectedGps ? (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              GPS detected from your upload set. We&apos;ll use nearby photo locations to suggest a crag when possible.
            </p>
          ) : null}
          {nearbyCragMatch ? (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              Nearby crag ready to preselect: {nearbyCragMatch.name}
            </p>
          ) : null}
        </div>

        {selectedGps && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <AtlasContextCard result={atlasSync} />
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Select Country</h2>
            <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
              We auto-detect the administrative location from GPS. You can still confirm the country here if needed.
            </p>
            <div className="max-w-xs">
              <CountrySelector
                value={selectedCountry}
                onChange={setSelectedCountry}
                placeholder="Select country..."
              />
            </div>
            {selectedCountry && (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                Country selected: {selectedCountry}. GPS coordinates will be validated against {selectedCountry}&apos;s boundaries.
              </p>
            )}
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => { void createDraft() }}
            disabled={!canCreateDraft}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? 'Creating draft...' : uploadsInFlight ? 'Uploading photos...' : 'Create draft and continue'}
          </button>
          <Link
            href="/logbook/submissions"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
