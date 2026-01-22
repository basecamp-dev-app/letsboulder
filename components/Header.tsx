'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { trackSearchPerformed, trackSearchResultClicked } from '@/lib/posthog'
import { MORE_MENU_ITEMS } from '@/lib/nav-items'

interface SearchResult {
  type: 'crag' | 'climb'
  id: string
  name: string
  crag_name?: string
  latitude?: number
  longitude?: number
}

interface CragData {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
}

export default function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

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

  const searchClimbsAndCrags = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    const supabase = createClient()

    const results: SearchResult[] = []

    const { data: cragsData } = await supabase
      .from('crags')
      .select('id, name, latitude, longitude')
      .ilike('name', `%${query}%`)
      .limit(5)

    if (cragsData) {
      cragsData.forEach((crag: CragData) => {
        if (crag.name && crag.latitude !== null && crag.longitude !== null) {
          results.push({
            type: 'crag',
            id: crag.id,
            name: crag.name,
            latitude: crag.latitude,
            longitude: crag.longitude
          })
        }
      })
    }

    const { data: climbsData } = await supabase
      .from('climbs')
      .select('id, name, crags!inner(name, latitude, longitude)')
      .ilike('name', `%${query}%`)
      .eq('status', 'approved')
      .limit(10)

    if (climbsData) {
      climbsData.forEach((climb) => {
        const crag = climb.crags?.[0]
        results.push({
          type: 'climb',
          id: climb.id,
          name: climb.name,
          crag_name: crag?.name,
          latitude: crag?.latitude ?? undefined,
          longitude: crag?.longitude ?? undefined
        })
      })
    }

    setSearchResults(results)
    trackSearchPerformed(query, results.length)
    setIsSearching(false)
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)
    setShowSearchDropdown(true)
    searchClimbsAndCrags(query)
  }

  const handleResultClick = (result: SearchResult) => {
    setShowSearchDropdown(false)
    setSearchQuery('')
    trackSearchResultClicked(result.id, result.type, result.name)
    if (result.type === 'climb' && result.latitude && result.longitude) {
      router.push(`/map?lat=${result.latitude}&lng=${result.longitude}&zoom=16&climbId=${result.id}`)
    } else if (result.latitude && result.longitude) {
      router.push(`/map?lat=${result.latitude}&lng=${result.longitude}&zoom=15`)
    } else {
      router.push('/map')
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center gap-4">
        <Link href="/" className="flex items-center flex-shrink-0">
          <div className="relative w-16 h-16">
            <Image
              src="/logo-light.png"
              alt="gsyrocks"
              fill
              className="object-cover dark:opacity-0"
              priority
            />
            <Image
              src="/logo-dark.png"
              alt="gsyrocks"
              fill
              className="object-cover opacity-0 dark:opacity-100"
              priority
            />
          </div>
        </Link>

        <div ref={searchRef} className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search crags or climbs..."
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => setShowSearchDropdown(true)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-[60vh] overflow-y-auto z-[1200] md:z-50">
              {searchResults.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{result.name}</p>
                    {result.type === 'climb' && result.crag_name && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">at {result.crag_name}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {showSearchDropdown && searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 text-center text-gray-500 dark:text-gray-400 z-[1200] md:z-50">
              No results found
            </div>
          )}
        </div>

        <nav className="flex items-center gap-1">
          <Link href="/logbook" className="hidden md:block px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Logbook
          </Link>
          <Link href="/map" className="hidden md:block px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Map
          </Link>
          <Link href="/submit" className="hidden md:block px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Upload
          </Link>
          <div ref={moreRef} className="relative hidden md:block">
            <button
              onClick={() => setShowMoreDropdown(!showMoreDropdown)}
              className="flex items-center px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
              {showMoreDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-40 z-50">
                  {MORE_MENU_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMoreDropdown(false)}
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                {user ? (
                  <button
                    onClick={() => {
                      setShowMoreDropdown(false)
                      handleLogout()
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Logout
                  </button>
                ) : (
                  <Link
                    href="/auth"
                    onClick={() => setShowMoreDropdown(false)}
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Login
                  </Link>
                )}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
