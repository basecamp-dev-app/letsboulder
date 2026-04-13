import { beforeEach, describe, expect, test, vi } from 'vitest'

const buildClimbOfflinePackMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`)
})
const notFoundMock = vi.fn(() => {
  throw new Error('notFound')
})
const maybeSingleMock = vi.fn()
const imageEqMock = vi.fn()
const fetchRouteTargetMapsForClimbIdsMock = vi.fn()

vi.mock('@/lib/offline/build-climb-pack', () => ({
  buildClimbOfflinePack: buildClimbOfflinePackMock,
}))

vi.mock('@/features/crags/lib/crag-route-targets', () => ({
  fetchRouteTargetMapsForClimbIds: fetchRouteTargetMapsForClimbIdsMock,
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
          }),
        }
      }

      if (table === 'images') {
        return {
          select: () => ({
            eq: imageEqMock,
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
    imageEqMock.mockReset()
    fetchRouteTargetMapsForClimbIdsMock.mockReset()
  })

  test('redirects using canonical route target when available', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: '06dd93bf-66d2-4e3e-a632-586e83b5ff83',
        crag_id: 'crag-1',
        crags: {
          country_code: 'MX',
          slug: 'el-nuevo-testamento',
        },
      },
      error: null,
    })
    imageEqMock.mockResolvedValue({
      data: [{ id: 'image-1-display', url: 'https://example.com/img.jpg', latitude: null, longitude: null }],
      error: null,
    })
    fetchRouteTargetMapsForClimbIdsMock.mockResolvedValue({
      effectiveClimbIdByClimbId: {
        '06dd93bf-66d2-4e3e-a632-586e83b5ff83': '06dd93bf-66d2-4e3e-a632-586e83b5ff83',
      },
      targetMaps: {
        nextRouteNavigationTargetByClimbId: {
          '06dd93bf-66d2-4e3e-a632-586e83b5ff83': {
            climbId: '06dd93bf-66d2-4e3e-a632-586e83b5ff83',
            routeId: 'route-1',
            climbSlug: 'visible-climb',
            imageId: 'image-1-display',
            displayImageId: 'image-1-display',
            displayImageUrl: 'https://example.com/img.jpg',
          },
        },
      },
    })

    const { default: ClimbPage } = await import('@/app/climb/[id]/page')

    await expect(ClimbPage({
      params: Promise.resolve({ id: '06dd93bf-66d2-4e3e-a632-586e83b5ff83' }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('redirect:/mx/el-nuevo-testamento/i/image-1-display?image=image-1-display&route=route-1&climb=06dd93bf-66d2-4e3e-a632-586e83b5ff83')

    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo-testamento/i/image-1-display?image=image-1-display&route=route-1&climb=06dd93bf-66d2-4e3e-a632-586e83b5ff83')
  })

  test('redirects using crag path instead of climb canonical path', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    imageEqMock.mockResolvedValue({ data: [], error: null })
    fetchRouteTargetMapsForClimbIdsMock.mockResolvedValue({
      effectiveClimbIdByClimbId: {},
      targetMaps: { nextRouteNavigationTargetByClimbId: {} },
    })
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
