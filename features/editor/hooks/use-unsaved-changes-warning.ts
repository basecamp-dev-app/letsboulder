'use client'

import { useEffect } from 'react'

export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return

      event.preventDefault()
      event.returnValue = true
    }

    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])
}
