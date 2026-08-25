import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getActionAuth: vi.fn(),
  sessionRpc: vi.fn(),
  sessionFrom: vi.fn(),
  adminFrom: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/actions/action-auth', () => ({ getActionAuth: mocks.getActionAuth }))
vi.mock('@/lib/supabase-server', () => ({
  getServerClient: vi.fn(async () => ({ from: mocks.sessionFrom, rpc: mocks.sessionRpc })),
}))
vi.mock('@/lib/supabase-admin', () => ({
  getAdminClientWithAudit: vi.fn(() => ({ from: mocks.adminFrom })),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  listCragMaintainersAction,
  setCragMaintainerAction,
} from '@/features/crags/actions/crag-governance-actions'

const cragId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'

describe('crag maintainer actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getActionAuth.mockResolvedValue({ success: true, data: { userId: 'admin' } })
    mocks.sessionRpc.mockImplementation(async (name: string) => (
      name === 'is_current_user_admin'
        ? { data: true, error: null }
        : { data: true, error: null }
    ))
  })

  it('resolves an email with the admin profile reader before assigning through the user session', async () => {
    const maybeSingle = vi.fn(async () => ({ data: { id: userId }, error: null }))
    mocks.adminFrom.mockReturnValue({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    })

    await expect(setCragMaintainerAction({
      cragId,
      userReference: 'climber@example.com',
      isMaintainer: true,
    })).resolves.toEqual({ success: true, data: { userId, isMaintainer: true } })

    expect(mocks.adminFrom).toHaveBeenCalledWith('profiles')
    expect(mocks.sessionFrom).not.toHaveBeenCalledWith('profiles')
    expect(mocks.sessionRpc).toHaveBeenCalledWith('set_crag_maintainer', {
      p_crag_id: cragId,
      p_user_id: userId,
      p_is_maintainer: true,
    })
  })

  it('loads private maintainer identity fields with the admin profile reader', async () => {
    const assignment = {
      crag_id: cragId,
      user_id: userId,
      assigned_by: 'admin',
      created_at: '2026-08-25T00:00:00.000Z',
    }
    mocks.sessionFrom.mockImplementation((table: string) => {
      if (table !== 'crag_maintainers') throw new Error(`Unexpected table: ${table}`)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn(async () => ({ data: [assignment], error: null })) })),
        })),
      }
    })
    mocks.adminFrom.mockReturnValue({
      select: vi.fn(() => ({
        in: vi.fn(async () => ({
          data: [{
            id: userId,
            display_name: 'Alex Climber',
            username: 'alex',
            email: 'climber@example.com',
          }],
          error: null,
        })),
      })),
    })

    await expect(listCragMaintainersAction({ cragId })).resolves.toEqual({
      success: true,
      data: [{
        assignment,
        displayName: 'Alex Climber',
        username: 'alex',
        email: 'climber@example.com',
      }],
    })
    expect(mocks.adminFrom).toHaveBeenCalledWith('profiles')
  })
})
