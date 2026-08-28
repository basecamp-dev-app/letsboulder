
'use client'

import { useEffect, useId, useState, useRef, useCallback, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import {
  DESKTOP_MORE_MENU_SECTIONS,
  PRIMARY_NAV_ITEMS,
  isNavItemActive,
  isNavigationMenuRoute,
  type NavItem,
} from '@/lib/nav-items'
import { useLazyAuthUser } from '@/components/use-lazy-auth-user'
import { useSignOut } from '@/components/QueryProviders'

interface SearchResult {
  type: 'crag' | 'climb'
  id: string
  name: string
  crag_name?: string
  slug?: string | null
  country_code?: string | null
  region_name?: string | null
  sub_area?: string | null
  latitude?: number
  longitude?: number
}

interface SearchResultGroup {
  key: 'crags' | 'climbs'
  label: string
  items: SearchResult[]
}

interface CragData {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  slug: string | null
  country_code: string | null
  region_name: string | null
  sub_area: string | null
}

interface ClimbSearchRow {
  id: string
  name: string | null
  crags: {
    name: string
    latitude: number | null
    longitude: number | null
    country_code: string | null
    region_name: string | null
    sub_area: string | null
  } | null
}

function getCountryName(countryCode?: string | null) {
  if (!countryCode) return null

  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(countryCode.toUpperCase()) ?? null
  } catch {
    return countryCode.toUpperCase()
  }
}

function getLocationContext(result: SearchResult) {
  const parts = [result.sub_area, result.region_name, getCountryName(result.country_code)]
    .filter((part): part is string => Boolean(part?.trim()))
    .filter((part, index, allParts) => allParts.findIndex((candidate) => candidate.toLocaleLowerCase() === part.toLocaleLowerCase()) === index)

  if (result.type === 'climb') {
    const cragContext = result.crag_name ? `at ${result.crag_name}` : 'Climb'
    return parts.length > 0 ? `${cragContext} — ${parts.join(', ')}` : cragContext
  }

  return parts.join(', ') || 'Crag'
}

