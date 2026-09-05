import type { CragPackManifest } from '@/types/crag-pack-manifest'

export const PHASE_ONE_FIXTURE_CRAG_ID = '11111111-1111-4111-8111-111111111111'
export const PHASE_ONE_FIXTURE_IMAGE_IDS = [
  '22222222-2222-4222-8222-222222222221',
  '22222222-2222-4222-8222-222222222222',
] as const
export const PHASE_ONE_FIXTURE_WEBP_BASE64 = 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=='
const ASSET_BYTES = 46
const ASSET_DIGEST = 'sha256:05d3010ac1117dad75abd1617997d5d223ec88142422f6f8f123ed899cd434dc' as const

const SECTOR_IDS = {
  harbour: '33333333-3333-4333-8333-333333333331',
  headland: '33333333-3333-4333-8333-333333333332',
} as const

const CLIMB_IDS = {
  shared: '44444444-4444-4444-8444-444444444441',
  traverse: '44444444-4444-4444-8444-444444444442',
  textOnly: '44444444-4444-4444-8444-444444444443',
} as const

function assetUrl(imageId: string) {
  return `/images/${imageId}/v1/topo.webp`
}

export function isPhaseOneFixtureImage(imageId: string, version: string, variant: string) {
  return PHASE_ONE_FIXTURE_IMAGE_IDS.includes(imageId as (typeof PHASE_ONE_FIXTURE_IMAGE_IDS)[number])
    && version === 'v1' && variant === 'topo.webp'
}

