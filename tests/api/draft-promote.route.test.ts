import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

const { adminRpcMock, revalidatePath, revalidateTag } = vi.hoisted(() => ({
  adminRpcMock: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath,
  revalidateTag,
}))

vi.mock('@/lib/discord', () => ({
  notifyNewSubmission: vi.fn(async () => undefined),
}))

vi.mock('@/lib/location/resolve-country', () => ({
  resolveCountryFromCoordinates: vi.fn(async () => ({
    countryId: null,
    countryCode: 'GG',
    countryName: 'Guernsey',
    regionName: 'Northern Europe',
    unRegionName: null,
    continentName: null,
    source: 'nominatim',
  })),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClientWithAudit: () => ({ rpc: adminRpcMock }),
}))

import { promoteDraftToSubmission as publishDraft } from '@/features/submissions/server/drafts/draft-promote'
import { notifyNewSubmission } from '@/lib/discord'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'

async function promoteDraftToSubmission(input: Parameters<typeof publishDraft>[0] & { request?: Request }) {
  const { request: _request, ...serviceInput } = input
  const result = await publishDraft(serviceInput)
  return result.kind === 'success'
    ? new Response(JSON.stringify({ success: true, ...result.value }))
    : new Response(JSON.stringify(result.payload), { status: result.status })
}

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function makeSupabase(options?: {
  includeFallbackRouteData?: boolean
  mediaReady?: boolean
  mediaFailed?: boolean
  brokenAssociation?: boolean
  draftStatus?: 'draft' | 'submitted'
  cragCountryCode?: string | null
  cragDeletedAt?: string | null
  cragPublicationStatus?: 'review' | 'published'
  draftHasLocation?: boolean
}) {
  const includeFallbackRouteData = options?.includeFallbackRouteData ?? false

  return {
    from: vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: { id: 'draft-1' }, error: null })),
                    })),
                  })),
                })),
              })),
            })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
                  crag_id: 'crag-1',
                  status: options?.draftStatus || 'draft',
                  updated_at: '2026-03-01T00:00:00Z',
                  metadata: {
                    navigation: { defaultImageId: 'draft-image-1' },
                    submission: options?.draftHasLocation === false
                      ? {}
                      : { location: { latitude: 49.45, longitude: -2.55, countryCode: 'GG' } },
                    ...(options?.draftStatus === 'submitted' ? {
                      publishedImageId: 'image-1',
                      allPublishedImageIds: ['image-1'],
                      publishedClimbIds: ['climb-1'],
                      publishedRouteLineIds: ['route-line-1'],
                      publishedAt: '2026-03-01T00:00:00Z',
                    } : {}),
                  },
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [
                {
                  id: 'draft-image-1',
                  linked_image_id: options?.brokenAssociation ? null : 'image-1',
                  storage_bucket: 'private-media',
                  storage_path: 'images/assets/image-1/canonical.webp',
                  display_order: 0,
                  latitude: 49.45,
                  longitude: -2.55,
                  route_data: includeFallbackRouteData
                    ? {
                        completedRoutes: [{
                          id: 'draft-route-1',
                          name: 'Recovered route',
                          grade: '6A',
                          description: '',
                          climbType: 'sport',
                          points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
                          sequenceOrder: 0,
                          imageWidth: 1200,
                          imageHeight: 1200,
                        }],
                      }
                    : null,
                },
                { id: 'draft-image-2', linked_image_id: 'image-2', storage_bucket: 'private-media', storage_path: 'images/assets/image-2/canonical.webp', display_order: 1, latitude: 49.46, longitude: -2.54, route_data: null },
              ],
              error: null,
            })),
          })),
        }
      }

      if (table === 'crags') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'crag-1',
                  country_code: options?.cragCountryCode === undefined ? 'GG' : options.cragCountryCode,
                  slug: 'hidden-crag',
                  deleted_at: options?.cragDeletedAt ?? null,
                  superseded_by: null,
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'images') {
        const readyRows = [
          { id: 'image-1', created_by: 'user-1', original_bucket: 'private-media', original_key: 'images/assets/image-1/original.jpg', storage_bucket: 'private-media', storage_path: 'images/assets/image-1/canonical.webp', processing_status: 'ready', moderation_status: 'approved', visibility: 'public', status: 'approved' },
          { id: 'image-2', created_by: 'user-1', original_bucket: 'private-media', original_key: 'images/assets/image-2/original.jpg', storage_bucket: 'private-media', storage_path: 'images/assets/image-2/canonical.webp', processing_status: 'ready', moderation_status: 'skipped', visibility: 'public', status: 'approved' },
        ].map((row) => options?.mediaFailed
          ? { ...row, processing_status: 'failed' }
          : options?.mediaReady === false ? { ...row, processing_status: 'processing' } : row)
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({ data: readyRows.filter((row) => ids.includes(row.id)), error: null })),
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'image-1',
                  crag_id: 'crag-1',
                  crags: {
                    name: 'Hidden Crag',
                    country_code: 'GG',
                    slug: 'hidden-crag',
                    publication_status: options?.cragPublicationStatus || 'published',
                  },
                  route_lines: [
                    { id: 'route-line-1', climb_id: 'climb-1', sequence_order: 0, created_at: '2026-03-01T00:00:00Z' },
                  ],
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'climbs') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => makeThenableResult({
              data: [
                { id: 'climb-1', name: 'Test Route', grade: '6A' },
              ],
              error: null,
            })),
          })),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
    rpc: vi.fn(async (fnName: string) => {
      if (fnName === 'has_valid_open_data_consent') return { data: true, error: null }
      if (fnName === 'promote_draft_to_submission') {
        return {
          data: {
            success: true,
            status: 'submitted',
            image_id: 'image-1',
            default_image_id: 'image-1',
            image_ids: ['image-1'],
            climb_ids: ['climb-1'],
            route_line_ids: ['route-line-1'],
            published_at: '2026-03-01T00:00:00Z',
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }),
  }
}

describe('promoteDraftToSubmission', () => {
  beforeEach(() => {
    adminRpcMock.mockReset()
    adminRpcMock.mockResolvedValue({ data: 'GG', error: null })
    revalidatePath.mockClear()
    revalidateTag.mockClear()
  })

  test('rejects publication until every linked image is publicly deliverable', async () => {
    const supabase = makeSupabase({ mediaReady: false })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'media_not_ready',
      error: 'Your photo is still being prepared. Publishing will be available when it’s ready.',
      message: 'Your photo is still being prepared. Publishing will be available when it’s ready.',
    })
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
  })

  test('returns an actionable terminal processing failure', async () => {
    const response = await promoteDraftToSubmission({
      supabase: makeSupabase({ mediaFailed: true }) as unknown as ReturnType<typeof createServerClient>,
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'media_processing_failed',
      error: 'Your photo could not be prepared. Remove it and upload it again before publishing.',
      message: 'Your photo could not be prepared. Remove it and upload it again before publishing.',
    })
  })

  test('clears a deleted crag assignment and returns an actionable conflict', async () => {
    const supabase = makeSupabase({ cragDeletedAt: '2026-08-25T10:00:00Z' })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'crag_unavailable',
      error: 'The selected crag is no longer available. Choose a crag before publishing.',
    })
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
  })

  test('distinguishes a broken media association from active processing', async () => {
    const response = await promoteDraftToSubmission({
      supabase: makeSupabase({ brokenAssociation: true }) as unknown as ReturnType<typeof createServerClient>,
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'media_association_broken',
      error: 'We could not prepare one of your photos for publishing. Remove it and upload it again.',
      message: 'We could not prepare one of your photos for publishing. Remove it and upload it again.',
    })
  })

  test('sends a Discord notification after publishing a draft', async () => {
    const supabase = makeSupabase()

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(vi.mocked(notifyNewSubmission)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyNewSubmission)).toHaveBeenCalledWith(
      supabase,
      [{ id: 'climb-1', name: 'Test Route', grade: '6A' }],
      'Hidden Crag',
      'crag-1',
      'user-1'
    )
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/gg/hidden-crag')
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidateTag).toHaveBeenCalledWith('crag:crag-1', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledTimes(1)
  })

  test('returns review state without a public link or public side effects for an unpublished crag', async () => {
    const supabase = makeSupabase({ cragPublicationStatus: 'review' })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      publication: { state: 'pending_crag_review', cragId: 'crag-1' },
      published: expect.objectContaining({ canonicalPath: null }),
    }))
    expect(vi.mocked(notifyNewSubmission)).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  test('recovers an already-published draft and repairs missing crag country metadata without promoting twice', async () => {
    vi.mocked(notifyNewSubmission).mockClear()
    const supabase = makeSupabase({ draftStatus: 'submitted', cragCountryCode: null })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      published: expect.objectContaining({
        defaultImageId: 'image-1',
        canonicalPath: '/gg/hidden-crag/i/image-1',
      }),
    }))
    expect(adminRpcMock).toHaveBeenCalledWith('repair_submission_draft_crag_country', {
      p_draft_id: 'draft-1',
      p_user_id: 'user-1',
      p_crag_id: 'crag-1',
      p_latitude: 49.45,
      p_longitude: -2.55,
      p_country_code: 'GG',
      p_country_name: 'Guernsey',
      p_region_name: 'Northern Europe',
    })
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
    expect(vi.mocked(notifyNewSubmission)).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/gg/hidden-crag')
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidateTag).toHaveBeenCalledWith('crag:crag-1', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledTimes(1)
  })

  test('repairs a countryless crag when only draft-image GPS is persisted', async () => {
    const supabase = makeSupabase({ cragCountryCode: null, draftHasLocation: false })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(vi.mocked(resolveCountryFromCoordinates)).toHaveBeenCalledWith(supabase, 49.45, -2.55)
    expect(adminRpcMock).toHaveBeenCalledWith('repair_submission_draft_crag_country', {
      p_draft_id: 'draft-1',
      p_user_id: 'user-1',
      p_crag_id: 'crag-1',
      p_latitude: 49.45,
      p_longitude: -2.55,
      p_country_code: 'GG',
      p_country_name: 'Guernsey',
      p_region_name: 'Northern Europe',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('promote_draft_to_submission', { p_draft_id: 'draft-1' })
  })

  test('recovers a submitted countryless crag using persisted draft-image GPS', async () => {
    const supabase = makeSupabase({ draftStatus: 'submitted', cragCountryCode: null, draftHasLocation: false })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(vi.mocked(resolveCountryFromCoordinates)).toHaveBeenCalledWith(supabase, 49.45, -2.55)
    expect(adminRpcMock).toHaveBeenCalledWith('repair_submission_draft_crag_country', expect.objectContaining({
      p_draft_id: 'draft-1',
      p_crag_id: 'crag-1',
      p_latitude: 49.45,
      p_longitude: -2.55,
    }))
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
  })

  test('publishes from durable rows only when route_data contains stale compatibility routes', async () => {
    const supabase = makeSupabase({ includeFallbackRouteData: true })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      published: expect.objectContaining({
        defaultImageId: 'image-1',
        routeLineIds: ['route-line-1'],
      }),
    }))
    expect(supabase.rpc).not.toHaveBeenCalledWith('sync_submission_draft_routes', expect.anything())
    expect(supabase.rpc).toHaveBeenCalledWith('promote_draft_to_submission', { p_draft_id: 'draft-1' })
  })

  test('publishes image-only drafts when the promotion result has no route lines', async () => {
    const supabase = makeSupabase()

    ;(supabase.rpc as unknown) = vi.fn(async (fnName: string) => {
      if (fnName === 'has_valid_open_data_consent') return { data: true, error: null }
      if (fnName === 'promote_draft_to_submission') {
        return {
          data: {
            success: true,
            status: 'submitted',
            image_id: 'image-1',
            default_image_id: 'image-1',
            image_ids: ['image-1'],
            climb_ids: [],
            route_line_ids: [],
            published_at: '2026-03-01T00:00:00Z',
          },
          error: null,
        }
      }

      return { data: null, error: null }
    })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      published: expect.objectContaining({
        defaultImageId: 'image-1',
        routeLineIds: [],
      }),
    }))
  })

  test('repairs draft metadata from image coordinates before publish when metadata location is missing', async () => {
    const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase> & { from: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
    const originalFrom = supabase.from
    const updateMock = vi.fn(() => {
      const select = vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { id: 'draft-1' }, error: null })),
      }))
      const fourthEq = vi.fn(() => ({ select }))
      const thirdEq = vi.fn(() => ({ eq: fourthEq }))
      const secondEq = vi.fn(() => ({ eq: thirdEq }))
      return { eq: vi.fn(() => ({ eq: secondEq })) }
    })

    // @ts-expect-error - mock return types are intentionally flexible
    supabase.from = vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
                  crag_id: 'crag-1',
                  status: 'draft',
                  updated_at: '2026-03-01T00:00:00Z',
                  metadata: {
                    navigation: { defaultImageId: 'draft-image-1' },
                    submission: {},
                  },
                },
                error: null,
              })),
            })),
          })),
          update: updateMock,
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [
                {
                  id: 'draft-image-1',
                  linked_image_id: 'image-1',
                  storage_bucket: 'private-media',
                  storage_path: 'images/assets/image-1/canonical.webp',
                  display_order: 0,
                  latitude: 49.45,
                  longitude: -2.55,
                  route_data: null,
                },
              ],
              error: null,
            })),
          })),
        }
      }

      if (table === 'submission_draft_routes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [{ id: 'draft-route-1', draft_image_id: 'draft-image-1' }],
              error: null,
            })),
          })),
        }
      }

      return originalFrom(table)
    })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({
      metadata: {
        navigation: { defaultImageId: 'draft-image-1' },
        submission: { location: { latitude: 49.45, longitude: -2.55 } },
      },
    })
    expect(supabase.rpc).toHaveBeenCalledWith('promote_draft_to_submission', { p_draft_id: 'draft-1' })
  })

  test('rejects custom image location without coordinates before publish', async () => {
    const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase> & { from: ReturnType<typeof vi.fn> }
    const originalFrom = supabase.from

    Object.defineProperty(supabase, 'from', { value: vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
                  crag_id: 'crag-1',
                  status: 'draft',
                  metadata: {
                    version: 2,
                    navigation: { defaultImageId: 'draft-image-1' },
                    images: {
                      'draft-image-1': { imageId: 'draft-image-1', displayOrder: 0, locationMode: 'custom' },
                    },
                    submission: { location: { latitude: 49.45, longitude: -2.55 } },
                  },
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [
                {
                  id: 'draft-image-1',
                  linked_image_id: 'image-1',
                  storage_bucket: 'private-media',
                  storage_path: 'images/assets/image-1/canonical.webp',
                  display_order: 0,
                  latitude: null,
                  longitude: null,
                  route_data: null,
                },
              ],
              error: null,
            })),
          })),
        }
      }

      return originalFrom(table)
    }) })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Add location for Image 1 before publishing this draft' })
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
  })
})
