import { beforeEach, describe, expect, test, vi } from 'vitest'

const buildClimbOfflinePackMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`)
})
const notFoundMock = vi.fn(() => {
  throw new Error('notFound')
})
const maybeSingleMock = vi.fn()
const climbOrMock = vi.fn()
const routeInMock = vi.fn()
const cragImageOrderMock = vi.fn()

vi.mock('@/lib/offline/build-climb-pack', () => ({
  buildClimbOfflinePack: buildClimbOfflinePackMock,
}))

vi.mock('@/lib/supabase-server', () => ({
  getUnauthenticatedClient: () => ({
    from: (table: string) => {
      if (table === 'climbs') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: maybeSingleMock,
            }),
            or: climbOrMock,
          }),
        }
      }

      if (table === 'route_lines') {
        return {
          select: () => ({
            in: routeInMock,
          }),
        }
      }

      if (table === 'crag_images') {
        return {
          select: () => ({
            eq: (field: string, value: string) => ({
              eq: (innerField: string, innerValue: string) => ({
                order: () => cragImageOrderMock(field, value, innerField, innerValue),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }),
}))

vi.mock('next/navigation', () => ({
  permanentRedirect: redirectMock,
  notFound: notFoundMock,
}))

describe('app/climb/[id]/page', () => {
  beforeEach(() => {
    buildClimbOfflinePackMock.mockReset()
    redirectMock.mockReset()
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`)
    })
    notFoundMock.mockClear()
    maybeSingleMock.mockReset()
    climbOrMock.mockReset()
    routeInMock.mockReset()
    cragImageOrderMock.mockReset()
  })

  test('redirects using canonical route target when available', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: '06dd93bf-66d2-4e3e-a632-586e83b5ff83',
        shared_climb_id: null,
        crag_id: 'crag-1',
        crags: {
          country_code: 'MX',
          slug: 'el-nuevo-testamento',
        },
      },
      error: null,
    })
    climbOrMock.mockResolvedValue({
      data: [{ id: '06dd93bf-66d2-4e3e-a632-586e83b5ff83' }],
      error: null,
    })
    routeInMock.mockReturnValue({
      order: () => ({
        order: () => Promise.resolve({
          data: [{ id: 'route-1', image_id: 'image-1', climb_id: '06dd93bf-66d2-4e3e-a632-586e83b5ff83' }],
          error: null,
        }),
      }),
    })
    cragImageOrderMock.mockResolvedValue({ data: [], error: null })

    const { default: ClimbPage } = await import('@/app/climb/[id]/page')

    await expect(ClimbPage({
      params: Promise.resolve({ id: '06dd93bf-66d2-4e3e-a632-586e83b5ff83' }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('redirect:/mx/el-nuevo-testamento/i/image-1?image=image-1&route=route-1&climb=06dd93bf-66d2-4e3e-a632-586e83b5ff83')

    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo-testamento/i/image-1?image=image-1&route=route-1&climb=06dd93bf-66d2-4e3e-a632-586e83b5ff83')
  })

  test('redirects using crag path instead of climb canonical path', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    climbOrMock.mockResolvedValue({ data: [], error: null })
    cragImageOrderMock.mockResolvedValue({ data: [], error: null })
    buildClimbOfflinePackMock.mockResolvedValue({
      crag_path: '/mx/el-nuevo-testamento',
      primary_route_lines: [],
      faces: [],
      primary_image: {
        id: 'image-1',
        display_image_id: 'image-1-display',
      },
      offline_pack: {
        canonicalPath: '/climb/06dd93bf-66d2-4e3e-a632-586e83b5ff83',
        pageUrl: '/climb/06dd93bf-66d2-4e3e-a632-586e83b5ff83',
      },
    })

    const { default: ClimbPage } = await import('@/app/climb/[id]/page')

    await expect(ClimbPage({
      params: Promise.resolve({ id: '06dd93bf-66d2-4e3e-a632-586e83b5ff83' }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('redirect:/mx/el-nuevo-testamento/i/image-1-display?climb=06dd93bf-66d2-4e3e-a632-586e83b5ff83&image=image-1-display')

    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo-testamento/i/image-1-display?climb=06dd93bf-66d2-4e3e-a632-586e83b5ff83&image=image-1-display')
  })
})