export function createPhaseOneOfflineFixtureManifest(): CragPackManifest {
  const assets = PHASE_ONE_FIXTURE_IMAGE_IDS.map((imageId) => ({
    id: `${imageId}:topo:webp`,
    imageId,
    variant: 'topo' as const,
    format: 'webp' as const,
    mediaType: 'image/webp' as const,
    url: assetUrl(imageId),
    contentKey: assetUrl(imageId),
    width: 1,
    height: 1,
    byteCount: ASSET_BYTES,
    digest: ASSET_DIGEST,
    requirement: 'required' as const,
    owningImageId: imageId,
    owningClimbIds: imageId === PHASE_ONE_FIXTURE_IMAGE_IDS[0]
      ? [CLIMB_IDS.shared, CLIMB_IDS.traverse]
      : [CLIMB_IDS.shared],
  }))
  const contentVersion = 'pack-v2-signal-lost-cove-curved-routes'
  return {
    type: 'crag',
    schemaVersion: 2,
    minReaderVersion: 2,
    packId: `crag:${PHASE_ONE_FIXTURE_CRAG_ID}`,
    cragId: PHASE_ONE_FIXTURE_CRAG_ID,
    cragName: 'Signal Lost Cove',
    cragVersionHash: contentVersion,
    contentVersion,
    generatedAt: '2026-09-01T00:00:00.000Z',
    canonicalPath: '/gb/signal-lost-cove',
    requiredOfflineRoutes: [
      `/offline/crag?id=${PHASE_ONE_FIXTURE_CRAG_ID}`,
      ...Object.values(CLIMB_IDS).map((climbId) => `/offline/crag?id=${PHASE_ONE_FIXTURE_CRAG_ID}&climb=${climbId}`),
    ],
    reader: { family: 'letsboulder-offline-field-guide', minimumVersion: 2 },
    exactTotalBytes: assets.reduce((total, asset) => total + asset.byteCount, 0),
    estimatedBytes: assets.reduce((total, asset) => total + asset.byteCount, 0),
    mediaUrls: assets.map((asset) => asset.url),
    climbs: Object.values(CLIMB_IDS).map((climbId) => ({ climbId, mediaUrls: [] })),
    metadata: {
      crag: {
        id: PHASE_ONE_FIXTURE_CRAG_ID,
        name: 'Signal Lost Cove',
        slug: 'signal-lost-cove',
        countryCode: 'GB',
        country: 'United Kingdom',
        regionName: 'Channel Islands',
        subArea: 'Offline Test Coast',
        rockType: 'Granite',
        type: 'Coastal bouldering',
        tideDependency: 'Low tide only; leave the platform before the causeway covers.',
        description: 'A deterministic field-guide crag used to prove no-signal reliability.',
        accessNotes: 'Approach from the harbour steps and keep the rescue slipway clear.',
        coordinates: { latitude: 49.45012, longitude: -2.53987, visibility: 'exact' },
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      sectors: [
        { id: SECTOR_IDS.harbour, name: 'Harbour Wall' },
        { id: SECTOR_IDS.headland, name: 'West Headland' },
      ],
      climbs: [
        {
          id: CLIMB_IDS.shared, sectorId: SECTOR_IDS.harbour, name: 'Shared Signal', slug: 'shared-signal',
          grade: '6A', consensusGrade: '6A+', originalGrade: 'V3', routeType: 'Boulder',
          description: 'Uses the shared harbour face before finishing on the headland face.', isVerified: true,
          verificationCount: 3, coordinates: { latitude: 49.4502, longitude: -2.5398, visibility: 'exact' },
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: CLIMB_IDS.traverse, sectorId: SECTOR_IDS.harbour, name: 'Airplane Traverse', slug: 'airplane-traverse',
          grade: '5+', consensusGrade: '6A', originalGrade: 'V2', routeType: 'Traverse',
          description: 'Traverses the same harbour topo used by Shared Signal.', isVerified: true,
          verificationCount: 2, coordinates: { latitude: 49.45021, longitude: -2.53981, visibility: 'exact' },
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: CLIMB_IDS.textOnly, sectorId: SECTOR_IDS.headland, name: 'No Photo Needed', slug: 'no-photo-needed',
          grade: '4', consensusGrade: null, originalGrade: null, routeType: 'Boulder',
          description: 'A published text-only climb with no public topo.', isVerified: true,
          verificationCount: 1, coordinates: { latitude: 49.45031, longitude: -2.5397, visibility: 'exact' },
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      images: PHASE_ONE_FIXTURE_IMAGE_IDS.map((id, index) => ({
        id, captureDate: '2026-09-01', faceDirection: index === 0 ? 'north' : 'west',
        faceDirections: [index === 0 ? 'north' : 'west'], faceOrder: index + 1, isPrimary: index === 0,
        width: 1, height: 1, coordinates: { latitude: null, longitude: null, visibility: 'hidden' },
        processedAt: '2026-09-01T00:00:00.000Z', assetVersion: 1,
      })),
      routeLines: [
        { id: '55555555-5555-4555-8555-555555555551', climbId: CLIMB_IDS.shared, imageId: PHASE_ONE_FIXTURE_IMAGE_IDS[0], sequenceOrder: 1, color: '#10b981', imageWidth: 1, imageHeight: 1, points: [{ x: 0.2, y: 0.9 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.6 }, { x: 0.8, y: 0.2 }] },
        { id: '55555555-5555-4555-8555-555555555552', climbId: CLIMB_IDS.traverse, imageId: PHASE_ONE_FIXTURE_IMAGE_IDS[0], sequenceOrder: 1, color: '#f59e0b', imageWidth: 1, imageHeight: 1, points: [{ x: 0.1, y: 0.6 }, { x: 0.5, y: 0.2 }, { x: 0.9, y: 0.4 }] },
        { id: '55555555-5555-4555-8555-555555555553', climbId: CLIMB_IDS.shared, imageId: PHASE_ONE_FIXTURE_IMAGE_IDS[1], sequenceOrder: 2, color: '#10b981', imageWidth: 1, imageHeight: 1, points: [{ x: 0.3, y: 0.8 }, { x: 0.5, y: 0.6 }, { x: 0.7, y: 0.2 }] },
      ],
    },
    assets,
  }
}
