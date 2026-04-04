'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/hooks/useCsrf'
import { reportError } from '@/lib/errors'

interface Sector {
  id: string
  name: string
  crag_id: string
}

interface SectorSelectorProps {
  cragId: string | null
  value: string | null
  onChange: (sectorId: string | null) => void
  placeholder?: string
}

export default function SectorSelector({
  cragId,
  value,
  onChange,
  placeholder = 'Select sector...',
}: SectorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [sectors, setSectors] = useState<Sector[]>([])
  const [loading, setLoading] = useState(false)
  const [newSectorName, setNewSectorName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateInput, setShowCreateInput] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchSectors = useCallback(async () => {
    if (!cragId) {
      setSectors([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/crags/${cragId}/sectors`)
      if (response.ok) {
        const data = await response.json()
        setSectors(data)
      }
    } catch {
      reportError(new Error('Failed to fetch sectors'), { message: 'Failed to fetch sectors' })
    } finally {
      setLoading(false)
    }
  }, [cragId])

  useEffect(() => {
    fetchSectors()
  }, [fetchSectors])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowCreateInput(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreateSector = async () => {
    if (!cragId || !newSectorName.trim()) return

    setIsCreating(true)
    try {
      const response = await csrfFetch(`/api/crags/${cragId}/sectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSectorName.trim() }),
      })

      if (response.ok) {
        const newSector = await response.json()
        setSectors((prev) => [...prev, newSector])
        onChange(newSector.id)
        setNewSectorName('')
        setShowCreateInput(false)
        setIsOpen(false)
      }
    } catch {
      reportError(new Error('Failed to create sector'), { message: 'Failed to create sector' })
    } finally {
      setIsCreating(false)
    }
  }

  const selectedSector = sectors.find((s) => s.id === value)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800',
          'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          selectedSector ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'
        )}
      >
        <span>{selectedSector ? selectedSector.name : placeholder}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>

      {isOpen ? (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
          ) : sectors.length === 0 && !showCreateInput ? (
            <button
              type="button"
              onClick={() => setShowCreateInput(true)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Plus className="h-4 w-4" />
              Add new sector
            </button>
          ) : (
            <>
              {sectors.map((sector) => (
                <button
                  key={sector.id}
                  type="button"
                  onClick={() => {
                    onChange(sector.id)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700',
                    value === sector.id && 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                  )}
                >
                  {sector.name}
                </button>
              ))}
              {showCreateInput ? (
                <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSectorName}
                      onChange={(e) => setNewSectorName(e.target.value)}
                      placeholder="Sector name"
                      className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateSector()
                        if (e.key === 'Escape') setShowCreateInput(false)
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleCreateSector}
                      disabled={isCreating || !newSectorName.trim()}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isCreating ? '...' : 'Add'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateInput(true)}
                  className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <Plus className="h-4 w-4" />
                  Add new sector
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
