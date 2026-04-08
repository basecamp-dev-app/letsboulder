import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { getServerClientFromRequest } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest,
}))

import { GET as getGlobalRankings } from '@/app/api/rankings/route'
import { GET as getCragRankings } from '@/app/api/crags/[id]/rankings/route'
import { GET as getPlaceRankings } from '@/app/api/community/places/[slug]/rankings/route'

type RpcResponse = {
  data: unknown
  error: { message: string; code?: string } | null
}

function makeRpcClient(resolver: (fnName: string, args: Record<string, unknown>) => RpcResponse | Promise<RpcResponse>) {
  return {
    rpc: vi.fn((fnName: string, args: Record<string, unknown>) => resolver(fnName, args)),
    from: vi.fn((table: string) => {
      if (table !== 'places') {
        throw new Error(`Unexpected table lookup: ${table}`)
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: 'place-1', name: 'Magic Wood', slug: 'magic-wood' },
                error: null,
              })),
            })),
          })),
        })),
      }
    }),
  }
}

describe('GET /api/rankings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns 400 for invalid gender filter', async () => {
    const response = await getGlobalRankings(new NextRequest('http://localhost:3000/api/rankings?gender=other'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid gender filter')
  })

  test('returns 400 for invalid sort parameter', async () => {
    const response = await getGlobalRankings(new NextRequest('http://localhost:3000/api/rankings?sort=newest'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid sort parameter')
  })

  test('uses RPC-backed pagination and normalized filters', async () => {
    const supabase = makeRpcClient(async () => ({
      data: [
        {
          rank: 3,
          user_id: 'user-3',
          username: 'Alice',
          avatar_url: 'https://example.com/a.jpg',
          avg_grade: '7A',
          climb_count: 14,
          total_users: 9,
        },
        {
          rank: 4,
          user_id: 'user-4',
          username: 'Bob',
          avatar_url: null,
          avg_grade: '6C+',
          climb_count: 12,
          total_users: 9,
        },
      ],
      error: null,
    }))

    getServerClientFromRequest.mockReturnValue(supabase)

    const response = await getGlobalRankings(
      new NextRequest('http://localhost:3000/api/rankings?gender=all&region=region-1&sort=tops&page=2&limit=2')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith(
      'get_rankings_leaderboard',
      expect.objectContaining({
        p_gender: null,
        p_region_id: 'region-1',
        p_sort: 'tops',
        p_page: 2,
        p_limit: 2,
        p_window_start: expect.any(String),
      })
    )
    expect(json.leaderboard).toEqual([
      {
        rank: 3,
        user_id: 'user-3',
        username: 'Alice',
        avatar_url: 'https://example.com/a.jpg',
        avg_grade: '7A',
        climb_count: 14,
      },
      {
        rank: 4,
        user_id: 'user-4',
        username: 'Bob',
        avatar_url: null,
        avg_grade: '6C+',
        climb_count: 12,
      },
    ])
    expect(json.pagination).toEqual({
      page: 2,
      limit: 2,
      total_users: 9,
      total_pages: 5,
    })
  })

  test('returns empty pagination when RPC returns no rows', async () => {
    const supabase = makeRpcClient(async () => ({ data: [], error: null }))
    getServerClientFromRequest.mockReturnValue(supabase)

    const response = await getGlobalRankings(new NextRequest('http://localhost:3000/api/rankings?limit=10'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.leaderboard).toEqual([])
    expect(json.pagination).toEqual({
      page: 1,
      limit: 10,
      total_users: 0,
      total_pages: 0,
    })
  })
})

describe('GET /api/community/places/[slug]/rankings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('falls back to all-time when 60 day window is empty', async () => {
    const supabase = makeRpcClient(async (fnName, args) => {
      if (fnName !== 'get_place_rankings_leaderboard') {
        throw new Error(`Unexpected RPC: ${fnName}`)
      }

      if (args.p_window_start) {
        return { data: [], error: null }
      }

      return {
        data: [
          {
            rank: 1,
            user_id: 'user-1',
            username: 'Place Crusher',
            avatar_url: null,
            avg_grade: '7B',
            climb_count: 22,
            total_users: 1,
          },
        ],
        error: null,
      }
    })

    getServerClientFromRequest.mockReturnValue(supabase)

    const response = await getPlaceRankings(
      new NextRequest('http://localhost:3000/api/community/places/magic-wood/rankings?sort=grade&page=1&limit=20'),
      { params: Promise.resolve({ slug: 'magic-wood' }) }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      1,
      'get_place_rankings_leaderboard',
      expect.objectContaining({
        p_place_id: 'place-1',
        p_sort: 'grade',
        p_page: 1,
        p_limit: 20,
        p_window_start: expect.any(String),
      })
    )
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      'get_place_rankings_leaderboard',
      expect.objectContaining({
        p_place_id: 'place-1',
        p_sort: 'grade',
        p_page: 1,
        p_limit: 20,
        p_window_start: null,
      })
    )
    expect(json.window).toBe('all-time')
    expect(json.fallback_used).toBe(true)
    expect(json.pagination).toEqual({
      page: 1,
      limit: 20,
      total_users: 1,
      total_pages: 1,
    })
  })
})

describe('GET /api/crags/[id]/rankings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('falls back to all-time when 60 day window is empty', async () => {
    const supabase = makeRpcClient(async (fnName, args) => {
      if (fnName !== 'get_crag_rankings_leaderboard') {
        throw new Error(`Unexpected RPC: ${fnName}`)
      }

      if (args.p_window_start) {
        return { data: [], error: null }
      }

      return {
        data: [
          {
            rank: 1,
            user_id: 'user-2',
            username: 'Crag Crusher',
            avatar_url: null,
            avg_grade: '7A+',
            climb_count: 7,
            total_users: 1,
          },
        ],
        error: null,
      }
    })

    getServerClientFromRequest.mockReturnValue(supabase)

    const response = await getCragRankings(
      new NextRequest('http://localhost:3000/api/crags/crag-1/rankings?sort=tops&page=1&limit=20'),
      { params: Promise.resolve({ id: 'crag-1' }) }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      1,
      'get_crag_rankings_leaderboard',
      expect.objectContaining({
        p_crag_id: 'crag-1',
        p_sort: 'tops',
        p_page: 1,
        p_limit: 20,
        p_window_start: expect.any(String),
      })
    )
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      'get_crag_rankings_leaderboard',
      expect.objectContaining({
        p_crag_id: 'crag-1',
        p_sort: 'tops',
        p_page: 1,
        p_limit: 20,
        p_window_start: null,
      })
    )
    expect(json.window).toBe('all-time')
    expect(json.fallback_used).toBe(true)
    expect(json.pagination).toEqual({
      page: 1,
      limit: 20,
      total_users: 1,
      total_pages: 1,
    })
  })
})
