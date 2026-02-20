'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import { VIDEO_PLATFORMS, type VideoPlatform, getVideoEmbedUrl, validateAndNormalizeVideoUrl } from '@/lib/video-beta'

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

function formatPlatformLabel(platform: string): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube'
    case 'instagram':
      return 'Instagram'
    case 'tiktok':
      return 'TikTok'
    case 'vimeo':
      return 'Vimeo'
    default:
      return 'Other'
  }
}

function isKnownPlatform(value: string): value is VideoPlatform {
  return VIDEO_PLATFORMS.includes(value as VideoPlatform)
}

export default function VideoBetaSection({ climbId }: VideoBetaSectionProps) {
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

  const preview = useMemo(() => validateAndNormalizeVideoUrl(url), [url])

  useEffect(() => {
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

        setItems(Array.isArray(payload.video_betas) ? payload.video_betas : [])
      } catch {
        setError('Failed to load beta links')
        setItems([])
      } finally {
        setLoadingItems(false)
      }
    }

    void loadVideoBetas()
  }, [climbId])

  const filteredItems = useMemo(() => {
    const minH = minHeight ? Number(minHeight) : null
    const maxH = maxHeight ? Number(maxHeight) : null
    const minR = minReach ? Number(minReach) : null
    const maxR = maxReach ? Number(maxReach) : null

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
  }, [genderFilter, items, maxHeight, maxReach, minHeight, minReach, platformFilter])

  const handleSave = async () => {
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

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
        >
          <option value="all">All Platforms</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="vimeo">Vimeo</option>
        </select>
        <select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value as GenderFilter)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
        >
          <option value="all">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min={100}
            max={250}
            value={minHeight}
            onChange={(e) => setMinHeight(e.target.value)}
            placeholder="Min height (cm)"
            aria-label="Minimum climber height in centimeters"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          />
          <input
            type="number"
            min={100}
            max={250}
            value={maxHeight}
            onChange={(e) => setMaxHeight(e.target.value)}
            placeholder="Max height (cm)"
            aria-label="Maximum climber height in centimeters"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
          <input
            type="number"
            min={100}
            max={260}
            value={minReach}
            onChange={(e) => setMinReach(e.target.value)}
            placeholder="Min reach (cm)"
            aria-label="Minimum climber reach in centimeters"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          />
          <input
            type="number"
            min={100}
            max={260}
            value={maxReach}
            onChange={(e) => setMaxReach(e.target.value)}
            placeholder="Max reach (cm)"
            aria-label="Maximum climber reach in centimeters"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Height and reach filters use centimeters from uploader profile stats. Min means at least this value and max means up to this value.
      </p>

      {loadingItems ? (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading beta videos...</p>
      ) : filteredItems.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">No beta videos match these filters yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {filteredItems.map((item) => {
            const platform = isKnownPlatform(item.platform) ? item.platform : 'other'
            const embedUrl = getVideoEmbedUrl(item.url, platform)
            const dateLabel = new Date(item.created_at).toLocaleDateString()

            return (
              <div key={item.id} className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                {embedUrl ? (
                  <div className="aspect-video bg-gray-100 dark:bg-gray-950">
                    <iframe
                      src={embedUrl}
                      title={item.title || 'Beta video'}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="p-5 bg-gray-50 dark:bg-gray-900">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">External beta video</p>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                    >
                      Watch on {formatPlatformLabel(platform)}
                    </a>
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatPlatformLabel(platform)}</span>
                    <span>•</span>
                    <span>{dateLabel}</span>
                    {item.uploader_gender && (
                      <>
                        <span>•</span>
                        <span>{item.uploader_gender.replaceAll('_', ' ')}</span>
                      </>
                    )}
                    {typeof item.uploader_height_cm === 'number' && (
                      <>
                        <span>•</span>
                        <span>{item.uploader_height_cm} cm</span>
                      </>
                    )}
                    {typeof item.uploader_reach_cm === 'number' && (
                      <>
                        <span>•</span>
                        <span>{item.uploader_reach_cm} cm reach</span>
                      </>
                    )}
                  </div>
                  {item.title && <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>}
                  {item.notes && <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{item.notes}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[2100] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Beta Link</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Paste a YouTube, Instagram, TikTok, or Vimeo link. Height/reach/gender are optional in Settings, but they make filters more useful.
            </p>

            <div className="mt-4 space-y-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional title"
                maxLength={120}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                rows={3}
                maxLength={400}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 resize-none"
              />

              {url.trim() && (
                <p className={`text-xs ${preview.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {preview.valid ? `Preview ready (${formatPlatformLabel(preview.platform || 'other')})` : preview.error}
                </p>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                You can update your height and reach in <Link href="/settings" className="underline">Settings</Link>. Leaving them empty is allowed.
              </p>
            </div>

            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setError(null)
                }}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-70 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {saving ? 'Saving...' : 'Save Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
