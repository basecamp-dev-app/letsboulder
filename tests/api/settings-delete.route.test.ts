import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getAdminClient: vi.fn(),
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    DELETE_ACCOUNT_SECRET: 'test-delete-secret',
  },
}))

vi.mock('@/lib/errors', async () => {
  const actual = await vi.importActual<typeof import('@/lib/errors')>('@/lib/errors')
  return {
    ...actual,
    reportError: vi.fn(),
  }
})

import { POST as confirmDelete } from '@/app/api/settings/delete/route'
import { withApiMiddleware } from '@/lib/csrf-server'
import { reportError } from '@/lib/errors'
import { getAdminClient } from '@/lib/supabase-server'

type MiddlewareResult = Awaited<ReturnType<typeof withApiMiddleware>>

type StorageListResult = { data: Array<{ name: string }> | null; error: Error | null }
type StorageRemoveResult = { data: null; error: Error | null }
type DeleteRpcRow = {
  deleted_profile: boolean
  deleted_route_upload_images: number
  deleted_user_climbs: number
  deleted_logs: number
  nullified_images: number
  deleted_images: number
  nullified_climbs: number
  deleted_climbs: number
}
type DeleteRpcResult = { data: DeleteRpcRow[] | null; error: Error | null }

async function createDeleteToken(deleteRouteUploads: boolean) {
  return new SignJWT({
    action: 'delete-account',
    userId: '11111111-1111-4111-8111-111111111111',
    deleteRouteUploads,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode('test-delete-secret'))
}

function makeDeleteRequest(token: string) {
  return new NextRequest(`http://localhost:3000/api/settings/delete?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'x-csrf-token': 'test-csrf-token' },
  })
}

describe('settings delete route', () => {
  const routeUploadList = vi.fn<() => Promise<StorageListResult>>(async () => ({ data: [], error: null }))
  const routeUploadRemove = vi.fn<() => Promise<StorageRemoveResult>>(async () => ({ data: null, error: null }))
  const avatarList = vi.fn<() => Promise<StorageListResult>>(async () => ({ data: [], error: null }))
  const avatarRemove = vi.fn<() => Promise<StorageRemoveResult>>(async () => ({ data: null, error: null }))
  const signOut = vi.fn(async () => ({ error: null }))
  const adminDeleteUser = vi.fn(async () => ({ data: null, error: null }))
  const rpc = vi.fn<() => Promise<DeleteRpcResult>>(async () => ({
    data: [{
      deleted_profile: true,
      deleted_route_upload_images: 0,
      deleted_user_climbs: 0,
      deleted_logs: 0,
      nullified_images: 0,
      deleted_images: 0,
      nullified_climbs: 0,
      deleted_climbs: 0,
    }],
    error: null,
  }))

  beforeEach(() => {
    vi.resetAllMocks()

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      userId: '11111111-1111-4111-8111-111111111111',
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({
            data: {
              user: {
                email: 'user@example.com',
              },
            },
            error: null,
          })),
          signOut,
        },
      } as never,
    } as unknown as MiddlewareResult)

    vi.mocked(getAdminClient).mockReturnValue({
      storage: {
        from: vi.fn((bucket: string) => {
          if (bucket === 'route-uploads') {
            return {
              list: routeUploadList,
              remove: routeUploadRemove,
            }
          }

          return {
            list: avatarList,
            remove: avatarRemove,
          }
        }),
      },
      rpc,
      auth: {
        admin: {
          deleteUser: adminDeleteUser,
        },
      },
    } as never)
  })

  test('fails when route upload listing fails', async () => {
    const token = await createDeleteToken(true)
    routeUploadList.mockResolvedValueOnce({ data: null, error: new Error('list failed') })

    const response = await confirmDelete(makeDeleteRequest(token))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Failed to delete account')
    expect(rpc).not.toHaveBeenCalled()
    expect(adminDeleteUser).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalled()
  })

  test('fails when avatar removal fails', async () => {
    const token = await createDeleteToken(false)
    avatarList.mockResolvedValueOnce({ data: [{ name: 'avatar.png' }], error: null })
    avatarRemove.mockResolvedValueOnce({ data: null, error: new Error('remove failed') })

    const response = await confirmDelete(makeDeleteRequest(token))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Failed to delete account')
    expect(rpc).not.toHaveBeenCalled()
    expect(adminDeleteUser).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalled()
  })

  test('fails when deletion RPC fails', async () => {
    const token = await createDeleteToken(false)
    rpc.mockResolvedValueOnce({ data: null, error: new Error('rpc failed') })

    const response = await confirmDelete(makeDeleteRequest(token))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Failed to delete account')
    expect(signOut).not.toHaveBeenCalled()
    expect(adminDeleteUser).not.toHaveBeenCalled()
  })

  test('fails when auth user deletion fails after cleanup', async () => {
    const token = await createDeleteToken(false)
    adminDeleteUser.mockResolvedValueOnce({ data: null, error: new Error('delete user failed') } as never)

    const response = await confirmDelete(makeDeleteRequest(token))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Failed to delete account')
    expect(rpc).toHaveBeenCalledWith('delete_account_atomic', {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_email: 'user@example.com',
      p_delete_route_uploads: false,
    })
    expect(signOut).toHaveBeenCalled()
  })

  test('deletes account successfully when route uploads are retained', async () => {
    const token = await createDeleteToken(false)

    const response = await confirmDelete(makeDeleteRequest(token))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(routeUploadList).not.toHaveBeenCalled()
    expect(avatarList).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', { limit: 10 })
    expect(rpc).toHaveBeenCalledWith('delete_account_atomic', {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_email: 'user@example.com',
      p_delete_route_uploads: false,
    })
    expect(adminDeleteUser).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  test('deletes account successfully when route uploads are deleted', async () => {
    const token = await createDeleteToken(true)
    routeUploadList.mockResolvedValueOnce({ data: [{ name: 'route.jpg' }], error: null })

    const response = await confirmDelete(makeDeleteRequest(token))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(routeUploadList).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', { limit: 1000 })
    expect(routeUploadRemove).toHaveBeenCalledWith(['11111111-1111-4111-8111-111111111111/route.jpg'])
    expect(rpc).toHaveBeenCalledWith('delete_account_atomic', {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_email: 'user@example.com',
      p_delete_route_uploads: true,
    })
  })
})
