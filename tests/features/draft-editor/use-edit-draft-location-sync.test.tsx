// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditDraftLocationSync, type DraftSaveCoordination } from '@/features/draft-editor/hooks/use-edit-draft-location-sync'
import type { DraftPayload } from '@/features/draft-editor/lib/edit-draft-types'

const mockCsrfFetch = vi.fn()

vi.mock('@/hooks/useCsrf', () => ({
  csrfFetch: (...args: Parameters<typeof mockCsrfFetch>) => mockCsrfFetch(...args),
}))

const draft = {
  id: 'draft-1',
  user_id: 'user-1',
  crag_id: 'crag-1',
  status: 'draft',
  updated_at: '2026-08-13T10:00:00.000Z',
  last_edited_by: 'user-1',
  metadata: {},
  crags: null,
  images: [{
    id: 'image-1',
    display_order: 0,
    route_data: {},
    storage_bucket: 'drafts',
    storage_path: 'image-1.jpg',
    readiness_status: 'ready',
    width: 1200,
    height: 900,
    latitude: null,
    longitude: null,
  }],
} satisfies DraftPayload

function createCoordinationRef(): { current: DraftSaveCoordination } {
  return {
    current: {
      explicitSaveActive: false,
      locationSyncPromise: null,
      authoritativeUpdatedAt: draft.updated_at,
    },
  }
}

function createParams(
  coordinationRef: { current: DraftSaveCoordination },
  position: [number, number]
): Parameters<typeof useEditDraftLocationSync>[0] {
  return {
    draft,
    draftId: draft.id,
    draftUpdatedAt: draft.updated_at,
    routeType: 'boulder',
    isAnonymousSubmission: false,
    creditPlatform: 'instagram',
    creditHandle: '',
    latitude: String(position[0]),
    longitude: String(position[1]),
    effectiveMarkerPosition: position,
    activeDraftImageId: 'image-1',
    activeImageLocationMode: 'shared',
    customGpsByImageId: {},
    locationModeByImageId: {},
    mergedManageImages: [],
    imagesPayload: [{ id: 'image-1', display_order: 0, route_data: {} }],
    imagesPayloadSignature: 'image-1',
    routesByImageId: {},
    selectedCrag: null,
    cragId: 'crag-1',
    nearbyCragId: null,
    nearbyCragName: null,
    nearbyCragDominantRouteType: null,
    hasExplicitRouteType: true,
    atlasSync: { atlas: null },
    hasHydratedLocationRef: { current: true },
    lastLocationSyncRef: { current: null },
    setLatitude: vi.fn(),
    setLongitude: vi.fn(),
    setDraftUpdatedAt: vi.fn(),
    setRouteType: vi.fn(),
    setCragId: vi.fn(),
    setSelectedCrag: vi.fn(),
    setCustomGpsByImageId: vi.fn(),
    updateDraftLocation: vi.fn(),
    setMapOpen: vi.fn(),
    searchQuery: '',
    setSearchingLocation: vi.fn(),
    setLocationSearchError: vi.fn(),
    uploadAutoAssignToken: null,
    saveCoordinationRef: coordinationRef,
  }
}

describe('useEditDraftLocationSync save coordination', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockCsrfFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes during the debounce and leaves no delayed legacy PATCH', async () => {
    const coordinationRef = createCoordinationRef()
    mockCsrfFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ draft: { updated_at: '2026-08-13T10:00:01.000Z' } }),
    })
    const { result } = renderHook(() => useEditDraftLocationSync(createParams(coordinationRef, [51.5, -0.1])))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
      await result.current.flushLocationSync()
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(1)
    expect(coordinationRef.current.authoritativeUpdatedAt).toBe('2026-08-13T10:00:01.000Z')
  })

  it('waits for an in-flight location PATCH without starting another', async () => {
    const coordinationRef = createCoordinationRef()
    let resolvePatch!: (response: unknown) => void
    mockCsrfFetch.mockReturnValue(new Promise((resolve) => { resolvePatch = resolve }))
    const { result } = renderHook(() => useEditDraftLocationSync(createParams(coordinationRef, [51.5, -0.1])))

    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    const flush = result.current.flushLocationSync()
    expect(mockCsrfFetch).toHaveBeenCalledTimes(1)

    resolvePatch({
      ok: true,
      status: 200,
      json: async () => ({ draft: { updated_at: '2026-08-13T10:00:02.000Z' } }),
    })
    await act(async () => { await flush })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(1)
    expect(coordinationRef.current.authoritativeUpdatedAt).toBe('2026-08-13T10:00:02.000Z')
  })

  it('defers location changes made while explicit Save is active', async () => {
    const coordinationRef = createCoordinationRef()
    coordinationRef.current.explicitSaveActive = true
    mockCsrfFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ draft: { updated_at: '2026-08-13T10:00:03.000Z' } }),
    })
    const { rerender } = renderHook(
      ({ position }) => useEditDraftLocationSync(createParams(coordinationRef, position)),
      { initialProps: { position: [51.5, -0.1] as [number, number] } }
    )

    rerender({ position: [52.1, -0.2] })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(mockCsrfFetch).not.toHaveBeenCalled()

    coordinationRef.current.explicitSaveActive = false
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(1)
    const request = mockCsrfFetch.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({
      metadata: { submission: { location: { latitude: 52.1, longitude: -0.2 } } },
    })
  })
})
