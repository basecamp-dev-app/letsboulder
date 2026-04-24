'use client'

import { useEffect, useRef, useState } from 'react'
import type { UserResponse } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

interface UseEditDraftHydrationParams {
  collaborationAdded: boolean
  activeImageId: string | null
  loadCollaborators: () => Promise<void>
  addToast: (message: string, tone: 'success' | 'error') => void
  setMode: (mode: 'edit-existing') => void
  setInteractionTool: (tool: 'draw' | 'select') => void
  reset: () => void
  clearCanvasState: () => void
}

export function useEditDraftHydration({
  collaborationAdded,
  activeImageId,
  loadCollaborators,
  addToast,
  setMode,
  setInteractionTool,
  reset,
  clearCanvasState,
}: UseEditDraftHydrationParams) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const hasShownCollabToastRef = useRef(false)
  const previousActiveImageIdRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }: UserResponse) => {
      setCurrentUserId(data.user?.id || null)
    })
  }, [])

  useEffect(() => {
    void loadCollaborators()
  }, [loadCollaborators])

  useEffect(() => {
    if (!collaborationAdded || hasShownCollabToastRef.current) return
    addToast('You were added as a draft collaborator', 'success')
    hasShownCollabToastRef.current = true
  }, [collaborationAdded, addToast])

  useEffect(() => {
    setMode('edit-existing')
    setInteractionTool('draw')
    return () => {
      reset()
    }
  }, [setMode, setInteractionTool, reset])

  useEffect(() => {
    const previousActiveImageId = previousActiveImageIdRef.current

    if (previousActiveImageId && activeImageId && previousActiveImageId !== activeImageId) {
      clearCanvasState()
    }

    previousActiveImageIdRef.current = activeImageId
  }, [activeImageId, clearCanvasState])

  return {
    currentUserId,
  }
}
