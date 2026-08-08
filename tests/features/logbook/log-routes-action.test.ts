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
  resolveEffectiveClimbId: vi.fn(async (_supabase: unknown, climbId: string) => climbId),
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

import { logRoutesAction } from '@/features/logbook/actions/log-routes'
import { getActionAuth } from '@/lib/actions/action-auth'
import { getServerClient } from '@/lib/supabase-server'

const mockGetActionAuth = getActionAuth as ReturnType<typeof vi.fn>
const mockGetServerClient = getServerClient as ReturnType<typeof vi.fn>

describe('logRoutesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActionAuth.mockResolvedValue({ success: true, data: { userId: 'user-1' } })
  })

  test('persists the climber local date', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { logged: 1, style: 'flash' }, error: null })
    mockGetServerClient.mockResolvedValue({
      rpc,
    })

    const result = await logRoutesAction(['climb-1'], 'flash', undefined, '2026-07-24', '00000000-0000-4000-8000-000000000001', '2026-07-24T10:00:00.000Z')

    expect(result.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('log_routes_idempotent', {
      p_mutation_id: '00000000-0000-4000-8000-000000000001',
      p_climb_ids: ['climb-1'],
      p_style: 'flash',
      p_notes: null,
      p_climbed_on: '2026-07-24',
      p_created_at: '2026-07-24T10:00:00.000Z',
    })
  })

  test('rejects invalid climbed dates before authentication', async () => {
    const result = await logRoutesAction(['climb-1'], 'top', undefined, '07/24/2026', '00000000-0000-4000-8000-000000000001', '2026-07-24T10:00:00.000Z')

    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
    expect(mockGetActionAuth).not.toHaveBeenCalled()
  })
})
