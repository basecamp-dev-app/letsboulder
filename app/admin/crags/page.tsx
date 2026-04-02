'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import CragsFilters from '@/app/admin/crags/components/CragsFilters'
import CragsTable from '@/app/admin/crags/components/CragsTable'
import DeleteCragDialog from '@/app/admin/crags/components/DeleteCragDialog'
import MovePublishedImageDialog from '@/app/admin/crags/components/MovePublishedImageDialog'
import RenameCragModal from '@/app/admin/crags/components/RenameCragModal'
import { useAdminCrags } from '@/app/admin/crags/hooks/useAdminCrags'
import { useMovePublishedImage } from '@/app/admin/crags/hooks/useMovePublishedImage'
import type { AdminCrag } from '@/app/admin/crags/types'

export default function AdminCragsPage() {
  const {
    crags,
    deleting,
    loadCrags,
    loading,
    renameCrag,
    deleteCrag,
    showToast,
    toast,
  } = useAdminCrags()
  const [search, setSearch] = useState('')
  const [missingRegionOnly, setMissingRegionOnly] = useState(false)
  const [renamingCrag, setRenamingCrag] = useState<AdminCrag | null>(null)
  const [removingCrag, setRemovingCrag] = useState<AdminCrag | null>(null)
  const {
    closeMoveDialog,
    loadingMoveCandidates,
    moveCandidates,
    movePublishedImage,
    movingImage,
    movingPublishedImage,
    openMoveDialog,
    selectedMoveCandidate,
    selectMoveImageId,
    selectedTargetCragId,
    setSelectedTargetCragId,
  } = useMovePublishedImage(showToast, loadCrags)

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
          onSave={renameCrag}
        />
      )}

      {movingImage && (
        <MovePublishedImageDialog
          loadingMoveCandidates={loadingMoveCandidates}
          moveCandidates={moveCandidates}
          movingImage={movingImage}
          movingPublishedImage={movingPublishedImage}
          onClose={closeMoveDialog}
          onMove={movePublishedImage}
          onSelectImageId={selectMoveImageId}
          onSelectTargetCragId={setSelectedTargetCragId}
          selectedMoveCandidate={selectedMoveCandidate}
          selectedTargetCragId={selectedTargetCragId}
          targetCragOptions={targetCragOptions}
        />
      )}

      {removingCrag && (
        <DeleteCragDialog
          key={removingCrag.id}
          crag={removingCrag}
          deleting={deleting}
          onClose={() => setRemovingCrag(null)}
          onConfirm={(confirmCount) => {
            void deleteCrag(removingCrag, confirmCount)
          }}
        />
      )}

      <CragsFilters
        missingRegionCount={missingRegionCount}
        missingRegionOnly={missingRegionOnly}
        onSearchChange={setSearch}
        onToggleMissingRegionOnly={() => setMissingRegionOnly(prev => !prev)}
        search={search}
      />

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
        <CragsTable
          crags={filteredCrags}
          onDelete={setRemovingCrag}
          onMoveImage={openMoveDialog}
          onRename={setRenamingCrag}
        />
      )}
    </div>
  )
}
