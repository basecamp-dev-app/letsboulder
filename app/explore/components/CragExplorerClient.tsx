'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { GRADES } from '@/lib/grades'

type SortOption = 'in_range' | 'total' | 'distance' | 'max_grade'

interface ExplorerCrag {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  country: string | null
  region_name: string | null
  in_range_count: number
  total_count: number
  max_grade: string | null
  distance_km: number | null
  grade_counts: Record<string, number>
}

interface ExplorerResponse {
  grades: string[]
  crags: ExplorerCrag[]
  pagination: {
    page: number
    limit: number
    total_crags: number
    total_pages: number
  }
}

interface LocationSearchResult {
  lat: number
  lon: number
  name: string
  display_name: string
  address: {
    city?: string
    state?: string
    country?: string
  }
}

function gradeLink(crag: ExplorerCrag): string {
  if (crag.slug && crag.country_code) {
    return `/${crag.country_code.toLowerCase()}/${crag.slug}`
  }
  return `/crag/${crag.id}`
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'in_range', label: 'Most in range' },
  { value: 'total', label: 'Most total routes' },
  { value: 'distance', label: 'Nearest first' },
  { value: 'max_grade', label: 'Highest top grade' },
]

export default function CragExplorerClient() {
  const router = useRouter()
  const pathname = usePathname()

  const [minGrade, setMinGrade] = useState('6A')
  const [maxGrade, setMaxGrade] = useState('7A')
  const [sort, setSort] = useState<SortOption>('in_range')
  const [radiusKm, setRadiusKm] = useState('100')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationLabel, setLocationLabel] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([])
  const [searchingLocation, setSearchingLocation] = useState(false)
  const [showLocationResults, setShowLocationResults] = useState(false)
  const [useLocation, setUseLocation] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ExplorerResponse | null>(null)
  const [page, setPage] = useState(1)
  const [initialized, setInitialized] = useState(false)
  const locationSearchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const minGradeParam = params.get('minGrade')
    const maxGradeParam = params.get('maxGrade')
    const sortParam = params.get('sort') as SortOption | null
    const radiusParam = params.get('radiusKm')
    const locationQueryParam = params.get('q')
    const pageParam = Number.parseInt(params.get('page') || '1', 10)
    const latParam = params.get('lat')
    const lngParam = params.get('lng')

    if (minGradeParam && GRADES.includes(minGradeParam)) setMinGrade(minGradeParam)
    if (maxGradeParam && GRADES.includes(maxGradeParam)) setMaxGrade(maxGradeParam)
    if (sortParam && SORT_OPTIONS.some((option) => option.value === sortParam)) setSort(sortParam)
    if (radiusParam) setRadiusKm(radiusParam)
    if (locationQueryParam) {
      setLocationLabel(locationQueryParam)
      setLocationQuery(locationQueryParam)
    }
    if (!Number.isNaN(pageParam) && pageParam > 0) setPage(pageParam)

    if (latParam && lngParam) {
      const lat = Number.parseFloat(latParam)
      const lng = Number.parseFloat(lngParam)
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        setLocation({ lat, lng })
        setUseLocation(true)
      }
    }

    setInitialized(true)
  }, [])

  useEffect(() => {
    const minIndex = GRADES.indexOf(minGrade)
    const maxIndex = GRADES.indexOf(maxGrade)
    if (minIndex > maxIndex) {
      setMaxGrade(minGrade)
    }
  }, [minGrade, maxGrade])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (locationSearchRef.current && !locationSearchRef.current.contains(event.target as Node)) {
        setShowLocationResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!initialized) return
    const query = locationQuery.trim()
    if (query.length < 2) {
      setLocationResults([])
      setSearchingLocation(false)
      return
    }

    const timeout = setTimeout(async () => {
      setSearchingLocation(true)
      try {
        const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`)
        const body = await response.json()
        if (!response.ok) {
          setLocationResults([])
          return
        }
        setLocationResults(body.results || [])
      } catch {
        setLocationResults([])
      } finally {
        setSearchingLocation(false)
      }
    }, 250)

    return () => clearTimeout(timeout)
  }, [locationQuery, initialized])

  useEffect(() => {
    if (!initialized) return
    const params = new URLSearchParams()
    params.set('minGrade', minGrade)
    params.set('maxGrade', maxGrade)
    params.set('sort', sort)
    params.set('page', String(page))
    if (useLocation && location) {
      params.set('lat', String(location.lat))
      params.set('lng', String(location.lng))
      params.set('radiusKm', radiusKm)
      if (locationLabel) {
        params.set('q', locationLabel)
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [minGrade, maxGrade, sort, useLocation, location, radiusKm, page, router, pathname, initialized, locationLabel])

  useEffect(() => {
    if (!initialized) return
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        params.set('minGrade', minGrade)
        params.set('maxGrade', maxGrade)
        params.set('sort', sort)
        params.set('page', String(page))
        params.set('limit', '20')
        if (useLocation && location) {
          params.set('lat', String(location.lat))
          params.set('lng', String(location.lng))
          params.set('radiusKm', radiusKm)
        }

        const response = await fetch(`/api/crags/explorer?${params.toString()}`)
        const body = await response.json()
        if (!response.ok) {
          setError(body.error || 'Failed to load explorer data')
          setData(null)
          return
        }
        setData(body)
      } catch {
        setError('Failed to load explorer data')
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [minGrade, maxGrade, sort, useLocation, location, radiusKm, page, initialized])

  const selectLocationResult = (result: LocationSearchResult) => {
    setLocation({ lat: result.lat, lng: result.lon })
    setUseLocation(true)
    setLocationLabel(result.display_name)
    setLocationQuery(result.display_name)
    setLocationResults([])
    setShowLocationResults(false)
    setPage(1)
  }

  const clearLocation = () => {
    setUseLocation(false)
    setLocation(null)
    setLocationLabel('')
    setLocationQuery('')
    setLocationResults([])
    setShowLocationResults(false)
    setPage(1)
  }

  const gradeBand = useMemo(() => {
    const minIndex = GRADES.indexOf(minGrade)
    const maxIndex = GRADES.indexOf(maxGrade)
    if (minIndex < 0 || maxIndex < 0 || minIndex > maxIndex) return []
    return GRADES.slice(minIndex, maxIndex + 1)
  }, [minGrade, maxGrade])

  const enableLocation = () => {
    if (useLocation) {
      setUseLocation(false)
      setPage(1)
      return
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not available on this device')
      return
    }

    setLoadingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setUseLocation(true)
        setLocationLabel('Current location')
        setLocationQuery('Current location')
        setLocationResults([])
        setShowLocationResults(false)
        setPage(1)
        setLoadingLocation(false)
      },
      () => {
        setError('Unable to get your location')
        setLoadingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-[var(--app-header-offset)] bg-white dark:bg-gray-950 z-10">
        Crag Explorer
      </h1>

      <div className="m-0 border-b border-gray-200 dark:border-gray-800 px-3 py-3 bg-white dark:bg-gray-950 sticky top-[calc(var(--app-header-offset)+3.25rem)] z-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <select
            value={minGrade}
            onChange={(e) => {
              setMinGrade(e.target.value)
              setPage(1)
            }}
            className="py-2 px-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
          >
            {GRADES.map((grade) => (
              <option key={`min-${grade}`} value={grade}>{grade}</option>
            ))}
          </select>

          <select
            value={maxGrade}
            onChange={(e) => {
              setMaxGrade(e.target.value)
              setPage(1)
            }}
            className="py-2 px-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
          >
            {GRADES.map((grade) => (
              <option key={`max-${grade}`} value={grade}>{grade}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortOption)
              setPage(1)
            }}
            className="py-2 px-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 col-span-2 md:col-span-1"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <button
            onClick={enableLocation}
            disabled={loadingLocation}
            className="py-2 px-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
          >
            {loadingLocation ? 'Locating...' : useLocation ? 'Disable location' : 'Use location'}
          </button>

          <input
            type="number"
            min={1}
            max={5000}
            value={radiusKm}
            onChange={(e) => {
              setRadiusKm(e.target.value)
              setPage(1)
            }}
            disabled={!useLocation}
            className="py-2 px-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 disabled:opacity-50"
            placeholder="Radius km"
          />

          <div ref={locationSearchRef} className="relative col-span-2 md:col-span-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value)
                  setShowLocationResults(true)
                }}
                onFocus={() => setShowLocationResults(true)}
                placeholder="Search location (city, area, country...)"
                className="flex-1 py-2 px-3 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
              />
              <button
                type="button"
                onClick={clearLocation}
                disabled={!useLocation}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
              >
                Clear
              </button>
            </div>

            {showLocationResults && (locationResults.length > 0 || searchingLocation) && (
              <div className="absolute mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-60 overflow-y-auto z-20">
                {searchingLocation && (
                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Searching...</div>
                )}
                {!searchingLocation && locationResults.map((result) => (
                  <button
                    key={`${result.lat}-${result.lon}-${result.display_name}`}
                    type="button"
                    onClick={() => selectLocationResult(result)}
                    className="block w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div className="text-sm text-gray-900 dark:text-gray-100">{result.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.display_name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Showing map-visible active routes in {minGrade} to {maxGrade} using consensus grade, with fallback to submitter grade when no consensus exists.
        </p>
      </div>

      {error && (
        <div className="mx-3 mt-3 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">Loading crags...</div>
      ) : data?.crags?.length ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.crags.map((crag) => {
            const maxInBand = Math.max(...gradeBand.map((grade) => crag.grade_counts[grade] || 0), 1)
            return (
              <Link
                key={crag.id}
                href={gradeLink(crag)}
                className="block px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-900/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">{crag.name}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {[crag.region_name, crag.country || crag.country_code].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {crag.in_range_count} in range
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {crag.total_count} total
                      {crag.distance_km !== null ? ` · ${crag.distance_km} km` : ''}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-5 md:grid-cols-10 gap-1">
                  {gradeBand.map((grade) => {
                    const count = crag.grade_counts[grade] || 0
                    const heightPct = Math.max(10, Math.round((count / maxInBand) * 100))
                    return (
                      <div key={`${crag.id}-${grade}`} className="flex flex-col items-center gap-1">
                        <div className="w-full h-10 flex items-end bg-gray-100 dark:bg-gray-800 rounded-sm">
                          <div className="w-full bg-blue-500 rounded-sm" style={{ height: `${count > 0 ? heightPct : 0}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-none">{grade}</span>
                      </div>
                    )
                  })}
                </div>

                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Max grade: {crag.max_grade || 'n/a'}
                </p>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          No crags found for this grade range. Try widening your range.
        </div>
      )}

      {data && data.pagination.total_pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {data.pagination.page}/{data.pagination.total_pages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.pagination.page === 1}
              className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.total_pages, p + 1))}
              disabled={data.pagination.page === data.pagination.total_pages}
              className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
