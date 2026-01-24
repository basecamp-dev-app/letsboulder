'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search, Edit2, Trash2, Mountain } from 'lucide-react'
import { csrfFetch } from '@/hooks/useCsrf'
import RenameCragModal from './components/RenameCragModal'

interface Crag {
  id: string
  name: string
  latitude: number
  longitude: number
  rock_type: string | null
  type: string | null
  climb_count: number
  image_count: number
}

export default function AdminCragsPage() {
  const [crags, setCrags] = useState<Crag[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [renamingCrag, setRenamingCrag] = useState<Crag | null>(null)
  const [removingCrag, setRemovingCrag] = useState<Crag | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadCrags()
  }, [])

  const loadCrags = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/crags?admin=true')
      if (response.ok) {
        const data = await response.json()
        setCrags(data.crags)
      }
    } catch (error) {
      console.error('Error loading crags:', error)
      setToast('Failed to load crags')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setLoading(false)
    }
  }

  const handleRename = async (cragId: string, data: { name: string; rock_type: string | null; type: string | null }) => {
    try {
      const response = await csrfFetch(`/api/crags/${cragId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        setToast('Crag renamed successfully')
        setTimeout(() => setToast(null), 3000)
        loadCrags()
      } else {
        const errorData = await response.json()
        setToast(errorData.error || 'Failed to rename crag')
        setTimeout(() => setToast(null), 3000)
      }
    } catch (error) {
      console.error('Error renaming crag:', error)
      setToast('Failed to rename crag')
      setTimeout(() => setToast(null), 3000)
    }
  }

  const handleRemove = async () => {
    if (!removingCrag) return
    if (confirmName !== removingCrag.name) {
      setToast('Type the crag name exactly to confirm')
      setTimeout(() => setToast(null), 3000)
      return
    }

    setDeleting(true)
    try {
      const response = await csrfFetch(`/api/crags/${removingCrag.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setToast(`Crag "${removingCrag.name}" deleted`)
        setTimeout(() => setToast(null), 3000)
        setRemovingCrag(null)
        setConfirmName('')
        loadCrags()
      } else {
        const errorData = await response.json()
        setToast(errorData.error || 'Failed to delete crag')
        setTimeout(() => setToast(null), 3000)
      }
    } catch (error) {
      console.error('Error deleting crag:', error)
      setToast('Failed to delete crag')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setDeleting(false)
    }
  }

  const filteredCrags = crags.filter(crag =>
    crag.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {renamingCrag && (
        <RenameCragModal
          crag={renamingCrag}
          onClose={() => setRenamingCrag(null)}
          onSave={handleRename}
        />
      )}

      {removingCrag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <Trash2 className="w-6 h-6" />
              <h2 className="text-xl font-bold text-white">Delete Crag</h2>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <p className="text-white font-medium">{removingCrag.name}</p>
              <div className="flex gap-4 mt-2 text-sm text-gray-400">
                <span>{removingCrag.climb_count} climbs</span>
                <span>{removingCrag.image_count} images</span>
              </div>
            </div>

            <p className="text-gray-300 mb-4">
              This will <span className="text-red-500 font-bold">permanently delete</span> this crag and all associated climbs and images. This action cannot be undone.
            </p>

            <p className="text-white mb-2">
              Type <span className="font-bold text-yellow-500">{removingCrag.name}</span> to confirm:
            </p>

            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Type crag name..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setRemovingCrag(null)
                  setConfirmName('')
                }}
                className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={confirmName !== removingCrag.name || deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Crags</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search crags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredCrags.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🏔️</div>
          <h2 className="text-xl font-semibold text-white mb-2">No crags found</h2>
          <p className="text-gray-400">
            {search ? 'Try a different search term' : 'No crags in the database'}
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-800">
              <tr>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Crag Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Type</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Rock</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Climbs</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Images</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredCrags.map((crag) => (
                <tr key={crag.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Mountain className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-white font-medium">{crag.name}</p>
                        <p className="text-xs text-gray-500">
                          {crag.latitude.toFixed(4)}, {crag.longitude.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-blue-900/50 text-blue-400 text-xs rounded capitalize">
                      {crag.type || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded capitalize">
                      {crag.rock_type || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{crag.climb_count}</td>
                  <td className="px-4 py-3 text-gray-300">{crag.image_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setRenamingCrag(crag)}
                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="Rename"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRemovingCrag(crag)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
