'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DraftPayload, DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'
import {
  canRestoreDraftEditorCheckpoint,
  clearDraftEditorCheckpoint,
  readDraftEditorCheckpoint,
  writeDraftEditorCheckpoint,
} from '@/features/draft-editor/lib/draft-editor-checkpoint'

interface UseDraftEditorCheckpointParams {
  draft: DraftPayload | null
  currentUserId: string | null
  routesByImageId: Record<string, DraftRoute[]>
  sectorId: string | null
  setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>
  setSectorId: (value: string | null) => void
  markRecoveredChanges: (imageIds: string[], sectorChanged: boolean) => void
}

export function useDraftEditorCheckpoint({
  draft,
  currentUserId,
  routesByImageId,
  sectorId,
  setRoutesByImageId,
  setSectorId,
  markRecoveredChanges,
}: UseDraftEditorCheckpointParams) {
  const revisionRef = useRef(0)
  const savedRevisionRef = useRef(0)
  const restoreTokenRef = useRef<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [readyToken, setReadyToken] = useState<string | null>(null)

  const markCheckpointChanged = useCallback(() => {
    const nextRevision = Math.max(Date.now(), revisionRef.current + 1)
    revisionRef.current = nextRevision
    setRevision(nextRevision)
  }, [])

  const getCheckpointRevision = useCallback(() => revisionRef.current, [])

  const clearCheckpointAfterSave = useCallback(async (savingRevision: number) => {
    if (!currentUserId || !draft || savingRevision === 0 || revisionRef.current !== savingRevision) return
    savedRevisionRef.current = savingRevision
    await clearDraftEditorCheckpoint(currentUserId, draft.id, savingRevision)
  }, [currentUserId, draft])

  useEffect(() => {
    if (!currentUserId || !draft) return
    const token = `${currentUserId}:${draft.id}:${draft.updated_at}`
    if (restoreTokenRef.current === token) return
    restoreTokenRef.current = token
    let cancelled = false

    void readDraftEditorCheckpoint(currentUserId, draft.id).then((checkpoint) => {
      if (cancelled) return
      const canRecover = checkpoint && canRestoreDraftEditorCheckpoint(checkpoint, {
        updatedAt: draft.updated_at,
        lastEditedBy: draft.last_edited_by,
      }, currentUserId)
      if (canRecover) {
        const draftImageIds = new Set(draft.images.map((image) => image.id))
        const recoveredRoutes = Object.fromEntries(
          Object.entries(checkpoint.routesByImageId).filter(([imageId]) => draftImageIds.has(imageId))
        )
        setRoutesByImageId((current) => ({ ...current, ...recoveredRoutes }))
        setSectorId(checkpoint.sectorId)
        revisionRef.current = checkpoint.revision
        setRevision(checkpoint.revision)
        markRecoveredChanges(Object.keys(recoveredRoutes), true)
      }
      setReadyToken(token)
    })

    return () => {
      cancelled = true
    }
  }, [currentUserId, draft, markRecoveredChanges, setRoutesByImageId, setSectorId])

  useEffect(() => {
    if (!currentUserId || !draft || revision === 0 || revision <= savedRevisionRef.current) return
    const token = `${currentUserId}:${draft.id}:${draft.updated_at}`
    if (readyToken !== token) return
    const timeout = window.setTimeout(() => {
      void writeDraftEditorCheckpoint(currentUserId, draft.id, {
        schemaVersion: 1,
        revision,
        serverUpdatedAt: draft.updated_at,
        routesByImageId,
        sectorId,
      })
    }, 150)
    return () => window.clearTimeout(timeout)
  }, [currentUserId, draft, readyToken, revision, routesByImageId, sectorId])

  return {
    markCheckpointChanged,
    getCheckpointRevision,
    clearCheckpointAfterSave,
  }
}
