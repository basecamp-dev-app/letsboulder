import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getActionAuth: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/actions/action-auth', () => ({ getActionAuth: mocks.getActionAuth }))
vi.mock('@/lib/supabase-server', () => ({
  getServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))

import {
  setTopoReplacementRouteAction,
  startTopoReplacementAction,
} from '@/features/crag-management/actions/topo-replacement'

const cragId = '11111111-1111-4111-8111-111111111111'
const imageId = '22222222-2222-4222-8222-222222222222'
const replacementId = '33333333-3333-4333-8333-333333333333'
const draftId = '44444444-4444-4444-8444-444444444444'
const climbId = '55555555-5555-4555-8555-555555555555'
const draftRouteId = '66666666-6666-4666-8666-666666666666'

describe('topo replacement actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getActionAuth.mockResolvedValue({ success: true, data: { userId: 'manager-1' } })
  })

  it('starts a replacement and returns the resumable draft identity', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        replacement_id: replacementId,
        draft_id: draftId,
        status: 'draft',
        resumed: false,
      },
      error: null,
    })

    await expect(startTopoReplacementAction({ cragId, imageId, reason: 'Clearer photo' })).resolves.toEqual({
      success: true,
      data: { replacementId, draftId, status: 'draft', resumed: false },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('start_topo_replacement', {
      p_crag_id: cragId,
      p_source_image_id: imageId,
      p_reason: 'Clearer photo',
    })
  })

  it('maps a saved draft line to an existing climb', async () => {
    mocks.rpc.mockResolvedValue({ data: { draft_route_id: draftRouteId }, error: null })

    await expect(setTopoReplacementRouteAction({
      replacementId,
      climbId,
      resolution: 'mapped',
      draftRouteId,
    })).resolves.toEqual({
      success: true,
      data: { replacementId, climbId, resolution: 'mapped', draftRouteId },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('set_topo_replacement_route_resolution', {
      p_replacement_id: replacementId,
      p_climb_id: climbId,
      p_resolution: 'mapped',
      p_draft_route_id: draftRouteId,
    })
  })

  it('does not send a draft line when a route is marked not visible', async () => {
    mocks.rpc.mockResolvedValue({ data: { draft_route_id: null }, error: null })

    await setTopoReplacementRouteAction({ replacementId, climbId, resolution: 'not_visible' })

    expect(mocks.rpc).toHaveBeenCalledWith('set_topo_replacement_route_resolution', {
      p_replacement_id: replacementId,
      p_climb_id: climbId,
      p_resolution: 'not_visible',
    })
  })
})
