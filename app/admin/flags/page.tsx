'use client'

import { useEffect, useState } from 'react'
import { Loader2, Check, Trash2 } from 'lucide-react'
import { csrfFetch } from '@/hooks/useCsrf'

interface Flag {
  id: string
  flag_type: string
  comment: string
  status: string
  action_taken: string | null
  created_at: string
  flagger: { id: string; email: string; username: string | null } | null
  image: { id: string; url: string } | null
  crag: { id: string; name: string } | null
  climbs: { id: string; name: string; grade: string } | null
}

const FLAG_TYPE_LABELS: Record<string, string> = {
  location: 'Location',
  route_line: 'Route Line',
  route_name: 'Route Name',
  image_quality: 'Image Quality',
  wrong_crag: 'Wrong Crag',
  other: 'Other',
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  keep: { label: 'Keep', color: 'bg-green-600 hover:bg-green-500' },
  edit: { label: 'Edit', color: 'bg-blue-600 hover:bg-blue-500' },
  remove: { label: 'Remove', color: 'bg-red-600 hover:bg-red-500' },
}

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'all'>('pending')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const loadFlags = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/flags?status=${filter}`)
        if (response.ok) {
          const data = await response.json()
          setFlags(data.flags)
        }
      } catch (error) {
        console.error('Error fetching flags:', error)
      } finally {
        setLoading(false)
      }
    }
    loadFlags()
  }, [filter])

  const handleResolve = async (flagId: string, action: 'keep' | 'edit' | 'remove') => {
    setResolving(flagId)
    try {
      const response = await csrfFetch(`/api/flags/${flagId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      if (response.ok) {
        setToast(`Flag resolved with action: ${action}`)
        setTimeout(() => setToast(null), 3000)
        const reloadResponse = await fetch(`/api/flags?status=${filter}`)
        if (reloadResponse.ok) {
          const data = await reloadResponse.json()
          setFlags(data.flags)
        }
      } else {
        const data = await response.json()
        setToast(data.error || 'Failed to resolve flag')
        setTimeout(() => setToast(null), 3000)
      }
    } catch (error) {
      console.error('Error resolving flag:', error)
      setToast('Failed to resolve flag')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setResolving(null)
    }
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Flag Review</h1>
        <div className="flex gap-2">
          {(['pending', 'resolved', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : flags.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🚩</div>
          <h2 className="text-xl font-semibold text-white mb-2">No flags to review</h2>
          <p className="text-gray-400">
            {filter === 'pending' ? 'All flags have been resolved!' : 'No flags found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
            >
              <div className="flex">
                {flag.image && (
                  <div className="w-48 h-48 flex-shrink-0">
                    <img
                      src={flag.image.url}
                      alt="Flagged content"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-yellow-600 text-white text-xs rounded">
                          {FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          flag.status === 'pending'
                            ? 'bg-yellow-900/50 text-yellow-400'
                            : 'bg-green-900/50 text-green-400'
                        }`}>
                          {flag.status}
                        </span>
                        {flag.action_taken && (
                          <span className="text-xs text-gray-400">
                            Action: {ACTION_LABELS[flag.action_taken]?.label || flag.action_taken}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-300 text-sm mt-1">{flag.comment}</p>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(flag.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {flag.crag && (
                    <p className="text-sm text-gray-400 mb-2">
                      Crag: <span className="text-white">{flag.crag.name}</span>
                    </p>
                  )}

                  {flag.climbs && (
                    <p className="text-sm text-gray-400 mb-2">
                      Climb: <span className="text-white">{flag.climbs.name}</span> ({flag.climbs.grade})
                    </p>
                  )}

                  {flag.flagger && (
                    <p className="text-xs text-gray-500 mb-3">
                      Flagged by: {flag.flagger.username || flag.flagger.email}
                    </p>
                  )}

                  {flag.status === 'pending' && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleResolve(flag.id, 'keep')}
                        disabled={resolving === flag.id}
                        className={`flex items-center gap-2 px-4 py-2 ${ACTION_LABELS.keep.color} text-white rounded-lg font-medium disabled:opacity-50 transition-colors`}
                      >
                        <Check className="w-4 h-4" />
                        Keep
                      </button>
                      <button
                        onClick={() => handleResolve(flag.id, 'remove')}
                        disabled={resolving === flag.id}
                        className={`flex items-center gap-2 px-4 py-2 ${ACTION_LABELS.remove.color} text-white rounded-lg font-medium disabled:opacity-50 transition-colors`}
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
