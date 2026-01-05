'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

interface SearchResult {
  type: 'crag' | 'climb'
  id: string
  name: string
  crag_name?: string
  latitude?: number
  longitude?: number
}

export default function Header() {
  const [user, setUser] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      console.log('Header: got user', user)
      setUser(user)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('Header: auth state change', _event, session?.user)
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
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
      cragsData.forEach((crag: any) => {
        results.push({
          type: 'crag',
          id: crag.id,
          name: crag.name,
          latitude: crag.latitude,
          longitude: crag.longitude
        })
      })
    }

    const { data: climbsData } = await supabase
      .from('climbs')
      .select('id, name, crags!inner(name, latitude, longitude)')
      .ilike('name', `%${query}%`)
      .eq('status', 'approved')
      .limit(10)

    if (climbsData) {
      climbsData.forEach((climb: any) => {
        results.push({
          type: 'climb',
          id: climb.id,
          name: climb.name,
          crag_name: climb.crags?.name,
          latitude: climb.crags?.latitude,
          longitude: climb.crags?.longitude
        })
      })
    }

    setSearchResults(results)
    setIsSearching(false)
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)
    setShowDropdown(true)
    searchClimbsAndCrags(query)
  }

  const handleResultClick = (result: SearchResult) => {
    setShowDropdown(false)
    setSearchQuery('')
    if (result.latitude && result.longitude) {
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
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow">
      <div className="container mx-auto px-4 py-2 flex justify-between items-center">
        <Link href="/" className="flex items-center -my-2 hidden md:block">
          <div className="relative w-16 h-16">
            <Image
              src="/og.png"
              alt="gsyrocks"
              fill
              className="object-contain"
              priority
            />
          </div>
        </Link>

        <div ref={searchRef} className="relative flex-1 max-w-md mx-4">
          <input
            type="text"
            placeholder="Search crags or climbs..."
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => setShowDropdown(true)}
            className="w-full px-4 py-2 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
              {searchResults.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-start gap-3"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    result.type === 'crag' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {result.type === 'crag' ? '📍' : '🧗'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{result.name}</p>
                    {result.type === 'climb' && result.crag_name && (
                      <p className="text-sm text-gray-500">at {result.crag_name}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {showDropdown && searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500 z-50">
              No results found
            </div>
          )}
        </div>

        <nav className="hidden md:flex items-center space-x-4">
          <Link href="/logbook" className="text-gray-600 hover:text-gray-900">
            Logbook
          </Link>
          <Link href="/contribute" className="text-gray-600 hover:text-gray-900">
            Contribute
          </Link>
          {user ? (
            <>
               <Link href="/profile" className="text-gray-600 hover:text-gray-900">
                  Profile
                </Link>
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/auth" className="text-gray-600 hover:text-gray-900">
                Login
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}