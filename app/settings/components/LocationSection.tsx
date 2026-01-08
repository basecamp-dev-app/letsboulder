'use client'

import { useState, useCallback } from 'react'
import { Search, MapPin, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface LocationResult {
  lat: number
  lng: number
  name: string
  display_name: string
  type: string
  address: {
    city: string
    state: string
    country: string
    country_code: string
  }
}

interface LocationSectionProps {
  defaultLocationName: string | null
  defaultLocationLat: number | null
  defaultLocationLng: number | null
  defaultLocationZoom: number | null
  onSave: (data: {
    defaultLocationName: string
    defaultLocationLat: number
    defaultLocationLng: number
    defaultLocationZoom: number
  }) => Promise<void>
  onClear: () => Promise<void>
}

export function LocationSection({
  defaultLocationName,
  defaultLocationLat,
  defaultLocationLng,
  defaultLocationZoom,
  onSave,
  onClear,
}: LocationSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<LocationResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null)
  const [zoomLevel, setZoomLevel] = useState(defaultLocationZoom || 12)
  const [setFromMapMode, setSetFromMapMode] = useState(false)

  const handleSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`)
      const data = await response.json()
      if (data.results) {
        setSearchResults(data.results)
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSelectLocation = (location: LocationResult) => {
    setSelectedLocation(location)
    setSearchQuery(location.display_name)
    setSearchResults([])
  }

  const handleSave = async () => {
    if (!selectedLocation) return

    setIsSaving(true)
    try {
      await onSave({
        defaultLocationName: selectedLocation.display_name,
        defaultLocationLat: selectedLocation.lat,
        defaultLocationLng: selectedLocation.lng,
        defaultLocationZoom: zoomLevel,
      })
      setIsOpen(false)
      setSelectedLocation(null)
      setSearchQuery('')
      setSetFromMapMode(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    await onClear()
    setSelectedLocation(null)
    setSearchQuery('')
    setZoomLevel(12)
    setSetFromMapMode(false)
  }

  const handleOpenMapForSelection = () => {
    setSetFromMapMode(true)
    window.open('/map?setLocation=true', '_blank', 'width=800,height=600')
  }

  const formatLocationName = (name: string | null) => {
    if (!name) return 'No location set'
    const parts = name.split(',')
    return parts[0] || name
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Default Location</span>
            {defaultLocationName && (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                {formatLocationName(defaultLocationName)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {defaultLocationName ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <MapPin className="w-4 h-4" />
                <span>{defaultLocationName}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsOpen(true)}>
                  Change Location
                </Button>
                <Button variant="ghost" onClick={handleClear} className="text-red-600 hover:text-red-700">
                  Clear
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setIsOpen(true)} className="w-full">
              <MapPin className="w-4 h-4 mr-2" />
              Set Default Location
            </Button>
          )}
        </CardContent>
      </Card>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold">Set Default Location</h3>
              <button
                onClick={() => {
                  setIsOpen(false)
                  setSetFromMapMode(false)
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
              {!setFromMapMode ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        handleSearch(e.target.value)
                      }}
                      placeholder="Search for a location..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      {searchResults.map((result, index) => (
                        <button
                          key={index}
                          onClick={() => handleSelectLocation(result)}
                          className="w-full p-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">{result.name}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {result.address.city && `${result.address.city}, `}
                                {result.address.country}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery && searchResults.length === 0 && !isSearching && (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                      No locations found
                    </p>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">or</span>
                    </div>
                  </div>

                  <button
                    onClick={handleOpenMapForSelection}
                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>Select from Map</span>
                  </button>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    A new window has opened with the map. Navigate to your desired location and click the button there to set it as your default.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSetFromMapMode(false)}
                  >
                    Back to Search
                  </Button>
                </div>
              )}

              {selectedLocation && !setFromMapMode && (
                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {selectedLocation.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedLocation.display_name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {selectedLocation.lat.toFixed(4)}°, {selectedLocation.lng.toFixed(4)}°
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Zoom Level: {zoomLevel}
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="18"
                      value={zoomLevel}
                      onChange={(e) => setZoomLevel(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Far</span>
                      <span>Close</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedLocation && !setFromMapMode && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedLocation(null)
                    setSearchQuery('')
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Location'
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
