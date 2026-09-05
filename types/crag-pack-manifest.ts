import type { Json } from '@/types/database'

export const CRAG_PACK_SCHEMA_VERSION = 2 as const
export const CRAG_PACK_MIN_READER_VERSION = 2 as const
export const CRAG_PACK_DIGEST_ALGORITHM = 'sha256' as const

export interface CragPackCoordinates {
  latitude: number | null
  longitude: number | null
  visibility: 'exact' | 'approximate' | 'hidden'
}

export interface CragPackAsset {
  id: string
  imageId: string
  variant: 'detail' | 'topo'
  format: 'webp'
  mediaType: 'image/webp'
  url: string
  contentKey: string
  width: number
  height: number
  byteCount: number
  digest: `${typeof CRAG_PACK_DIGEST_ALGORITHM}:${string}`
  requirement: 'required' | 'optional'
  owningImageId: string
  owningClimbIds: string[]
}

export interface CragPackManifestSnapshot {
  schemaVersion: typeof CRAG_PACK_SCHEMA_VERSION
  minReaderVersion: typeof CRAG_PACK_MIN_READER_VERSION
  canonicalPath: string
  requiredOfflineRoutes: string[]
  reader: {
    family: 'letsboulder-offline-field-guide'
    minimumVersion: typeof CRAG_PACK_MIN_READER_VERSION
  }
  metadata: {
    crag: {
      id: string
      name: string
      slug: string
      countryCode: string
      country: string | null
      regionName: string | null
      subArea: string | null
      rockType: string | null
      type: string | null
      tideDependency: string | null
      description: string | null
      accessNotes: string | null
      coordinates: CragPackCoordinates
      updatedAt: string | null
    }
    sectors: Array<{ id: string; name: string }>
    climbs: Array<{
      id: string
      sectorId: string | null
      name: string | null
      slug: string | null
      grade: string
      consensusGrade: string | null
      originalGrade: string | null
      routeType: string | null
      description: string | null
      isVerified: boolean
      verificationCount: number
      coordinates: CragPackCoordinates
      updatedAt: string | null
    }>
    images: Array<{
      id: string
      captureDate: string | null
      faceDirection: string | null
      faceDirections: string[]
      faceOrder: number | null
      isPrimary: boolean
      width: number | null
      height: number | null
      coordinates: CragPackCoordinates
      processedAt: string | null
      assetVersion: number
    }>
    routeLines: Array<{
      id: string
      climbId: string
      imageId: string
      sequenceOrder: number | null
      color: string | null
      imageWidth: number | null
      imageHeight: number | null
      points: Json
    }>
  }
  assets: CragPackAsset[]
}

export interface CragPackManifest extends CragPackManifestSnapshot {
  type: 'crag'
  packId: string
  cragId: string
  cragName: string
  cragVersionHash: string
  exactTotalBytes: number
  /** Compatibility alias; exact for Pack v2. */
  estimatedBytes: number
  mediaUrls: string[]
  climbs: Array<{ climbId: string; mediaUrls: string[] }>
  contentVersion: string
  generatedAt: string
}
