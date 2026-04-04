'use client'

import { useEffect, useState } from 'react'
import type { GradeSystem } from '@/lib/grades'

const STORAGE_KEY = 'grade_system'
const EVENT_NAME = 'grade-system-changed'

const VALID_SYSTEMS: GradeSystem[] = ['v_scale', 'font_scale', 'yds_equivalent', 'french_equivalent', 'british_equivalent']

let gradePreferencesCache: { boulder: GradeSystem; route: GradeSystem; trad: GradeSystem } | null = null
let gradePreferencesRequest: Promise<{ boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }> | null = null

type GradePreferences = { boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }

function normalizeGradeSystem(value: unknown): GradeSystem {
  if (value === 'v') return 'v_scale'
  if (value === 'font') return 'font_scale'
  if (VALID_SYSTEMS.includes(value as GradeSystem)) return value as GradeSystem
  return 'font_scale'
}

function normalizeGradePreferences(value: unknown): GradePreferences {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
  return {
    boulder: normalizeGradeSystem(record?.boulder),
    route: normalizeGradeSystem(record?.route ?? 'yds_equivalent'),
    trad: normalizeGradeSystem(record?.trad ?? 'yds_equivalent'),
  }
}

function readStoredGradePreferences(): GradePreferences | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    return normalizeGradePreferences(JSON.parse(stored))
  } catch {
    const normalized = normalizeGradeSystem(stored)
    return { boulder: normalized, route: 'yds_equivalent', trad: 'yds_equivalent' }
  }
}

function getDefaultPreferences(): GradePreferences {
  return { boulder: 'v_scale', route: 'yds_equivalent', trad: 'yds_equivalent' }
}

async function fetchGradePreferences(): Promise<GradePreferences> {
  const stored = readStoredGradePreferences()
  if (stored && !gradePreferencesCache) {
    gradePreferencesCache = stored
  }

  if (!gradePreferencesRequest) {
    gradePreferencesRequest = fetch('/api/settings')
      .then(async (response) => {
        if (!response.ok) {
          gradePreferencesCache = getDefaultPreferences()
          return gradePreferencesCache
        }
        const data = await response.json()
        const prefs = normalizeGradePreferences({
          boulder: normalizeGradeSystem(data?.settings?.boulderSystem),
          route: normalizeGradeSystem(data?.settings?.routeSystem),
          trad: normalizeGradeSystem(data?.settings?.tradSystem),
        })
        gradePreferencesCache = prefs
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
        }
        return prefs
      })
      .catch(() => {
        gradePreferencesCache = getDefaultPreferences()
        return gradePreferencesCache
      })
      .finally(() => {
        gradePreferencesRequest = null
      })
  }

  return gradePreferencesRequest
}

function writeGradePreferences(next: GradePreferences) {
  gradePreferencesCache = next
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
}

export function updateGradePreferences(next: Partial<GradePreferences>) {
  const current = gradePreferencesCache || readStoredGradePreferences() || getDefaultPreferences()
  writeGradePreferences({
    boulder: next.boulder ? normalizeGradeSystem(next.boulder) : current.boulder,
    route: next.route ? normalizeGradeSystem(next.route) : current.route,
    trad: next.trad ? normalizeGradeSystem(next.trad) : current.trad,
  })
}

export function useGradeSystem() {
  const [prefs, setPrefs] = useState<{ boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }>(() =>
    gradePreferencesCache || readStoredGradePreferences() || getDefaultPreferences()
  )

  useEffect(() => {
    let mounted = true
    fetchGradePreferences().then((next) => {
      if (!mounted) return
      setPrefs(next)
    })

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        const next = normalizeGradePreferences(JSON.parse(event.newValue))
        gradePreferencesCache = next
        setPrefs(next)
      } catch {}
    }

    const onPreferenceChange = (event: Event) => {
      const next = (event as CustomEvent<{ boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }>).detail
      gradePreferencesCache = next
      setPrefs(next)
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(EVENT_NAME, onPreferenceChange)

    return () => {
      mounted = false
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(EVENT_NAME, onPreferenceChange)
    }
  }, [])

  return prefs.boulder
}

export function useGradePreferences() {
  const [prefs, setPrefs] = useState<{ boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }>(() =>
    gradePreferencesCache || readStoredGradePreferences() || getDefaultPreferences()
  )

  useEffect(() => {
    let mounted = true
    fetchGradePreferences().then((next) => {
      if (!mounted) return
      setPrefs(next)
    })

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        const next = normalizeGradePreferences(JSON.parse(event.newValue))
        gradePreferencesCache = next
        setPrefs(next)
      } catch {}
    }

    const onPreferenceChange = (event: Event) => {
      const next = (event as CustomEvent<{ boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }>).detail
      gradePreferencesCache = next
      setPrefs(next)
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(EVENT_NAME, onPreferenceChange)

    return () => {
      mounted = false
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(EVENT_NAME, onPreferenceChange)
    }
  }, [])

  return prefs
}

export function getGradeSystemForClimbType(
  climbType: string | undefined,
  preferences: { boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }
): GradeSystem {
  switch (climbType) {
    case 'boulder':
      return preferences.boulder
    case 'sport':
    case 'deep-water-solo':
    case 'deep_water_solo':
      return preferences.route
    case 'trad':
      return preferences.trad
    default:
      return preferences.boulder
  }
}
