'use client'

import { useState, useEffect, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { LocationSection } from './LocationSection'

interface LocationSectionWrapperProps {
  user: User
}

export function LocationSectionWrapper({ user }: LocationSectionWrapperProps) {
  const [loading, setLoading] = useState(true)
  const [defaultLocationName, setDefaultLocationName] = useState<string | null>(null)
  const [defaultLocationLat, setDefaultLocationLat] = useState<number | null>(null)
  const [defaultLocationLng, setDefaultLocationLng] = useState<number | null>(null)
  const [defaultLocationZoom, setDefaultLocationZoom] = useState<number | null>(null)

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return

      try {
        const response = await fetch('/api/settings')
        const data = await response.json()
        
        if (data.settings) {
          setDefaultLocationName(data.settings.defaultLocationName || null)
          setDefaultLocationLat(data.settings.defaultLocationLat || null)
          setDefaultLocationLng(data.settings.defaultLocationLng || null)
          setDefaultLocationZoom(data.settings.defaultLocationZoom || null)
        }
      } catch (error) {
        console.error('Error fetching location settings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [user])

  const handleSave = useCallback(async (data: {
    defaultLocationName: string
    defaultLocationLat: number
    defaultLocationLng: number
    defaultLocationZoom: number
  }) => {
    if (!user) return

    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultLocationName: data.defaultLocationName,
        defaultLocationLat: data.defaultLocationLat,
        defaultLocationLng: data.defaultLocationLng,
        defaultLocationZoom: data.defaultLocationZoom,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to save location')
    }

    setDefaultLocationName(data.defaultLocationName)
    setDefaultLocationLat(data.defaultLocationLat)
    setDefaultLocationLng(data.defaultLocationLng)
    setDefaultLocationZoom(data.defaultLocationZoom)
  }, [user])

  const handleClear = useCallback(async () => {
    if (!user) return

    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultLocationName: null,
        defaultLocationLat: null,
        defaultLocationLng: null,
        defaultLocationZoom: null,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to clear location')
    }

    setDefaultLocationName(null)
    setDefaultLocationLat(null)
    setDefaultLocationLng(null)
    setDefaultLocationZoom(null)
  }, [user])

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
        <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
    )
  }

  return (
    <LocationSection
      defaultLocationName={defaultLocationName}
      defaultLocationLat={defaultLocationLat}
      defaultLocationLng={defaultLocationLng}
      defaultLocationZoom={defaultLocationZoom}
      onSave={handleSave}
      onClear={handleClear}
    />
  )
}
