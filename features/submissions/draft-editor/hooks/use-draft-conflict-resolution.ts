'use client'

import { useCallback, useMemo, useState } from 'react'

export interface DraftConflictState {
  serverUpdatedAt: string
  lastEditorName: string | null
  pendingChanges: unknown
}

export function useDraftConflictResolution() {
  const [conflict, setConflict] = useState<DraftConflictState | null>(null)

  const hasConflict = useMemo(() => conflict !== null, [conflict])

  const clearConflict = useCallback(() => setConflict(null), [])

  return {
    conflict,
    setConflict,
    clearConflict,
    hasConflict,
  }
}
