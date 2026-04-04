import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest: vi.fn(),
  getAdminClient: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: vi.fn(async () => ({ data: null, error: null })),
    },
  })),
}))

import { POST as postComment } from '@/app/api/comments/route'
import { POST as postGradeVote } from '@/app/api/routes/[id]/grades/route'
import { POST as initiateDelete } from '@/app/api/settings/initiate-delete/route'
import { POST as confirmDelete } from '@/app/api/settings/delete/route'
import { withApiMiddleware } from '@/lib/csrf-server'

function makeJsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  })
}

describe('Mutation route validation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { email: 'user@example.com' } }, error: null })),
        },
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: 'target-1' }, error: null })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: 'comment-1' }, error: null })),
            })),
          })),
          upsert: vi.fn(async () => ({ error: null })),
        })),
        storage: {
          from: vi.fn(() => ({
            list: vi.fn(async () => ({ data: [], error: null })),
            remove: vi.fn(async () => ({ data: null, error: null })),
          })),
        },
      } as never,
      userId: null,
    })
  })

  test('comments POST rejects invalid category for target type', async () => {
    const response = await postComment(makeJsonRequest('http://localhost:3000/api/comments', {
      targetType: 'crag',
      targetId: 'crag-1',
      body: 'Useful note',
      category: 'beta',
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.category?.[0]).toBe('Invalid category')
  })

  test('comments POST rejects empty trimmed body', async () => {
    const response = await postComment(makeJsonRequest('http://localhost:3000/api/comments', {
      targetType: 'climb',
      targetId: 'climb-1',
      body: '   ',
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.body?.[0]).toBe('Comment cannot be empty')
  })

  test('grade vote POST rejects missing grade', async () => {
    const response = await postGradeVote(
      makeJsonRequest('http://localhost:3000/api/routes/route-1/grades', {}),
      { params: Promise.resolve({ id: 'route-1' }) }
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.grade?.[0]).toBeDefined()
  })

  test('initiate delete rejects invalid query boolean', async () => {
    const response = await initiateDelete(new NextRequest('http://localhost:3000/api/settings/initiate-delete?delete_route_uploads=yes', {
      method: 'POST',
      headers: { 'x-csrf-token': 'test-csrf-token' },
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.delete_route_uploads?.[0]).toBeDefined()
  })

  test('delete settings rejects missing token', async () => {
    const response = await confirmDelete(new NextRequest('http://localhost:3000/api/settings/delete', {
      method: 'POST',
      headers: { 'x-csrf-token': 'test-csrf-token' },
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.token?.[0]).toBeDefined()
  })
})
