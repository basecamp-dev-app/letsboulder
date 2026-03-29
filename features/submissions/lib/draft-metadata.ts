import { FACE_DIRECTIONS, type FaceDirection } from '@/features/submissions/lib/submission-types'

export type OrientationDirection = FaceDirection

export interface DraftImageMetadataV2 {
  imageId: string
  displayOrder: number
  orientation?: OrientationDirection[]
  locationMode?: 'shared' | 'custom'
  gps?: {
    latitude: number | null
    longitude: number | null
  }
}

export interface DraftMetadataV2 {
  version: 2
  navigation: {
    defaultImageId: string | null
  }
  images: Record<string, DraftImageMetadataV2>
  submission: {
    routeType: string
    location: {
      latitude: number | null
      longitude: number | null
      countryId?: string | null
      countryCode?: string | null
      countryName?: string | null
      adminRegionName?: string | null
      unRegionName?: string | null
      continentName?: string | null
    } | null
    isAnonymousSubmission: boolean
    contributionCreditPlatform: string | null
    contributionCreditHandle: string | null
    sectorId?: string | null
    canvasSource?: {
      kind: 'draft-image' | 'crag-image'
      draftImageId?: string
      cragImageId?: string
      cragId?: string
    } | null
  }
}

export interface LegacyDraftMetadata {
  version?: 1
  primaryIndex?: number
  faceDirectionsByImage?: Record<number, OrientationDirection[]>
  routeType?: string
  location?: { latitude: number | null; longitude: number | null } | null
  isAnonymousSubmission?: boolean
  contributionCreditPlatform?: string | null
  contributionCreditHandle?: string | null
}

interface DraftImageRowLike {
  id: string
  display_order: number
  latitude?: number | null
  longitude?: number | null
}

function normalizeOrientation(value: unknown): OrientationDirection[] {
  if (!Array.isArray(value)) return []
  return FACE_DIRECTIONS.filter((direction) => value.includes(direction))
}

function normalizeLocationMode(value: unknown, hasGps: boolean): 'shared' | 'custom' {
  if (value === 'shared' || value === 'custom') return value
  return hasGps ? 'custom' : 'shared'
}

export function normalizeDraftMetadata(
  rawMetadata: Record<string, unknown> | null | undefined,
  draftImages: DraftImageRowLike[]
): DraftMetadataV2 {
  if (rawMetadata?.version === 2) {
    const metadata = rawMetadata as unknown as DraftMetadataV2
    return {
      version: 2,
      navigation: {
        defaultImageId: metadata.navigation?.defaultImageId || null,
      },
      images: Object.entries(metadata.images || {}).reduce<Record<string, DraftImageMetadataV2>>((acc, [imageId, image]) => {
        const candidate = image as DraftImageMetadataV2
        const hasGps = typeof candidate.gps?.latitude === 'number' && typeof candidate.gps?.longitude === 'number'
        acc[imageId] = {
          ...candidate,
          imageId: candidate.imageId || imageId,
          displayOrder: typeof candidate.displayOrder === 'number' ? candidate.displayOrder : 0,
          orientation: normalizeOrientation(candidate.orientation),
          locationMode: normalizeLocationMode(candidate.locationMode, hasGps),
          gps: {
            latitude: typeof candidate.gps?.latitude === 'number' ? candidate.gps.latitude : null,
            longitude: typeof candidate.gps?.longitude === 'number' ? candidate.gps.longitude : null,
          },
        }
        return acc
      }, {}),
      submission: {
        routeType: metadata.submission?.routeType || 'sport',
        location: metadata.submission?.location || null,
        isAnonymousSubmission: metadata.submission?.isAnonymousSubmission === true,
        contributionCreditPlatform: metadata.submission?.contributionCreditPlatform || null,
        contributionCreditHandle: metadata.submission?.contributionCreditHandle || null,
        sectorId: metadata.submission?.sectorId || null,
        canvasSource: metadata.submission?.canvasSource || null,
      },
    }
  }

  const legacy = (rawMetadata || {}) as LegacyDraftMetadata
  const orderedImages = [...draftImages].sort((a, b) => a.display_order - b.display_order)

  const defaultImageId =
    typeof legacy.primaryIndex === 'number' && orderedImages[legacy.primaryIndex]
      ? orderedImages[legacy.primaryIndex]?.id || null
      : orderedImages[0]?.id || null

  const images = orderedImages.reduce<Record<string, DraftImageMetadataV2>>((acc, image, index) => {
    acc[image.id] = {
      imageId: image.id,
      displayOrder: image.display_order,
      orientation: normalizeOrientation(legacy.faceDirectionsByImage?.[index]),
      locationMode: normalizeLocationMode(undefined, typeof image.latitude === 'number' && typeof image.longitude === 'number'),
      gps: {
        latitude: typeof image.latitude === 'number' ? image.latitude : null,
        longitude: typeof image.longitude === 'number' ? image.longitude : null,
      },
    }
    return acc
  }, {})

  return {
    version: 2,
    navigation: {
      defaultImageId,
    },
    images,
    submission: {
      routeType: legacy.routeType || 'sport',
      // Normalize v1 location (metadata.location) to v2 structure (metadata.submission.location)
      location: legacy.location || null,
      isAnonymousSubmission: legacy.isAnonymousSubmission === true,
      contributionCreditPlatform: legacy.contributionCreditPlatform || null,
      contributionCreditHandle: legacy.contributionCreditHandle || null,
      canvasSource: null,
    },
  }
}

export function serializeDraftMetadataV2(metadata: DraftMetadataV2): DraftMetadataV2 {
  return {
    version: 2,
    navigation: {
      defaultImageId: metadata.navigation.defaultImageId,
    },
    images: metadata.images,
    submission: {
      routeType: metadata.submission.routeType,
      location: metadata.submission.location,
      isAnonymousSubmission: metadata.submission.isAnonymousSubmission,
      contributionCreditPlatform: metadata.submission.contributionCreditPlatform,
      contributionCreditHandle: metadata.submission.contributionCreditHandle,
      sectorId: metadata.submission.sectorId || null,
      canvasSource: metadata.submission.canvasSource || null,
    },
  }
}
