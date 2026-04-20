import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/actions/action-auth', () => ({
  getActionAuth: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClient: vi.fn(),
}))

vi.mock('@/features/climb/lib/effective-climb', () => ({
  resolveEffectiveClimbId: vi.fn(async (_supabase: unknown, climbId: string) => climbId === 'alias-climb' ? 'shared-climb' : climbId),
}))

import { getActionAuth } from '@/lib/actions/action-auth'
import { getServerClient } from '@/lib/supabase-server'
import { saveClimbAction } from '@/features/saved/actions/save-climb'
import { unsaveClimbAction } from '@/features/saved/actions/unsave-climb'
import { saveCragAction } from '@/features/saved/actions/save-crag'
import { unsaveCragAction } from '@/features/saved/actions/unsave-crag'

const mockGetActionAuth = getActionAuth as ReturnType<typeof vi.fn>
const mockGetServerClient = getServerClient as ReturnType<typeof vi.fn>

describe('saved actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('saveClimbAction normalizes effective climb ids before upsert', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-1' } })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockGetServerClient.mockResolvedValue({
      from: vi.fn(() => ({ upsert })),
    })

    const result = await saveClimbAction('alias-climb')

    expect(result.success).toBe(true)
    expect(upsert).toHaveBeenCalledWith({ user_id: 'user-1', climb_id: 'shared-climb' }, { onConflict: 'user_id,climb_id' })
  })

  test('unsaveClimbAction rejects unauthenticated requests', async () => {
    mockGetActionAuth.mockResolvedValue({ success: false, error: 'Authentication required', status: 401 })

    const result = await unsaveClimbAction('climb-1')

    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  test('saveCragAction rejects missing crag rows', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-1' } })
    mockGetServerClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        })),
      })),
    })

    const result = await saveCragAction('crag-404')

    expect(result.success).toBe(false)
    expect(result.status).toBe(404)
  })

  test('unsaveCragAction deletes existing save rows', async () => {
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-1' } })
    const eqClimb = vi.fn().mockResolvedValue({ error: null })
    const eqUser = vi.fn(() => ({ eq: eqClimb }))
    mockGetServerClient.mockResolvedValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({ eq: eqUser })),
      })),
    })

    const result = await unsaveCragAction('crag-1')

    expect(result.success).toBe(true)
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqClimb).toHaveBeenCalledWith('crag_id', 'crag-1')
  })
})
