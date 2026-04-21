'use client'

const RECENT_LOCAL_STORAGE_KEY = 'lb:recent-local-v1'
const RECENT_LOCAL_MAX_ENTRIES = 24

export type RecentLocalEntryKind = 'crag' | 'image'

interface RecentLocalEntryBase {
  href: string
  savedAt: number
  title: string
  kind: RecentLocalEntryKind
  subtitle?: string
}

export interface RecentLocalCragEntry extends RecentLocalEntryBase {
  kind: 'crag'
}

export interface RecentLocalImageEntry extends RecentLocalEntryBase {
  kind: 'image'
}

export type RecentLocalEntry = RecentLocalCragEntry | RecentLocalImageEntry

function readStorage(): RecentLocalEntry[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(RECENT_LOCAL_STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(RECENT_LOCAL_STORAGE_KEY)
      return []
    }

    return parsed.filter((entry): entry is RecentLocalEntry => {
      if (!entry || typeof entry !== 'object') return false

      const candidate = entry as Partial<RecentLocalEntry>
      return (
        (candidate.kind === 'crag' || candidate.kind === 'image')
        && typeof candidate.href === 'string'
        && typeof candidate.savedAt === 'number'
        && typeof candidate.title === 'string'
        && (typeof candidate.subtitle === 'undefined' || typeof candidate.subtitle === 'string')
      )
    })
  } catch {
    window.localStorage.removeItem(RECENT_LOCAL_STORAGE_KEY)
    return []
  }
}

function writeStorage(entries: RecentLocalEntry[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RECENT_LOCAL_STORAGE_KEY, JSON.stringify(entries))
}

export function listRecentLocalEntries(): RecentLocalEntry[] {
  return readStorage().sort((a, b) => b.savedAt - a.savedAt)
}

export function readMostRecentLocalEntry(): RecentLocalEntry | null {
  return listRecentLocalEntries()[0] || null
}

export function writeRecentLocalEntry(entry: Omit<RecentLocalEntry, 'savedAt'> & { savedAt?: number }) {
  const nextEntry: RecentLocalEntry = {
    ...entry,
    savedAt: entry.savedAt ?? Date.now(),
  } as RecentLocalEntry

  const existing = readStorage().filter((candidate) => candidate.href !== nextEntry.href)
  existing.unshift(nextEntry)
  writeStorage(existing.slice(0, RECENT_LOCAL_MAX_ENTRIES))
}
