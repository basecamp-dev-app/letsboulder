// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSelectedClimbState } from '@/features/image-first/hooks/use-selected-climb-state'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  isClimbSavedByUser: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: mocks.maybeSingle,
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)

    return {
      auth: { getUser: mocks.getUser },
      from: vi.fn(() => builder),
    }
  },
}))

vi.mock('@/features/saved/lib/queries', () => ({
  isClimbSavedByUser: mocks.isClimbSavedByUser,
}))

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('useSelectedClimbState', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.maybeSingle.mockResolvedValue({
      data: { grade_opinion: 'hard', star_rating: 4, notes: 'Bring a pad' },
      error: null,
    })
    mocks.isClimbSavedByUser.mockResolvedValue(true)
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/star-rating')) return Promise.resolve(response({ rating_avg: 3.5, rating_count: 2 }))
      return Promise.resolve(response({ notes: [{ userId: 'user-2', displayName: 'Maya', notes: 'Heel hook', createdAt: '2026-01-01' }] }))
    }))
  })

  it('hydrates authenticated selected-climb state using effective and route climb IDs', async () => {
    const { result } = renderHook(() => useSelectedClimbState({
      activeClimbId: 'route-climb',
      activeEffectiveClimbId: 'canonical-climb',
      pendingLogClimbIds: new Set(),
      userPresent: true,
    }))

    await waitFor(() => expect(result.current.loadingSelectedClimbState).toBe(false))

    expect(mocks.isClimbSavedByUser).toHaveBeenCalledWith(expect.anything(), 'user-1', 'route-climb')
    expect(result.current.selectedClimbLogged).toBe(true)
    expect(result.current.selectedClimbLog).toEqual({ gradeOpinion: 'hard', starRating: 4, notes: 'Bring a pad' })
    expect(result.current.selectedClimbHasSavedFeedback).toBe(true)
    expect(result.current.selectedClimbFeedbackCollapsed).toBe(true)
    expect(result.current.isWantToTrySaved).toBe(true)
    expect(result.current.selectedClimbRatingSummary).toEqual({ rating_avg: 3.5, rating_count: 2 })
    expect(result.current.communityNotes).toHaveLength(1)
    expect(fetch).toHaveBeenCalledWith('/api/climbs/canonical-climb/star-rating')
    expect(fetch).toHaveBeenCalledWith('/api/image-first/community-notes?effectiveClimbId=canonical-climb')
  })

  it('keeps pending offline logs marked as logged when no remote log exists', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useSelectedClimbState({
      activeClimbId: 'route-climb',
      activeEffectiveClimbId: 'canonical-climb',
      pendingLogClimbIds: new Set(['route-climb']),
      userPresent: true,
    }))

    await waitFor(() => expect(result.current.loadingSelectedClimbState).toBe(false))
    expect(result.current.selectedClimbLogged).toBe(true)
    expect(result.current.selectedClimbLog).toBeNull()
  })

  it('ignores an obsolete selected-climb response after changing routes', async () => {
    const firstLog = deferred<{ data: { grade_opinion: string; star_rating: number; notes: string }; error: null }>()
    const firstSaved = deferred<boolean>()
    mocks.maybeSingle
      .mockImplementationOnce(() => firstLog.promise)
      .mockResolvedValueOnce({ data: { grade_opinion: 'soft', star_rating: 2, notes: 'Second route' }, error: null })
    mocks.isClimbSavedByUser
      .mockImplementationOnce(() => firstSaved.promise)
      .mockResolvedValueOnce(false)
    const pendingLogClimbIds = new Set<string>()

    const { result, rerender } = renderHook(
      ({ activeClimbId, activeEffectiveClimbId }) => useSelectedClimbState({
        activeClimbId,
        activeEffectiveClimbId,
        pendingLogClimbIds,
        userPresent: true,
      }),
      { initialProps: { activeClimbId: 'first-route', activeEffectiveClimbId: 'first-canonical' } }
    )

    rerender({ activeClimbId: 'second-route', activeEffectiveClimbId: 'second-canonical' })
    await waitFor(() => expect(result.current.selectedClimbLog?.notes).toBe('Second route'))

    await act(async () => {
      firstLog.resolve({ data: { grade_opinion: 'hard', star_rating: 5, notes: 'First route' }, error: null })
      firstSaved.resolve(true)
    })

    expect(result.current.selectedClimbLog?.notes).toBe('Second route')
    expect(result.current.isWantToTrySaved).toBe(false)
  })

  it('resets user-specific state when no climb is selected', async () => {
    const { result } = renderHook(() => useSelectedClimbState({
      activeClimbId: null,
      activeEffectiveClimbId: null,
      pendingLogClimbIds: new Set(),
      userPresent: true,
    }))

    await waitFor(() => expect(result.current.loadingSelectedClimbState).toBe(false))
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(result.current.selectedClimbLogged).toBe(false)
    expect(result.current.selectedClimbLog).toBeNull()
    expect(result.current.isWantToTrySaved).toBe(false)
    expect(result.current.selectedClimbRatingSummary).toBeNull()
  })
})