export default function Header() {
  const headerRef = useRef<HTMLElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const { user, load: loadAuthUser } = useLazyAuthUser()
  const signOut = useSignOut()
  const searchListboxId = useId()
  const moreMenuId = useId()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1)
  const latestSearchRequestRef = useRef(0)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const el = headerRef.current
    if (!el) return

    const updateOffset = () => {
      const display = window.getComputedStyle(el).display
      const height = display === 'none' ? 0 : Math.ceil(el.getBoundingClientRect().height)
      document.documentElement.style.setProperty('--app-header-offset', `${height}px`)
    }

    updateOffset()

    const ro = new ResizeObserver(updateOffset)
    ro.observe(el)
    window.addEventListener('resize', updateOffset)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateOffset)
    }
  }, [pathname])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false)
      }
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setShowMoreDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!showMoreDropdown) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setShowMoreDropdown(false)
      moreButtonRef.current?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showMoreDropdown])

  const searchClimbsAndCrags = useCallback(async (query: string) => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery || trimmedQuery.length < 2) {
      latestSearchRequestRef.current += 1
      searchAbortRef.current?.abort()
      searchAbortRef.current = null
      setSearchResults([])
      setActiveSearchIndex(-1)
      setIsSearching(false)
      setSearchError(false)
      return
    }

    const requestId = latestSearchRequestRef.current + 1
    latestSearchRequestRef.current = requestId
    searchAbortRef.current?.abort()
    const abortController = new AbortController()
    searchAbortRef.current = abortController
    setIsSearching(true)
    setSearchError(false)
    try {
      const supabase = createClient()
      const [cragsResponse, climbsResponse] = await Promise.all([
        supabase
          .from('crags')
          .select('id, name, latitude, longitude, slug, country_code, region_name, sub_area')
          .eq('publication_status', 'published')
          .is('deleted_at', null)
          .is('superseded_by', null)
          .ilike('name', `%${trimmedQuery}%`)
          .limit(5)
          .abortSignal(abortController.signal),
        supabase
          .from('climbs')
          .select('id, name, crags!inner(name, latitude, longitude, country_code, region_name, sub_area)')
          .ilike('name', `%${trimmedQuery}%`)
          .in('status', ['active', 'approved'])
          .eq('crags.publication_status', 'published')
          .is('crags.deleted_at', null)
          .is('crags.superseded_by', null)
          .limit(10)
          .abortSignal(abortController.signal)
      ])

      if (requestId !== latestSearchRequestRef.current) {
        return
      }

      const results: SearchResult[] = []
      if (cragsResponse.error || climbsResponse.error) {
        throw new Error('Search unavailable')
      }
      const cragsData = cragsResponse.data

      if (cragsData) {
        cragsData.forEach((crag: CragData) => {
          if (crag.name && crag.latitude !== null && crag.longitude !== null) {
            results.push({
              type: 'crag',
              id: crag.id,
              name: crag.name,
              slug: crag.slug,
              country_code: crag.country_code,
              region_name: crag.region_name,
              sub_area: crag.sub_area,
              latitude: crag.latitude,
              longitude: crag.longitude
            })
          }
        })
      }

      const climbsData = climbsResponse.data

      if (climbsData) {
        climbsData.forEach((climb: ClimbSearchRow) => {
          if (!climb.name) return
          const crag = climb.crags
          results.push({
            type: 'climb',
            id: climb.id,
            name: climb.name,
            crag_name: crag?.name ?? undefined,
            country_code: crag?.country_code,
            region_name: crag?.region_name,
            sub_area: crag?.sub_area,
            latitude: crag?.latitude ?? undefined,
            longitude: crag?.longitude ?? undefined
          })
        })
      }

      if (requestId === latestSearchRequestRef.current) {
        setSearchResults(results)
        setActiveSearchIndex(results.length > 0 ? 0 : -1)
      }
    } catch {
      if (requestId === latestSearchRequestRef.current && !abortController.signal.aborted) {
        setSearchResults([])
        setActiveSearchIndex(-1)
        setSearchError(true)
      }
    } finally {
      if (requestId === latestSearchRequestRef.current) {
        setIsSearching(false)
        if (searchAbortRef.current === abortController) {
          searchAbortRef.current = null
        }
      }
    }
  }, [])

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
    latestSearchRequestRef.current += 1
    searchAbortRef.current?.abort()
    searchAbortRef.current = null

    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setSearchResults([])
      setActiveSearchIndex(-1)
      setIsSearching(false)
      setSearchError(false)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(() => {
      void searchClimbsAndCrags(searchQuery)
    }, 500)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
    }
  }, [searchClimbsAndCrags, searchQuery])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)
    setSearchResults([])
    setIsSearching(query.trim().length >= 2)
    setSearchError(false)
    setShowSearchDropdown(true)
    setActiveSearchIndex(-1)
  }

  const clearSearch = () => {
    latestSearchRequestRef.current += 1
    searchAbortRef.current?.abort()
    setSearchQuery('')
    setSearchResults([])
    setActiveSearchIndex(-1)
    setIsSearching(false)
    setSearchError(false)
    setShowSearchDropdown(false)
    searchInputRef.current?.focus()
  }

  const handleResultClick = (result: SearchResult) => {
    setShowSearchDropdown(false)
    setSearchQuery('')
    setActiveSearchIndex(-1)
    if (result.type === 'crag') {
      if (result.slug && result.country_code) {
        router.push(`/${result.country_code.toLowerCase()}/${result.slug}`)
      } else {
        router.push(`/crag/${result.id}`)
      }
    } else if (result.type === 'climb') {
      router.push(`/climb/${result.id}`)
    } else if (result.latitude != null && result.longitude != null) {
      router.push(`/?lat=${result.latitude}&lng=${result.longitude}&zoom=15`)
    } else {
      router.push('/')
    }
  }

  const handleLogout = async () => {
    if (!await signOut()) return
    window.location.href = '/'
  }

  const handleMoreMenuToggle = () => {
    if (!showMoreDropdown) {
      void loadAuthUser()
    }
    setShowMoreDropdown(!showMoreDropdown)
  }

  const handleMoreButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown') return

    event.preventDefault()
    if (!showMoreDropdown) {
      void loadAuthUser()
      setShowMoreDropdown(true)
    }
  }

  const renderMoreMenuSection = (label: string, items: NavItem[]) => {
    if (items.length === 0) return null

    return (
      <div className="py-1 first:pt-0 last:pb-0">
        <p className="mx-2 mb-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600 dark:bg-gray-800/80 dark:text-gray-300">{label}</p>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={item.prefetch}
            onClick={() => setShowMoreDropdown(false)}
            aria-current={isNavItemActive(pathname, item) ? 'page' : undefined}
            className={`block min-h-9 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${
              isNavItemActive(pathname, item)
                ? 'font-semibold text-gray-950 underline decoration-2 underline-offset-4 dark:text-white'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    )
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const hasResults = searchResults.length > 0

    if (event.key === 'ArrowDown') {
      if (!hasResults) return
      event.preventDefault()
      setShowSearchDropdown(true)
      setActiveSearchIndex((currentIndex) => {
        if (currentIndex < 0) return 0
        return (currentIndex + 1) % searchResults.length
      })
      return
    }

    if (event.key === 'ArrowUp') {
      if (!hasResults) return
      event.preventDefault()
      setShowSearchDropdown(true)
      setActiveSearchIndex((currentIndex) => {
        if (currentIndex < 0) return searchResults.length - 1
        return (currentIndex - 1 + searchResults.length) % searchResults.length
      })
      return
    }

    if (event.key === 'Enter') {
      if (!showSearchDropdown || activeSearchIndex < 0 || !searchResults[activeSearchIndex]) return
      event.preventDefault()
      handleResultClick(searchResults[activeSearchIndex])
      return
    }

    if (event.key === 'Escape') {
      setShowSearchDropdown(false)
      setActiveSearchIndex(-1)
    }
  }

  const groupedSearchResults = useMemo<SearchResultGroup[]>(() => {
    const crags = searchResults.filter((result) => result.type === 'crag')
    const climbs = searchResults.filter((result) => result.type === 'climb')
    const groups: SearchResultGroup[] = [
      { key: 'crags', label: 'Crags', items: crags },
      { key: 'climbs', label: 'Climbs', items: climbs }
    ]

    return groups.filter((group) => group.items.length > 0)
  }, [searchResults])

  const searchStatusMessage = useMemo(() => {
    const trimmedQuery = searchQuery.trim()
    if (!showSearchDropdown || trimmedQuery.length === 0) return ''
    if (trimmedQuery.length < 2) return 'Type at least 2 characters to search all crags and climbs.'
    if (isSearching) return 'Searching crags and climbs.'
    if (searchError) return 'Search is unavailable right now. Try again.'
    if (searchResults.length === 0) return `No crags or climbs matched ${trimmedQuery}.`

    const cragCount = searchResults.filter((result) => result.type === 'crag').length
    const climbCount = searchResults.length - cragCount
    const resultLabel = searchResults.length === 1 ? 'result' : 'results'
    const cragLabel = cragCount === 1 ? 'crag' : 'crags'
    const climbLabel = climbCount === 1 ? 'climb' : 'climbs'
    return `${searchResults.length} ${resultLabel}: ${cragCount} ${cragLabel} and ${climbCount} ${climbLabel}.`
  }, [isSearching, searchError, searchQuery, searchResults, showSearchDropdown])
  const hasSearchPopup = showSearchDropdown && searchQuery.trim().length > 0

  return (
    <header ref={headerRef} className="relative z-[3000] bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none block">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 md:flex-nowrap">
        <Link href="/" className="flex min-h-9 flex-shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="text-xl font-black tracking-[-0.04em] text-slate-950 dark:text-white sm:text-2xl">
            letsboulder
          </span>
        </Link>

        <div ref={searchRef} className="relative order-3 w-full md:order-none md:flex-1 md:max-w-md">
          <input
            ref={searchInputRef}
            id="global-search"
            type="text"
            placeholder="Search all crags and climbs"
            aria-label="Search all crags and climbs"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => setShowSearchDropdown(true)}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={hasSearchPopup}
            aria-controls={hasSearchPopup ? searchListboxId : undefined}
            aria-activedescendant={
              showSearchDropdown && activeSearchIndex >= 0 && searchResults[activeSearchIndex]
                ? `${searchListboxId}-${searchResults[activeSearchIndex].type}-${searchResults[activeSearchIndex].id}`
                : undefined
            }
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {showSearchDropdown && searchResults.length > 0 && (
            <div
              id={searchListboxId}
              role="listbox"
              aria-label="Search results"
              className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-[60vh] overflow-y-auto z-[1200] md:z-50"
            >
              {groupedSearchResults.map((group) => (
                <div key={group.key}>
                  <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{group.label}</p>
                  {group.items.map((result) => {
                    const index = searchResults.findIndex((item) => item.type === result.type && item.id === result.id)

                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        id={`${searchListboxId}-${result.type}-${result.id}`}
                        onClick={() => handleResultClick(result)}
                        onMouseEnter={() => setActiveSearchIndex(index)}
                        role="option"
                        aria-selected={activeSearchIndex === index}
                        className={`w-full px-4 py-3 text-left border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                          activeSearchIndex === index
                            ? 'bg-gray-50 dark:bg-gray-800'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{result.name}</p>
                          {result.type === 'climb' && result.crag_name ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">{getLocationContext(result)}</p>
                          ) : result.type === 'crag' ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">{getLocationContext(result)}</p>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
          {showSearchDropdown && searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && !isSearching && (
            <div
              id={searchListboxId}
              className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 text-center text-gray-500 dark:text-gray-400 z-[1200] md:z-50"
            >
              Type at least 2 characters to search all crags and climbs.
            </div>
          )}
          {showSearchDropdown && searchQuery.trim().length >= 2 && isSearching && (
            <div
              id={searchListboxId}
              className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 text-center text-gray-500 dark:text-gray-400 z-[1200] md:z-50"
            >
              Searching crags and climbs...
            </div>
          )}
          {showSearchDropdown && searchQuery.trim().length >= 2 && searchError && !isSearching && (
            <div id={searchListboxId} className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 text-center text-gray-600 dark:text-gray-300 z-[1200] md:z-50">
              <p>Search is unavailable right now. Try again.</p>
              <button
                type="button"
                onClick={() => void searchClimbsAndCrags(searchQuery)}
                className="mt-3 min-h-9 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                Try again
              </button>
            </div>
          )}
          {showSearchDropdown && searchQuery.trim().length >= 2 && searchResults.length === 0 && !isSearching && !searchError && (
              <div
                id={searchListboxId}
                className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 text-center text-gray-500 dark:text-gray-400 z-[1200] md:z-50"
              >
                <p>No crags or climbs matched &quot;{searchQuery.trim()}&quot;.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="min-h-9 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    Clear search
                  </button>
                  <Link
                    href="/"
                    onClick={clearSearch}
                    className="inline-flex min-h-9 items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 underline decoration-2 underline-offset-4 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-gray-300 dark:hover:text-white"
                  >
                    Browse map
                  </Link>
                </div>
              </div>
            )}
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{searchStatusMessage}</p>
        </div>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item)
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.prefetch}
                aria-current={active ? 'page' : undefined}
                className={`hidden min-h-9 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:block ${
                  active
                    ? 'bg-gray-100 text-gray-950 underline decoration-2 underline-offset-4 dark:bg-gray-800 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
          <div ref={moreRef} className="relative hidden md:block">
            <button
              ref={moreButtonRef}
              type="button"
              onClick={handleMoreMenuToggle}
              onKeyDown={handleMoreButtonKeyDown}
              className={`flex min-h-9 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isNavigationMenuRoute(pathname)
                  ? 'bg-gray-100 text-gray-950 underline decoration-2 underline-offset-4 dark:bg-gray-800 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
              }`}
              aria-label="More navigation"
              aria-expanded={showMoreDropdown}
              aria-controls={showMoreDropdown ? moreMenuId : undefined}
            >
              <span>More</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
              </svg>
            </button>
              {showMoreDropdown && (
                <nav id={moreMenuId} aria-label="More navigation" className="absolute right-0 top-full mt-1 min-w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900 z-[4000]">
                  {DESKTOP_MORE_MENU_SECTIONS.map((section) => renderMoreMenuSection(section.label, section.items))}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                {user ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreDropdown(false)
                      handleLogout()
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Sign out
                  </button>
                ) : (
                  <Link
                    href="/auth"
                    onClick={() => setShowMoreDropdown(false)}
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Sign in
                  </Link>
                )}
              </nav>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
