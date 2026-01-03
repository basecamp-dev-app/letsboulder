'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function Header() {
  const [user, setUser] = useState<any>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [locationError, setLocationError] = useState<string | null>(null)

  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error')
      return
    }

    setLocationStatus('requesting')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        setLocationStatus('tracking')
        console.log('Header: Location updated:', latitude, longitude, 'accuracy:', accuracy, 'meters')

        // Store location with accuracy info
        localStorage.setItem('userLocation', JSON.stringify({ lat: latitude, lng: longitude, accuracy }))

        // Warn if accuracy is poor (IP-based geolocation is typically > 1000m)
        if (accuracy > 1000) {
          console.warn('Low accuracy location - GPS may not be available. For accurate tracking, use a mobile device with GPS.')
        }
      },
      (error) => {
        console.error('Header: Error getting location:', error)
        setLocationStatus('error')

        if (!error || error.code === undefined) {
          setLocationError('Location access blocked. Check browser settings.')
        } else {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setLocationError('Location denied. Click the lock icon in your address bar to allow access.')
              break
            case error.POSITION_UNAVAILABLE:
              setLocationError('GPS unavailable. For accurate tracking, use a mobile device.')
              break
            case error.TIMEOUT:
              setLocationError('Location timed out. Try again.')
              break
          }
        }
        localStorage.removeItem('userLocation')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

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

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-10 bg-white shadow">
      <div className="container mx-auto px-4 py-2 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold text-gray-900">
          gsyrocks
        </Link>
        <nav className="flex items-center space-x-4">
          <Link href="/map" className="text-gray-600 hover:text-gray-900">
            Map
          </Link>
          <button
            onClick={startLocationTracking}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              locationStatus === 'tracking'
                ? 'bg-green-100 text-green-700 border border-green-300'
                : locationStatus === 'error'
                ? 'bg-red-100 text-red-700 border border-red-300'
                : 'text-gray-600 hover:text-gray-900 border border-transparent hover:bg-gray-100'
            }`}
            title="Enable location tracking"
          >
            {locationStatus === 'tracking' ? '📍 Tracking' : locationStatus === 'error' ? '📍 Error' : '📍 Find me'}
          </button>
          {locationError && (
            <span className="text-xs text-red-600" title={locationError}>
              ⚠️
            </span>
          )}
          <Link href="/upload" className="text-gray-600 hover:text-gray-900">
            Upload Route
          </Link>
          {user ? (
            <>
              <Link href="/logbook" className="text-gray-600 hover:text-gray-900">
                My Logbook
              </Link>
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
              <Link href="/auth/login" className="text-gray-600 hover:text-gray-900">
                Login
              </Link>
              <Link href="/auth/register" className="text-blue-600 hover:text-blue-700">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}