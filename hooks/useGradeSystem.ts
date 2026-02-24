'use client'

import { useEffect, useState } from 'react'
import type { GradeSystem } from '@/lib/grades'

const STORAGE_KEY = 'grade_system'
const EVENT_NAME = 'grade-system-changed'

const VALID_SYSTEMS: GradeSystem[] = ['v_scale', 'font_scale', 'yds_equivalent', 'french_equivalent', 'british_equivalent']

let gradePreferencesCache: { boulder: GradeSystem; route: GradeSystem; trad: GradeSystem } | null = null
let gradePreferencesRequest: Promise<{ boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }> | null = null

function normalizeGradeSystem(value: unknown): GradeSystem {
  if (value === 'v') return 'v_scale'
  if (value === 'font') return 'font_scale'
  if (VALID_SYSTEMS.includes(value as GradeSystem)) return value as GradeSystem
  return 'font_scale'
}

function readStoredGradePreferences(): { boulder: GradeSystem; route: GradeSystem; trad: GradeSystem } | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    return {
      boulder: normalizeGradeSystem(parsed.boulder),
      route: normalizeGradeSystem(parsed.route),
      trad: normalizeGradeSystem(parsed.trad),
    }
  } catch {
    const normalized = normalizeGradeSystem(stored)
    return { boulder: normalized, route: 'yds_equivalent', trad: 'yds_equivalent' }
  }
}

function getDefaultPreferences(): { boulder: GradeSystem; route: GradeSystem; trad: GradeSystem } {
  return { boulder: 'v_scale', route: 'yds_equivalent', trad: 'yds_equivalent' }
}

async function fetchGradePreferences(): Promise<{ boulder: GradeSystem; route: GradeSystem; trad: GradeSystem }> {
  if (gradePreferencesCache) return gradePreferencesCache

  const stored = readStoredGradePreferences()
  if (stored) {
    gradePreferencesCache = stored
    return stored
  }

  if (!gradePreferencesRequest) {
    gradePreferencesRequest = fetch('/api/settings')
      .then(async (response) => {
        if (!response.ok) {
          gradePreferencesCache = getDefaultPreferences()
          return gradePreferencesCache
        }
        const data = await response.json()
        const prefs = {
          boulder: normalizeGradeSystem(data?.settings?.boulderSystem),
          route: normalizeGradeSystem(data?.settings?.routeSystem),
          trad: normalizeGradeSystem(data?.settings?.tradSystem),
        }
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

export function updateGradePreference(type: 'boulder' | 'route' | 'trad', value: GradeSystem) {
  if (!gradePreferencesCache) {
    gradePreferencesCache = getDefaultPreferences()
  }
  gradePreferencesCache[type] = value
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gradePreferencesCache))
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: gradePreferencesCache }))
}

export function updateGradeSystemPreference(value: GradeSystem) {
  updateGradePreference('boulder', value)
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
        const next = JSON.parse(event.newValue)
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
        const next = JSON.parse(event.newValue)
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
    case 'deep_water_solo':
      return preferences.route
    case 'trad':
      return preferences.trad
    default:
      return preferences.boulder
  }
}
