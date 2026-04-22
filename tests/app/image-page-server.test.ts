import { beforeEach, describe, expect, test, vi } from 'vitest'

const cacheMock = <T extends (...args: unknown[]) => unknown>(fn: T) => fn

const state = {
  cragImageLookup: [] as unknown[],
  linkedCragImages: [] as unknown[],
  rawImage: null as Record<string, unknown> | null,
  routeLines: [] as unknown[],
  cragImagesForCrag: [] as unknown[],
  submissionContributorsCount: 0,
  uploaderProfile: null as Record<string, unknown> | null,
}

vi.mock('react', () => ({ cache: cacheMock }))

const getStoredClimbManifestMock = vi.fn(async () => null)
const getStoredClimbManifestByImageIdMock = vi.fn(async () => null)

vi.mock('@/lib/offline/storage', () => ({
  getStoredClimbManifest: getStoredClimbManifestMock,
  getStoredClimbManifestByImageId: getStoredClimbManifestByImageIdMock,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    from: (table: string) => ({
      select: (_cols?: string) => {
        void _cols
        if (table === 'crag_images') {
          return {
            or: () => ({
              order: async () => ({ data: state.cragImageLookup, error: null }),
            }),
            eq: (_column: string, value: string) => ({
              order: async () => ({
                data: value === state.rawImage?.id ? state.linkedCragImages : state.cragImagesForCrag,
                error: null,
              }),
            }),
          }
        }

        if (table === 'images') {
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: state.rawImage, error: null }),
              order: async () => ({ data: [state.rawImage], error: null }),
            }),
          }
        }

        if (table === 'route_lines') {
          return {
            eq: () => ({
              order: () => ({
                order: async () => ({ data: state.routeLines, error: null }),
              }),
            }),
          }
        }

        if (table === 'submission_contributors') {
          return {
            eq: async () => ({ count: state.submissionContributorsCount, error: null }),
          }
        }

        if (table === 'profiles') {
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: state.uploaderProfile, error: null }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
      eq: (_col: string, _val: unknown) => {
        void _col
        void _val
        if (table === 'images') {
          return {
            maybeSingle: async () => ({ data: state.rawImage, error: null }),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      },
    }),
  })),
}))

