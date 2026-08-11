'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { csrfFetch } from '@/hooks/useCsrf'
import { getLengthInputBounds, getLengthInputLabel, parseLengthInputToCm, type MeasurementUnits } from '@/lib/measurement-units'
import { fetchSettings, settingsQueryKey } from '@/features/settings/public'
import { VIDEO_PLATFORMS, type VideoPlatform, validateAndNormalizeVideoUrl } from '@/lib/video-beta'
import { AddVideoBetaDialog, VideoBetaFilterBar, VideoBetaList } from '@/features/climb/components/video-beta-sections'
import { useOpenDataConsent } from '@/features/legal/public-client'

interface VideoBetaItem {
  id: string
  climb_id: string
  user_id: string
  url: string
  platform: string
  title: string | null
  notes: string | null
  uploader_gender: string | null
  uploader_height_cm: number | null
  uploader_reach_cm: number | null
  created_at: string
  is_owner: boolean
}

interface VideoBetaSectionProps {
  climbId: string
}

type PlatformFilter = VideoPlatform | 'all'
type GenderFilter = 'all' | 'male' | 'female' | 'other' | 'prefer_not_to_say'

function isKnownPlatform(value: string): value is VideoPlatform {
  return VIDEO_PLATFORMS.includes(value as VideoPlatform)
}

export default function VideoBetaSection({ climbId }: VideoBetaSectionProps) {
  const { requireConsent } = useOpenDataConsent()
  const [items, setItems] = useState<VideoBetaItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all')
  const [minHeight, setMinHeight] = useState('')
  const [maxHeight, setMaxHeight] = useState('')
  const [minReach, setMinReach] = useState('')
  const [maxReach, setMaxReach] = useState('')
  const [heightOpen, setHeightOpen] = useState(false)
  const [reachOpen, setReachOpen] = useState(false)

  const heightDropdownRef = useRef<HTMLDivElement>(null)
  const reachDropdownRef = useRef<HTMLDivElement>(null)

  const cachedBetasRef = useRef<Record<string, VideoBetaItem[]>>({})
  const { data: settingsData } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchSettings,
  })

  const units = (settingsData?.settings.units || 'metric') as MeasurementUnits
  const heightBounds = getLengthInputBounds(units, 100, 250)
  const reachBounds = getLengthInputBounds(units, 100, 260)
  const lengthInputLabel = getLengthInputLabel(units)

  const preview = useMemo(() => validateAndNormalizeVideoUrl(url), [url])

  useEffect(() => {
    if (cachedBetasRef.current[climbId]) {
      setItems(cachedBetasRef.current[climbId])
      setLoadingItems(false)
      return
    }

    const loadVideoBetas = async () => {
      setLoadingItems(true)
      setError(null)

      try {
        const response = await fetch(`/api/climbs/${climbId}/video-betas`, {
          method: 'GET',
          credentials: 'include',
        })

        const payload = await response.json().catch(() => ({} as { error?: string; video_betas?: VideoBetaItem[] }))

        if (!response.ok) {
          setError(payload.error || 'Failed to load beta links')
          setItems([])
          return
        }

        const data = Array.isArray(payload.video_betas) ? payload.video_betas : []
        cachedBetasRef.current[climbId] = data
        setItems(data)
      } catch {
        setError('Failed to load beta links')
        setItems([])
      } finally {
        setLoadingItems(false)
      }
    }

    void loadVideoBetas()
  }, [climbId])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node

      if (heightDropdownRef.current && !heightDropdownRef.current.contains(target)) {
        setHeightOpen(false)
      }

      if (reachDropdownRef.current && !reachDropdownRef.current.contains(target)) {
        setReachOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHeightOpen(false)
        setReachOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const filteredItems = useMemo(() => {
    const minH = parseLengthInputToCm(minHeight, units)
    const maxH = parseLengthInputToCm(maxHeight, units)
    const minR = parseLengthInputToCm(minReach, units)
    const maxR = parseLengthInputToCm(maxReach, units)

    return items.filter((item) => {
      if (platformFilter !== 'all' && item.platform !== platformFilter) return false
      if (genderFilter !== 'all' && item.uploader_gender !== genderFilter) return false

      if (minH !== null) {
        if (item.uploader_height_cm === null || item.uploader_height_cm < minH) return false
      }
      if (maxH !== null) {
        if (item.uploader_height_cm === null || item.uploader_height_cm > maxH) return false
      }

      if (minR !== null) {
        if (item.uploader_reach_cm === null || item.uploader_reach_cm < minR) return false
      }
      if (maxR !== null) {
        if (item.uploader_reach_cm === null || item.uploader_reach_cm > maxR) return false
      }

      return true
    })
  }, [genderFilter, items, maxHeight, maxReach, minHeight, minReach, platformFilter, units])

  const saveVideoBeta = async () => {
    setError(null)

    if (!preview.valid || !preview.url || !preview.platform) {
      setError(preview.error || 'Please enter a valid link')
      return
    }

    setSaving(true)
    try {
      const response = await csrfFetch(`/api/climbs/${climbId}/video-betas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: preview.url,
          title,
          notes,
        }),
      })

      const payload = await response.json().catch(() => ({} as { error?: string; video_beta?: VideoBetaItem }))

      if (!response.ok) {
        setError(payload.error || 'Failed to save link')
        return
      }

      if (payload.video_beta) {
        setItems((prev) => [payload.video_beta, ...prev])
      }

      setUrl('')
      setTitle('')
      setNotes('')
      setOpen(false)
    } catch {
      setError('Failed to save link')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    void requireConsent(saveVideoBeta)
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Video Beta</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {items.length} link{items.length === 1 ? '' : 's'} shared by the community.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
        >
          Add Beta Link
        </button>
      </div>

      <VideoBetaFilterBar
        platformFilter={platformFilter}
        genderFilter={genderFilter}
        minHeight={minHeight}
        maxHeight={maxHeight}
        minReach={minReach}
        maxReach={maxReach}
        lengthInputLabel={lengthInputLabel}
        heightBounds={heightBounds}
        reachBounds={reachBounds}
        units={units}
        heightDropdownRef={heightDropdownRef}
        reachDropdownRef={reachDropdownRef}
        heightOpen={heightOpen}
        reachOpen={reachOpen}
        setPlatformFilter={(value) => setPlatformFilter(value as PlatformFilter)}
        setGenderFilter={(value) => setGenderFilter(value as GenderFilter)}
        setMinHeight={setMinHeight}
        setMaxHeight={setMaxHeight}
        setMinReach={setMinReach}
        setMaxReach={setMaxReach}
        setHeightOpen={setHeightOpen}
        setReachOpen={setReachOpen}
        onClear={() => {
          setPlatformFilter('all')
          setGenderFilter('all')
          setMinHeight('')
          setMaxHeight('')
          setMinReach('')
          setMaxReach('')
          setHeightOpen(false)
          setReachOpen(false)
        }}
      />

      <VideoBetaList loadingItems={loadingItems} filteredItems={filteredItems} units={units} isKnownPlatform={isKnownPlatform} />

      <AddVideoBetaDialog
        open={open}
        url={url}
        title={title}
        notes={notes}
        preview={preview}
        saving={saving}
        error={error}
        setUrl={setUrl}
        setTitle={setTitle}
        setNotes={setNotes}
        onClose={() => {
          setOpen(false)
          setError(null)
        }}
        onSave={handleSave}
      />
    </div>
  )
}
