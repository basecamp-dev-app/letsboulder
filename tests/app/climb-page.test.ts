import { beforeEach, describe, expect, test, vi } from 'vitest'

const buildClimbOfflinePackMock = vi.fn()
const redirectMock = vi.fn()
const notFoundMock = vi.fn(() => {
  throw new Error('notFound')
})

vi.mock('@/lib/offline/build-climb-pack', () => ({
  buildClimbOfflinePack: buildClimbOfflinePackMock,
}))

vi.mock('next/navigation', () => ({
  permanentRedirect: redirectMock,
  notFound: notFoundMock,
}))

describe('app/climb/[id]/page', () => {
  beforeEach(() => {
    buildClimbOfflinePackMock.mockReset()
    redirectMock.mockReset()
    notFoundMock.mockClear()
  })

  test('redirects using offline pack canonical path fallback', async () => {
    buildClimbOfflinePackMock.mockResolvedValue({
      crag_path: null,
      primary_route_lines: [],
      faces: [],
      primary_image: {
        id: 'image-1',
        display_image_id: 'image-1-display',
      },
      offline_pack: {
        canonicalPath: '/mx/el-nuevo-testamento',
        pageUrl: '/climb/06dd93bf-66d2-4e3e-a632-586e83b5ff83',
      },
    })

    const { default: ClimbPage } = await import('@/app/climb/[id]/page')

    await ClimbPage({
      params: Promise.resolve({ id: '06dd93bf-66d2-4e3e-a632-586e83b5ff83' }),
      searchParams: Promise.resolve({}),
    })

    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo-testamento/i/image-1-display?climb=06dd93bf-66d2-4e3e-a632-586e83b5ff83&image=image-1-display')
  })
})