describe('image-page-server raw image fallback', () => {
  beforeEach(() => {
    getStoredClimbManifestMock.mockReset()
    getStoredClimbManifestByImageIdMock.mockReset()
    getStoredClimbManifestMock.mockResolvedValue(null)
    getStoredClimbManifestByImageIdMock.mockResolvedValue(null)
    state.cragImageLookup = []
    state.linkedCragImages = []
    state.rawImage = {
      id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
      crag_id: 'crag-1',
      url: 'https://static.example.com/raw.jpg',
      width: 1200,
      height: 900,
      created_at: '2026-03-01T00:00:00Z',
      crags: {
        id: 'crag-1',
        slug: 'point-de-la-moye-east',
        country_code: 'GG',
        name: 'Point de la Moye East',
      },
    }
    state.routeLines = [
      {
        id: 'fd88f866-1eac-47a9-97c2-462574a95f55',
        climb_id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
        points: null,
        color: '#ef4444',
        image_width: null,
        image_height: null,
        sequence_order: 1,
        created_at: '2026-03-01T00:00:00Z',
        climbs: {
          id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          name: 'Test Route',
          slug: 'test-route',
          grade: '6A',
          description: null,
          route_type: 'boulder',
        },
      },
    ]
    state.cragImagesForCrag = []
    state.submissionContributorsCount = 0
    state.uploaderProfile = null
  })

  test('builds payload for raw images.id image-first route', async () => {
    state.rawImage = {
      ...state.rawImage,
      created_by: 'user-1',
      is_anonymous_submission: false,
      contribution_credit_platform: 'instagram',
      contribution_credit_handle: 'maya_beta',
    }
    state.uploaderProfile = {
      id: 'user-1',
      username: 'maya_beta',
      display_name: 'Maya Stone',
      first_name: 'Maya',
      last_name: 'Stone',
      avatar_url: null,
      is_public: true,
    }
    state.submissionContributorsCount = 2

    const { buildImageFirstPayload } = await import('../../features/image-first/server/load-image-first-page')

    const result = await buildImageFirstPayload({
      country: 'gg',
      crag: 'point-de-la-moye-east',
      imageId: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
      selectedImageId: 'face-image-1',
      routeId: 'fd88f866-1eac-47a9-97c2-462574a95f55',
      routeSlug: 'fd88f866-1eac-47a9-97c2-462574a95f55',
      climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
    })

    expect(result.redirectTo).toBeNull()
    expect(result.payload?.heroImage.displayImageId).toBe('215b8180-4727-404d-8fbf-6cb9bd8f5f9a')
    expect(result.payload?.navigationContext.orderedImageIds).toEqual(['215b8180-4727-404d-8fbf-6cb9bd8f5f9a'])
    expect(result.payload?.initialRouteId).toBe('fd88f866-1eac-47a9-97c2-462574a95f55')
    expect(result.payload?.initialClimbId).toBe('f9676bde-fbb2-4d90-a178-dec6cdb903f4')
    expect(result.payload?.heroImage.displayImageId).toBe('215b8180-4727-404d-8fbf-6cb9bd8f5f9a')
    expect(result.payload?.attribution.ownerDisplayLabel).toBe('Maya Stone')
    expect(result.payload?.attribution.ownerProfileId).toBe('user-1')
    expect(result.payload?.attribution.formattedContributionHandle).toBe('@maya_beta')
    expect(result.payload?.attribution.communityEditorsCount).toBe(2)
  }, 15000)

  test('resolves redirected params using route id without slug ambiguity', async () => {
    const { buildImageFirstPayload } = await import('../../features/image-first/server/load-image-first-page')

    const result = await buildImageFirstPayload({
      country: 'gg',
      crag: 'point-de-la-moye-east',
      imageId: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
      routeId: 'fd88f866-1eac-47a9-97c2-462574a95f55',
      routeSlug: null,
      climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
    })

    expect(result.redirectTo).toBeNull()
    expect(result.payload?.initialRouteId).toBe('fd88f866-1eac-47a9-97c2-462574a95f55')
    expect(result.payload?.initialRouteSlug).toBe('test-route')
    expect(result.payload?.initialClimbId).toBe('f9676bde-fbb2-4d90-a178-dec6cdb903f4')
  })

  test('uses Private Contributor for non-public uploader profiles', async () => {
    state.rawImage = {
      ...state.rawImage,
      created_by: 'user-2',
      is_anonymous_submission: false,
      contribution_credit_platform: 'instagram',
      contribution_credit_handle: 'private_handle',
    }
    state.uploaderProfile = {
      id: 'user-2',
      username: 'private_handle',
      display_name: 'Private Person',
      first_name: 'Private',
      last_name: 'Person',
      avatar_url: null,
      is_public: false,
    }

    const { buildImageFirstPayload } = await import('../../features/image-first/server/load-image-first-page')

    const result = await buildImageFirstPayload({
      country: 'gg',
      crag: 'point-de-la-moye-east',
      imageId: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
    })

    expect(result.payload?.attribution.ownerDisplayLabel).toBe('Private Contributor')
    expect(result.payload?.attribution.ownerProfileId).toBeNull()
    expect(result.payload?.attribution.formattedContributionHandle).toBeNull()
  })

  test('builds payload from stored offline climb manifest when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    ;(getStoredClimbManifestMock as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue({
      climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
      ownerPackIds: ['crag:crag-1'],
      pinnedStandalone: false,
      savedAt: '2026-03-01T00:00:00Z',
      lastUsedAt: '2026-03-01T00:00:00Z',
      manifest: {
        packId: 'climb:f9676bde-fbb2-4d90-a178-dec6cdb903f4',
        type: 'climb',
        climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
        climbName: 'Test Route',
        version: 'v1',
        manifestUrl: '/api/offline-packs/climbs/f9676bde-fbb2-4d90-a178-dec6cdb903f4',
        pageUrl: '/gg/point-de-la-moye-east/test-route',
        canonicalPath: '/gg/point-de-la-moye-east/test-route',
        offlineLaunchUrl: '/gg/point-de-la-moye-east/test-route',
        mediaUrls: ['https://static.example.com/raw.jpg'],
        mediaCount: 1,
        estimatedBytes: 100,
      },
      payload: {
        climb: {
          id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          name: 'Test Route',
          grade: '6A',
          route_type: 'boulder',
          description: null,
        },
        primary_image: {
          id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
          display_image_id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
          url: 'https://static.example.com/raw.jpg',
          crag_id: 'crag-1',
          latitude: 49.18,
          longitude: -2.24,
          width: 1200,
          height: 900,
          natural_width: 1200,
          natural_height: 900,
          created_by: null,
          is_anonymous_submission: false,
          contribution_credit_platform: null,
          contribution_credit_handle: null,
          face_directions: null,
          media_ref: null,
          cache_key: null,
          version: null,
        },
        primary_route_lines: [{
          id: 'fd88f866-1eac-47a9-97c2-462574a95f55',
          climb_id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          points: null,
          color: '#ef4444',
          image_width: null,
          image_height: null,
          climb: {
            id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
            name: 'Test Route',
            grade: '6A',
            route_type: 'boulder',
            description: null,
          },
        }],
        faces: [{
          id: 'face-image-1',
          image_id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
          display_image_id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
          is_primary: true,
          url: 'https://static.example.com/raw.jpg',
          has_routes: true,
          linked_image_id: null,
          crag_image_id: null,
          face_directions: null,
          metadata: { width: 1200, height: 900 },
          routes: [{
            id: 'fd88f866-1eac-47a9-97c2-462574a95f55',
            climb_id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
            name: 'Test Route',
            grade: '6A',
            route_type: 'boulder',
            description: null,
            color: '#ef4444',
            points: null,
            image_width: null,
            image_height: null,
            sequence_order: 1,
          }],
          media_ref: null,
          cache_key: null,
          version: null,
        }],
        summary: { total_faces: 1, total_routes: 1 },
        crag_path: '/gg/point-de-la-moye-east',
        public_submitter: null,
        route_attribution: {
          ownerRoleLabel: 'Original Uploader',
          ownerDisplayLabel: 'Anonymous Contributor',
          ownerProfileId: null,
          formattedContributionHandle: null,
          contributionCreditUrl: null,
          communityEditorsRoleLabel: 'Community Editors',
          communityEditorsCount: 4,
        },
        offline_pack: {
          packId: 'climb:f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          type: 'climb',
          climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          climbName: 'Test Route',
          version: 'v1',
          manifestUrl: '/api/offline-packs/climbs/f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          pageUrl: '/gg/point-de-la-moye-east/test-route',
          canonicalPath: '/gg/point-de-la-moye-east/test-route',
          offlineLaunchUrl: '/gg/point-de-la-moye-east/test-route',
          mediaUrls: ['https://static.example.com/raw.jpg'],
          mediaCount: 1,
          estimatedBytes: 100,
        },
      },
    })

    const { buildImageFirstPayload } = await import('../../features/image-first/server/load-image-first-page')

    const result = await buildImageFirstPayload({
      country: 'gg',
      crag: 'point-de-la-moye-east',
      imageId: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
      routeId: 'fd88f866-1eac-47a9-97c2-462574a95f55',
      climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
    })

    expect(result.redirectTo).toBeNull()
    expect(result.payload?.heroImage.displayImageId).toBe('215b8180-4727-404d-8fbf-6cb9bd8f5f9a')
    expect(result.payload?.initialRouteId).toBe('fd88f866-1eac-47a9-97c2-462574a95f55')
    expect(result.payload?.initialClimbId).toBe('f9676bde-fbb2-4d90-a178-dec6cdb903f4')
    expect(result.payload?.navigationContext.orderedImageIds).toEqual(['215b8180-4727-404d-8fbf-6cb9bd8f5f9a'])
    expect(result.payload?.attribution.ownerDisplayLabel).toBe('Anonymous Contributor')
    expect(result.payload?.attribution.communityEditorsCount).toBe(4)

    vi.unstubAllGlobals()
  })

  test('builds payload from stored offline climb manifest by image id when climb id is absent', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    ;(getStoredClimbManifestByImageIdMock as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue({
      climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
      ownerPackIds: ['crag:crag-1'],
      pinnedStandalone: false,
      savedAt: '2026-03-01T00:00:00Z',
      lastUsedAt: '2026-03-01T00:00:00Z',
      manifest: {
        packId: 'climb:f9676bde-fbb2-4d90-a178-dec6cdb903f4',
        type: 'climb',
        climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
        climbName: 'Test Route',
        version: 'v1',
        manifestUrl: '/api/offline-packs/climbs/f9676bde-fbb2-4d90-a178-dec6cdb903f4',
        pageUrl: '/gg/point-de-la-moye-east/test-route',
        canonicalPath: '/gg/point-de-la-moye-east/test-route',
        offlineLaunchUrl: '/gg/point-de-la-moye-east/test-route',
        mediaUrls: ['https://static.example.com/raw.jpg'],
        mediaCount: 1,
        estimatedBytes: 100,
      },
      payload: {
        climb: {
          id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          name: 'Test Route',
          grade: '6A',
          route_type: 'boulder',
          description: null,
        },
        primary_image: {
          id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
          display_image_id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
          url: 'https://static.example.com/raw.jpg',
          crag_id: 'crag-1',
          latitude: 49.18,
          longitude: -2.24,
          width: 1200,
          height: 900,
          natural_width: 1200,
          natural_height: 900,
          created_by: null,
          is_anonymous_submission: false,
          contribution_credit_platform: null,
          contribution_credit_handle: null,
          face_directions: null,
          media_ref: null,
          cache_key: null,
          version: null,
        },
        primary_route_lines: [{
          id: 'fd88f866-1eac-47a9-97c2-462574a95f55',
          climb_id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          points: null,
          color: '#ef4444',
          image_width: null,
          image_height: null,
          climb: {
            id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
            name: 'Test Route',
            grade: '6A',
            route_type: 'boulder',
            description: null,
          },
        }],
        faces: [{
          id: 'face-image-1',
          image_id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
          display_image_id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
          is_primary: true,
          url: 'https://static.example.com/raw.jpg',
          has_routes: true,
          linked_image_id: null,
          crag_image_id: null,
          face_directions: null,
          metadata: { width: 1200, height: 900 },
          routes: [{
            id: 'fd88f866-1eac-47a9-97c2-462574a95f55',
            climb_id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
            name: 'Test Route',
            grade: '6A',
            route_type: 'boulder',
            description: null,
            color: '#ef4444',
            points: null,
            image_width: null,
            image_height: null,
            sequence_order: 1,
          }],
          media_ref: null,
          cache_key: null,
          version: null,
        }],
        summary: { total_faces: 1, total_routes: 1 },
        crag_path: '/gg/point-de-la-moye-east',
        public_submitter: null,
        route_attribution: {
          ownerRoleLabel: 'Original Uploader',
          ownerDisplayLabel: 'Anonymous Contributor',
          ownerProfileId: null,
          formattedContributionHandle: null,
          contributionCreditUrl: null,
          communityEditorsRoleLabel: 'Community Editors',
          communityEditorsCount: 3,
        },
        offline_pack: {
          packId: 'climb:f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          type: 'climb',
          climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          climbName: 'Test Route',
          version: 'v1',
          manifestUrl: '/api/offline-packs/climbs/f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          pageUrl: '/gg/point-de-la-moye-east/test-route',
          canonicalPath: '/gg/point-de-la-moye-east/test-route',
          offlineLaunchUrl: '/gg/point-de-la-moye-east/test-route',
          mediaUrls: ['https://static.example.com/raw.jpg'],
          mediaCount: 1,
          estimatedBytes: 100,
        },
      },
    })

    const { buildImageFirstPayload } = await import('../../features/image-first/server/load-image-first-page')

    const result = await buildImageFirstPayload({
      country: 'gg',
      crag: 'point-de-la-moye-east',
      imageId: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
    })

    expect(getStoredClimbManifestByImageIdMock).toHaveBeenCalledWith('215b8180-4727-404d-8fbf-6cb9bd8f5f9a')
    expect(result.redirectTo).toBeNull()
    expect(result.payload?.heroImage.displayImageId).toBe('215b8180-4727-404d-8fbf-6cb9bd8f5f9a')
    expect(result.payload?.initialClimbId).toBe('f9676bde-fbb2-4d90-a178-dec6cdb903f4')
    expect(result.payload?.attribution.ownerDisplayLabel).toBe('Anonymous Contributor')
    expect(result.payload?.attribution.communityEditorsCount).toBe(3)

    vi.unstubAllGlobals()
  })
})
