'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Edit2, Trash2, Mountain, ArrowRightLeft } from 'lucide-react'
import { csrfFetch } from '@/hooks/useCsrf'
import RenameCragModal from './components/RenameCragModal'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'

interface Crag {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  rock_type: string | null
  type: string | null
  region_tag: string | null
  sub_area: string | null
  has_primary_region_tag: boolean
  climb_count: number
  image_count: number
  route_type_counts?: Array<{ type: string; count: number }>
}

interface CragImageRouteCandidate {
  imageId: string
  imageUrl: string | null
  createdAt: string | null
  climbCount: number
  climbNames: string[]
}

interface MoveImageState {
  sourceCrag: Crag
  imageId: string
}

function formatRouteTypeLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/_/g, '-').replace('bouldering', 'boulder')
  return normalized
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function AdminCragsPage() {
  const [crags, setCrags] = useState<Crag[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [missingRegionOnly, setMissingRegionOnly] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [renamingCrag, setRenamingCrag] = useState<Crag | null>(null)
  const [removingCrag, setRemovingCrag] = useState<Crag | null>(null)
  const [movingImage, setMovingImage] = useState<MoveImageState | null>(null)
  const [moveCandidates, setMoveCandidates] = useState<CragImageRouteCandidate[]>([])
  const [loadingMoveCandidates, setLoadingMoveCandidates] = useState(false)
  const [selectedTargetCragId, setSelectedTargetCragId] = useState('')
  const [movingPublishedImage, setMovingPublishedImage] = useState(false)
  const [confirmCount, setConfirmCount] = useState('')
  const [deleting, setDeleting] = useState(false)

  const closeDeleteConfirm = () => {
    setRemovingCrag(null)
    setConfirmCount('')
  }

  const closeMoveDialog = () => {
    setMovingImage(null)
    setMoveCandidates([])
    setSelectedTargetCragId('')
  }

  useOverlayHistory({ open: Boolean(removingCrag), onClose: closeDeleteConfirm, id: 'admin-delete-crag' })
  useOverlayHistory({ open: Boolean(movingImage), onClose: closeMoveDialog, id: 'admin-move-published-image' })

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

  const handleRename = async (cragId: string, data: { name: string; rock_type: string | null; region_tag: string; sub_area: string | null }) => {
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
    if (confirmCount !== String(removingCrag.climb_count)) {
      setToast('Type the climb count exactly to confirm')
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
        setConfirmCount('')
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

  const handleOpenMoveDialog = async (crag: Crag) => {
    setMovingImage({ sourceCrag: crag, imageId: '' })
    setMoveCandidates([])
    setSelectedTargetCragId('')
    setLoadingMoveCandidates(true)

    try {
      const response = await fetch(`/api/crags/${crag.id}/images`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as {
        images?: Array<{ id?: string; signed_url?: string | null; created_at?: string | null }>
      }

      if (!response.ok || !Array.isArray(data.images)) {
        setToast('Failed to load published route images for this crag')
        setTimeout(() => setToast(null), 3000)
        return
      }

      const candidateRequests = data.images
        .map((image) => (typeof image.id === 'string' && image.id
          ? { imageId: image.id, imageUrl: image.signed_url ?? null, createdAt: image.created_at ?? null }
          : null))
        .filter((image): image is { imageId: string; imageUrl: string | null; createdAt: string | null } => image !== null)

      const candidateResults = await Promise.all(candidateRequests.map(async (candidate) => {
        const routeResponse = await fetch(`/api/image/${candidate.imageId}/routes`, { cache: 'no-store' })
        const routeData = await routeResponse.json().catch(() => ({})) as {
          routes?: Array<{ climb?: { name?: string | null } | null }>
        }
        const routes = Array.isArray(routeData.routes) ? routeData.routes : []
        if (!routeResponse.ok || routes.length === 0) return null
        return {
          imageId: candidate.imageId,
          imageUrl: candidate.imageUrl,
          createdAt: candidate.createdAt,
          climbCount: routes.length,
          climbNames: routes
            .map((route) => route.climb?.name?.trim() || 'Unnamed route')
            .slice(0, 3),
        } satisfies CragImageRouteCandidate
      }))

      const nextCandidates = candidateResults.filter((candidate): candidate is CragImageRouteCandidate => candidate !== null)
      setMoveCandidates(nextCandidates)
      if (nextCandidates.length > 0) {
        setMovingImage({ sourceCrag: crag, imageId: nextCandidates[0].imageId })
      }
    } catch (error) {
      console.error('Error loading move candidates:', error)
      setToast('Failed to load published route images for this crag')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setLoadingMoveCandidates(false)
    }
  }

  const handleMovePublishedImage = async () => {
    if (!movingImage?.imageId || !selectedTargetCragId) return

    setMovingPublishedImage(true)
    try {
      const response = await csrfFetch(`/api/admin/images/${movingImage.imageId}/move-crag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCragId: selectedTargetCragId }),
      })
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string }

      if (!response.ok) {
        setToast(payload.error || 'Failed to move published image')
        setTimeout(() => setToast(null), 4000)
        return
      }

      setToast(payload.message || 'Published image moved')
      setTimeout(() => setToast(null), 4000)
      closeMoveDialog()
      void loadCrags()
    } catch (error) {
      console.error('Error moving published image:', error)
      setToast('Failed to move published image')
      setTimeout(() => setToast(null), 4000)
    } finally {
      setMovingPublishedImage(false)
    }
  }

  const missingRegionCount = crags.filter((crag) => !crag.has_primary_region_tag).length

  const filteredCrags = crags
    .filter((crag) => {
      const query = search.toLowerCase()
      const matchesSearch = (
        crag.name.toLowerCase().includes(query)
        || (crag.region_tag || '').toLowerCase().includes(query)
        || (crag.sub_area || '').toLowerCase().includes(query)
      )
      if (!matchesSearch) return false
      if (!missingRegionOnly) return true
      return !crag.has_primary_region_tag
    })
    .sort((a, b) => {
      if (b.climb_count !== a.climb_count) return b.climb_count - a.climb_count
      return a.name.localeCompare(b.name)
    })

  const targetCragOptions = useMemo(() => {
    if (!movingImage) return []
    return crags.filter((crag) => crag.id !== movingImage.sourceCrag.id)
  }, [crags, movingImage])

  const selectedMoveCandidate = moveCandidates.find((candidate) => candidate.imageId === movingImage?.imageId) || null

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

      {movingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex items-center gap-3 text-blue-400 mb-4">
              <ArrowRightLeft className="w-6 h-6" />
              <h2 className="text-xl font-bold text-white">Move Published Route Image</h2>
            </div>

            <p className="text-sm text-gray-300 mb-4">
              Move one published route image and its linked climbs from <span className="font-semibold text-white">{movingImage.sourceCrag.name}</span> to another crag.
            </p>

            {loadingMoveCandidates ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading published route images...
              </div>
            ) : moveCandidates.length === 0 ? (
              <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-6 text-sm text-gray-400">
                No published route images with routes were found for this crag.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Published route image</label>
                  <select
                    value={movingImage.imageId}
                    onChange={(event) => setMovingImage((current) => current ? { ...current, imageId: event.target.value } : current)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                  >
                    {moveCandidates.map((candidate, index) => (
                      <option key={candidate.imageId} value={candidate.imageId}>
                        {`Image ${index + 1} • ${candidate.climbCount} routes`}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedMoveCandidate ? (
                  <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                    <div className="flex gap-4">
                      <div className="h-28 w-28 overflow-hidden rounded-lg bg-gray-800 shrink-0">
                        {selectedMoveCandidate.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={selectedMoveCandidate.imageUrl} alt="Published route preview" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="space-y-2 text-sm text-gray-300">
                        <p><span className="font-medium text-white">Routes:</span> {selectedMoveCandidate.climbCount}</p>
                        <p><span className="font-medium text-white">Names:</span> {selectedMoveCandidate.climbNames.join(', ')}</p>
                        <p><span className="font-medium text-white">Image ID:</span> <span className="text-gray-400">{selectedMoveCandidate.imageId}</span></p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Target crag</label>
                  <select
                    value={selectedTargetCragId}
                    onChange={(event) => setSelectedTargetCragId(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                  >
                    <option value="">Select target crag</option>
                    {targetCragOptions.map((crag) => (
                      <option key={crag.id} value={crag.id}>
                        {crag.name}{crag.region_tag ? ` • ${crag.region_tag}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeMoveDialog}
                className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMovePublishedImage}
                disabled={loadingMoveCandidates || moveCandidates.length === 0 || !movingImage.imageId || !selectedTargetCragId || movingPublishedImage}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {movingPublishedImage ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Move image and routes'}
              </button>
            </div>
          </div>
        </div>
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
               This will <span className="text-red-500 font-bold">permanently delete</span> the crag <span className="font-semibold text-white">{removingCrag.name}</span>,
               {' '}
               <span className="font-semibold text-white">{removingCrag.climb_count} climbs</span>, and
               {' '}
               <span className="font-semibold text-white">{removingCrag.image_count} images</span>. This action cannot be undone.
              </p>

              <p className="text-white mb-2">
               Type <span className="font-bold text-yellow-500">{removingCrag.climb_count}</span> to confirm:
              </p>

              <input
                type="text"
                value={confirmCount}
                onChange={(e) => setConfirmCount(e.target.value)}
                placeholder="Type climb count..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 mb-4"
              />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  closeDeleteConfirm()
                }}
                className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={confirmCount !== String(removingCrag.climb_count) || deleting}
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMissingRegionOnly((prev) => !prev)}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
              missingRegionOnly
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Missing Region Tag ({missingRegionCount})
          </button>
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
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Location</th>
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
                          {crag.latitude != null && crag.longitude != null
                            ? `${crag.latitude.toFixed(4)}, ${crag.longitude.toFixed(4)}`
                            : 'No coordinates'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {crag.has_primary_region_tag && crag.region_tag ? (
                        <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded">
                          Region: {crag.region_tag}
                        </span>
                      ) : crag.region_tag ? (
                        <span className="px-2 py-1 bg-amber-900/50 text-amber-300 text-xs rounded">
                          Unlinked Region: {crag.region_tag}
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-900/40 text-red-300 text-xs rounded">
                          Missing region tag
                        </span>
                      )}
                      {crag.sub_area && (
                        <span className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded">
                          Sub-area: {crag.sub_area}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-blue-900/50 text-blue-400 text-xs rounded capitalize">
                      {crag.route_type_counts && crag.route_type_counts.length > 0
                        ? crag.route_type_counts
                            .map((entry) => `${formatRouteTypeLabel(entry.type)} (${entry.count})`)
                            .join(' · ')
                        : (crag.type ? formatRouteTypeLabel(crag.type) : 'N/A')}
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
                        onClick={() => void handleOpenMoveDialog(crag)}
                        className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                        title="Move published route image"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>
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
