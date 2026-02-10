'use client'

import { useEffect, useState } from 'react'
import type { GradeSystem } from '@/lib/grade-display'

const STORAGE_KEY = 'grade_system'
const EVENT_NAME = 'grade-system-changed'

let gradeSystemCache: GradeSystem | null = null
let gradeSystemRequest: Promise<GradeSystem> | null = null

function normalizeGradeSystem(value: unknown): GradeSystem {
  return value === 'v' ? 'v' : 'font'
}

function readStoredGradeSystem(): GradeSystem | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored ? normalizeGradeSystem(stored) : null
}

async function fetchGradeSystem(): Promise<GradeSystem> {
  if (gradeSystemCache) return gradeSystemCache

  const stored = readStoredGradeSystem()
  if (stored) {
    gradeSystemCache = stored
    return stored
  }

  if (!gradeSystemRequest) {
    gradeSystemRequest = fetch('/api/settings')
      .then(async (response) => {
        if (!response.ok) {
          gradeSystemCache = 'font'
          return 'font' as const
        }
        const data = await response.json()
        const next = normalizeGradeSystem(data?.settings?.gradeSystem)
        gradeSystemCache = next
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, next)
        }
        return next
      })
      .catch(() => {
        gradeSystemCache = 'font'
        return 'font' as const
      })
      .finally(() => {
        gradeSystemRequest = null
      })
  }

  return gradeSystemRequest
}

export function updateGradeSystemPreference(next: GradeSystem) {
  gradeSystemCache = next
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, next)
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
}

export function useGradeSystem() {
  const [gradeSystem, setGradeSystem] = useState<GradeSystem>(() => gradeSystemCache || readStoredGradeSystem() || 'font')

  useEffect(() => {
    let mounted = true
    fetchGradeSystem().then((next) => {
      if (!mounted) return
      setGradeSystem(next)
    })

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      const next = normalizeGradeSystem(event.newValue)
      gradeSystemCache = next
      setGradeSystem(next)
    }

    const onPreferenceChange = (event: Event) => {
      const next = normalizeGradeSystem((event as CustomEvent<GradeSystem>).detail)
      gradeSystemCache = next
      setGradeSystem(next)
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(EVENT_NAME, onPreferenceChange)

    return () => {
      mounted = false
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(EVENT_NAME, onPreferenceChange)
    }
  }, [])

  return gradeSystem
}
