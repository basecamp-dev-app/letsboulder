'use client'

import Link from 'next/link'
import { formatLengthFromCm, type MeasurementUnits } from '@/lib/measurement-units'
import { getVideoEmbedUrl, type VideoPlatform } from '@/lib/video-beta'

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

export function formatPlatformLabel(platform: string): string {
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

interface VideoBetaFilterBarProps {
  platformFilter: string
  genderFilter: string
  minHeight: string
  maxHeight: string
  minReach: string
  maxReach: string
  lengthInputLabel: string
  heightBounds: { min: number; max: number; step: number }
  reachBounds: { min: number; max: number; step: number }
  units: MeasurementUnits
  heightDropdownRef: React.RefObject<HTMLDivElement | null>
  reachDropdownRef: React.RefObject<HTMLDivElement | null>
  heightOpen: boolean
  reachOpen: boolean
  setPlatformFilter: (value: string) => void
  setGenderFilter: (value: string) => void
  setMinHeight: (value: string) => void
  setMaxHeight: (value: string) => void
  setMinReach: (value: string) => void
  setMaxReach: (value: string) => void
  setHeightOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  setReachOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  onClear: () => void
}

export function VideoBetaFilterBar(props: VideoBetaFilterBarProps) {
  const {
    platformFilter,
    genderFilter,
    minHeight,
    maxHeight,
    minReach,
    maxReach,
    lengthInputLabel,
    heightBounds,
    reachBounds,
    units,
    heightDropdownRef,
    reachDropdownRef,
    heightOpen,
    reachOpen,
    setPlatformFilter,
    setGenderFilter,
    setMinHeight,
    setMaxHeight,
    setMinReach,
    setMaxReach,
    setHeightOpen,
    setReachOpen,
    onClear,
  } = props

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <option value="all">All Platforms</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="vimeo">Vimeo</option>
        </select>
        <select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <option value="all">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
        <div ref={heightDropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setHeightOpen((prev) => !prev)
              setReachOpen(false)
            }}
            className="cursor-pointer whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            Filter by height{minHeight || maxHeight ? `: ${minHeight || '...'}-${maxHeight || '...'} ${lengthInputLabel}` : ''}
          </button>
          {heightOpen ? (
            <div className="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Filter by height ({lengthInputLabel})</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400" htmlFor="height-from">From</label>
                  <input
                    id="height-from"
                    type="number"
                    min={heightBounds.min}
                    max={heightBounds.max}
                    step={heightBounds.step}
                    value={minHeight}
                    onChange={(e) => setMinHeight(e.target.value)}
                    aria-label={`Height from in ${units === 'metric' ? 'centimeters' : 'inches'}`}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400" htmlFor="height-to">To</label>
                  <input
                    id="height-to"
                    type="number"
                    min={heightBounds.min}
                    max={heightBounds.max}
                    step={heightBounds.step}
                    value={maxHeight}
                    onChange={(e) => setMaxHeight(e.target.value)}
                    aria-label={`Height to in ${units === 'metric' ? 'centimeters' : 'inches'}`}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div ref={reachDropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setReachOpen((prev) => !prev)
              setHeightOpen(false)
            }}
            className="cursor-pointer whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            Filter by reach{minReach || maxReach ? `: ${minReach || '...'}-${maxReach || '...'} ${lengthInputLabel}` : ''}
          </button>
          {reachOpen ? (
            <div className="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Filter by reach ({lengthInputLabel})</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400" htmlFor="reach-from">From</label>
                  <input
                    id="reach-from"
                    type="number"
                    min={reachBounds.min}
                    max={reachBounds.max}
                    step={reachBounds.step}
                    value={minReach}
                    onChange={(e) => setMinReach(e.target.value)}
                    aria-label={`Reach from in ${units === 'metric' ? 'centimeters' : 'inches'}`}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400" htmlFor="reach-to">To</label>
                  <input
                    id="reach-to"
                    type="number"
                    min={reachBounds.min}
                    max={reachBounds.max}
                    step={reachBounds.step}
                    value={maxReach}
                    onChange={(e) => setMaxReach(e.target.value)}
                    aria-label={`Reach to in ${units === 'metric' ? 'centimeters' : 'inches'}`}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Clear filters
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Height and reach filters use uploader profile stats and match your current unit preference. Min means at least this value and max means up to this value.
      </p>
    </>
  )
}

interface VideoBetaListProps {
  loadingItems: boolean
  filteredItems: VideoBetaItem[]
  units: MeasurementUnits
  isKnownPlatform: (value: string) => value is VideoPlatform
}

export function VideoBetaList({ loadingItems, filteredItems, units, isKnownPlatform }: VideoBetaListProps) {
  if (loadingItems) {
    return <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading beta videos...</p>
  }

  if (filteredItems.length === 0) {
    return <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">No beta videos match these filters yet.</p>
  }

  return (
    <div className="mt-4 space-y-4">
      {filteredItems.map((item) => {
        const platform = isKnownPlatform(item.platform) ? item.platform : 'other'
        const embedUrl = getVideoEmbedUrl(item.url, platform)
        const dateLabel = new Date(item.created_at).toLocaleDateString()

        return (
          <div key={item.id} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
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
              <div className="bg-gray-50 p-5 dark:bg-gray-900">
                <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">External beta video</p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  Watch on {formatPlatformLabel(platform)}
                </a>
              </div>
            )}

            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{formatPlatformLabel(platform)}</span>
                <span>•</span>
                <span>{dateLabel}</span>
                {item.uploader_gender ? (
                  <>
                    <span>•</span>
                    <span>{item.uploader_gender.replaceAll('_', ' ')}</span>
                  </>
                ) : null}
                {typeof item.uploader_height_cm === 'number' ? (
                  <>
                    <span>•</span>
                    <span>{formatLengthFromCm(item.uploader_height_cm, units)}</span>
                  </>
                ) : null}
                {typeof item.uploader_reach_cm === 'number' ? (
                  <>
                    <span>•</span>
                    <span>{formatLengthFromCm(item.uploader_reach_cm, units)} reach</span>
                  </>
                ) : null}
              </div>
              {item.title ? <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p> : null}
              {item.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{item.notes}</p> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface AddVideoBetaDialogProps {
  open: boolean
  url: string
  title: string
  notes: string
  preview: { valid: boolean; platform?: string | null; error?: string | null }
  saving: boolean
  error: string | null
  setUrl: (value: string) => void
  setTitle: (value: string) => void
  setNotes: (value: string) => void
  onClose: () => void
  onSave: () => void
}

export function AddVideoBetaDialog(props: AddVideoBetaDialogProps) {
  const { open, url, title, notes, preview, saving, error, setUrl, setTitle, setNotes, onClose, onSave } = props
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Beta Link</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Paste a YouTube, Instagram, TikTok, or Vimeo link. Height/reach/gender are optional in Settings, but they make filters more useful.
        </p>

        <div className="mt-4 space-y-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title"
            maxLength={120}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            rows={3}
            maxLength={400}
            className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />

          {url.trim() ? (
            <p className={`text-xs ${preview.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {preview.valid ? `Preview ready (${formatPlatformLabel(preview.platform || 'other')})` : preview.error}
            </p>
          ) : null}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            You can update your height and reach in <Link href="/settings" className="underline">Settings</Link>. Leaving them empty is allowed.
          </p>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-70 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {saving ? 'Saving...' : 'Save Link'}
          </button>
        </div>
      </div>
    </div>
  )
}
