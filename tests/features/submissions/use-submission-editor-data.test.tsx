// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSubmissionEditorData } from '@/features/submissions/submission-editor/hooks/use-submission-editor-data'

interface ImageQueryResult {
  data: Record<string, unknown> | null
  error: { message: string } | null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  searchParams: new URLSearchParams('face=image-a'),
  routeStore: {
    setMode: vi.fn(),
    setInteractionTool: vi.fn(),
    reset: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ imageId: 'primary-image' }),
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}))

vi.mock('@/features/route-editor/public', () => ({
  areSerializedRoutesEqual: (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right),
  parseRoutePoints: (points: unknown) => Array.isArray(points) ? points : [],
  serializeRouteEditorRoutes: (routes: unknown) => routes,
  useRouteStore: (selector: (state: typeof mocks.routeStore) => unknown) => selector(mocks.routeStore),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}))

function image(id: string, latitude: number) {
  return {
    id,
    url: `https://example.com/${id}.jpg`,
    width: 1200,
    height: 800,
    created_by: null,
    crag_id: `${id}-crag`,
    is_anonymous_submission: false,
    contribution_credit_platform: null,
    contribution_credit_handle: null,
    latitude,
    longitude: latitude + 1,
    face_directions: [],
    location_mode: 'custom',
    wiki_revision: latitude,
    crags: { name: `${id} crag`, region_name: `${id} region`, sub_area: null },
    route_lines: [],
  }
}

describe('useSubmissionEditorData', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams('face=image-a')
  })

  it('ignores an older image request that resolves after the active image request', async () => {
    const imageRequests = new Map<string, ReturnType<typeof deferred<ImageQueryResult>>>()
    const requestedImageIds: string[] = []
    imageRequests.set('image-a', deferred<ImageQueryResult>())
    imageRequests.set('image-b', deferred<ImageQueryResult>())
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.from.mockImplementation((table: string) => ({
      select: (columns: string) => {
        if (table === 'images' && columns.includes('route_lines')) {
          return {
            eq: (_column: string, imageId: string) => ({
              maybeSingle: () => {
                requestedImageIds.push(imageId)
                return imageRequests.get(imageId)?.promise
              },
            }),
          }
        }
        if (table === 'images') {
          return {
            eq: () => ({
              single: async () => ({ data: null, error: { message: 'not needed for this test' } }),
            }),
          }
        }
        if (table === 'submission_edit_history') {
          return { eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }
        }
        return { eq: () => ({ order: async () => ({ data: [] }) }) }
      },
    }))

    const { result, rerender } = renderHook(() => useSubmissionEditorData())
    await waitFor(() => expect(requestedImageIds).toContain('image-a'))

    mocks.searchParams = new URLSearchParams('face=image-b')
    rerender()
    await waitFor(() => expect(requestedImageIds).toContain('image-b'))

    await act(async () => {
      imageRequests.get('image-b')?.resolve({ data: image('image-b', 20), error: null })
    })
    await waitFor(() => expect(result.current.imageSelection).toMatchObject({ imageId: 'image-b' }))

    await act(async () => {
      imageRequests.get('image-a')?.resolve({ data: image('image-a', 10), error: null })
      await Promise.resolve()
    })

    expect(result.current.imageSelection).toMatchObject({ imageId: 'image-b' })
    expect(result.current.latitude).toBe('20')
    expect(result.current.cragName).toBe('image-b crag')
    expect(result.current.wikiRevision).toBe(20)
    expect(result.current.loading).toBe(false)
  })
})
