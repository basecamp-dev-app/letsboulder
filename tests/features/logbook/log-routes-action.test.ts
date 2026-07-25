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
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockGetServerClient.mockResolvedValue({
      from: vi.fn(() => ({ upsert })),
    })

    const result = await logRoutesAction(['climb-1'], 'flash', undefined, '2026-07-24')

    expect(result.success).toBe(true)
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        climb_id: 'climb-1',
        style: 'flash',
        date_climbed: '2026-07-24',
      }),
    ], { onConflict: 'user_id,climb_id' })
  })

  test('rejects invalid climbed dates before authentication', async () => {
    const result = await logRoutesAction(['climb-1'], 'top', undefined, '07/24/2026')

    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
    expect(mockGetActionAuth).not.toHaveBeenCalled()
  })
})
