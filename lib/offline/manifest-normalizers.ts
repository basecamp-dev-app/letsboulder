import type { ClimbOfflinePackManifest, CragOfflinePackManifest } from '@/features/climb/lib/queries'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import type { OfflinePackRecord } from '@/lib/offline/storage'

export function buildPackRecord(input: {
  packId: string
  type: 'climb' | 'crag'
  entityId: string
  displayName: string
  canonicalPath: string
  versionHash: string
  estimatedBytes: number
  mediaCount: number
  coverImageUrl?: string | null
  tileCount?: number
  childClimbCount?: number
  lastAutoSyncAt?: string | null
  lastAccessedAt?: string | null
  priorityClass?: 'saved-climb' | 'saved-crag' | null
}): OfflinePackRecord {
  const now = new Date().toISOString()
  return {
    ...input,
    savedAt: now,
    lastSyncedAt: now,
    lastAutoSyncAt: input.lastAutoSyncAt || null,
    lastAccessedAt: input.lastAccessedAt || now,
    priorityClass: input.priorityClass || null,
    syncState: 'idle',
  }
}

export function getClimbPackManifest(packOrPayload: ClimbOfflinePackManifest | { offline_pack: ClimbOfflinePackManifest }) {
  return 'offline_pack' in packOrPayload ? packOrPayload.offline_pack : packOrPayload
}

export function normalizeClimbManifest(manifest: ClimbOfflinePackManifest): ClimbOfflinePackManifest {
  return {
    ...manifest,
    offlineLaunchUrl: manifest.offlineLaunchUrl || manifest.imageFirstUrl || manifest.canonicalPath || manifest.pageUrl,
    coverImageUrl: resolveRouteImageUrl(manifest.coverImageUrl),
    primaryPin: manifest.primaryPin
      ? {
          ...manifest.primaryPin,
          coverImageUrl: resolveRouteImageUrl(manifest.primaryPin.coverImageUrl),
        }
      : manifest.primaryPin,
  }
}

export function normalizeCragManifest(manifest: CragOfflinePackManifest): CragOfflinePackManifest {
  return {
    ...manifest,
    offlineLaunchUrl: manifest.offlineLaunchUrl || manifest.canonicalPath,
    climbs: manifest.climbs.map((climb) => ({
      ...climb,
      coverImageUrl: resolveRouteImageUrl(climb.coverImageUrl),
      primaryPin: climb.primaryPin
        ? {
            ...climb.primaryPin,
            coverImageUrl: resolveRouteImageUrl(climb.primaryPin.coverImageUrl),
          }
        : climb.primaryPin,
    })),
    savedPins: manifest.savedPins?.map((pin) => ({
      ...pin,
      coverImageUrl: resolveRouteImageUrl(pin.coverImageUrl),
    })),
  }
}
