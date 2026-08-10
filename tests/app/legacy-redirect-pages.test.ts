import { beforeEach, describe, expect, test, vi } from 'vitest'

const getLegacyRouteRedirectMock = vi.fn()
const getLegacyClimbRedirectMock = vi.fn()
const redirectMock = vi.fn(() => {
  throw new Error('NEXT_REDIRECT')
})
const notFoundMock = vi.fn(() => {
  throw new Error('notFound')
})

vi.mock('@/features/image-first/server/legacy-redirects', () => ({
  getLegacyRouteRedirect: getLegacyRouteRedirectMock,
  getLegacyClimbRedirect: getLegacyClimbRedirectMock,
}))

vi.mock('next/navigation', () => ({
  permanentRedirect: redirectMock,
  notFound: notFoundMock,
}))

describe('legacy redirect pages', () => {
  beforeEach(() => {
    getLegacyRouteRedirectMock.mockReset()
    getLegacyClimbRedirectMock.mockReset()
    redirectMock.mockClear()
    notFoundMock.mockClear()
  })

  test('redirects a legacy route without loading page metadata', async () => {
    getLegacyRouteRedirectMock.mockResolvedValue('/mx/el-nuevo/i/image-1?route=problem&climb=climb-1')
    const { default: RoutePage } = await import('@/app/[country]/[crag]/[route]/page')

    await expect(RoutePage({
      params: Promise.resolve({ country: 'mx', crag: 'el-nuevo', route: 'problem' }),
    })).rejects.toThrow('NEXT_REDIRECT')

    expect(getLegacyRouteRedirectMock).toHaveBeenCalledWith('MX', 'el-nuevo', 'problem')
    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo/i/image-1?route=problem&climb=climb-1')
  })

  test('redirects a legacy climb with one canonical lookup', async () => {
    getLegacyClimbRedirectMock.mockResolvedValue('/mx/el-nuevo/i/image-1?route=route-1&climb=climb-1')
    const { default: ClimbPage } = await import('@/app/climb/[id]/page')

    await expect(ClimbPage({ params: Promise.resolve({ id: 'climb-1' }) })).rejects.toThrow('NEXT_REDIRECT')

    expect(getLegacyClimbRedirectMock).toHaveBeenCalledWith('climb-1')
    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo/i/image-1?route=route-1&climb=climb-1')
  })
})
