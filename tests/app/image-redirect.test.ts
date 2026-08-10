import { beforeEach, describe, expect, test, vi } from 'vitest'

const getLegacyImageRedirectMock = vi.fn()
const redirectMock = vi.fn()
const notFoundMock = vi.fn(() => {
  throw new Error('notFound')
})

vi.mock('@/features/image-first/server/legacy-redirects', () => ({
  getLegacyImageRedirect: getLegacyImageRedirectMock,
}))

vi.mock('next/navigation', () => ({
  permanentRedirect: redirectMock,
  notFound: notFoundMock,
}))

describe('app/image/[id]/page', () => {
  beforeEach(() => {
    getLegacyImageRedirectMock.mockReset()
    redirectMock.mockReset()
    notFoundMock.mockClear()
  })

  test('redirects when id is a canonical crag_images id', async () => {
    getLegacyImageRedirectMock.mockResolvedValue({
      countryCode: 'mx',
      cragSlug: 'el-nuevo-testamento',
      imageId: 'canonical-image-id',
    })

    const { default: ImageRedirectPage } = await import('@/app/image/[id]/page')

    await ImageRedirectPage({
      params: Promise.resolve({ id: 'canonical-image-id' }),
      searchParams: Promise.resolve({ route: 'route-uuid', climb: 'climb-uuid' }),
    })

    expect(getLegacyImageRedirectMock).toHaveBeenCalledWith('canonical-image-id')
    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo-testamento/i/canonical-image-id?route=route-uuid&climb=climb-uuid')
  })

  test('redirects when id is a linked_image_id value', async () => {
    getLegacyImageRedirectMock.mockResolvedValue({
      countryCode: 'mx',
      cragSlug: 'el-nuevo-testamento',
      imageId: 'canonical-linked-id',
    })

    const { default: ImageRedirectPage } = await import('@/app/image/[id]/page')

    await ImageRedirectPage({
      params: Promise.resolve({ id: 'linked-image-id' }),
      searchParams: Promise.resolve({ route: '91e4f278-dfa7-4436-9aa2-f7752aac5ec6' }),
    })

    expect(getLegacyImageRedirectMock).toHaveBeenCalledWith('linked-image-id')
    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo-testamento/i/canonical-linked-id?route=91e4f278-dfa7-4436-9aa2-f7752aac5ec6')
  })

  test('redirects when id is a raw images.id fallback value', async () => {
    getLegacyImageRedirectMock.mockResolvedValue({
      countryCode: 'mx',
      cragSlug: 'el-nuevo-testamento',
      imageId: '8bc21fe1-487c-4027-9e44-d9c4b4516194',
    })

    const { default: ImageRedirectPage } = await import('@/app/image/[id]/page')

    await ImageRedirectPage({
      params: Promise.resolve({ id: '8bc21fe1-487c-4027-9e44-d9c4b4516194' }),
      searchParams: Promise.resolve({
        image: '8bc21fe1-487c-4027-9e44-d9c4b4516194',
        route: '91e4f278-dfa7-4436-9aa2-f7752aac5ec6',
        climb: '1403793e-07bd-4914-84d2-d8976d108052',
      }),
    })

    expect(getLegacyImageRedirectMock).toHaveBeenCalledWith('8bc21fe1-487c-4027-9e44-d9c4b4516194')
    expect(redirectMock).toHaveBeenCalledWith('/mx/el-nuevo-testamento/i/8bc21fe1-487c-4027-9e44-d9c4b4516194?image=8bc21fe1-487c-4027-9e44-d9c4b4516194&route=91e4f278-dfa7-4436-9aa2-f7752aac5ec6&climb=1403793e-07bd-4914-84d2-d8976d108052')
  })

  test('falls through to notFound when no image matches', async () => {
    getLegacyImageRedirectMock.mockResolvedValue(null)

    const { default: ImageRedirectPage } = await import('@/app/image/[id]/page')

    await expect(
      ImageRedirectPage({
        params: Promise.resolve({ id: 'missing-image-id' }),
        searchParams: Promise.resolve({ route: 'route-uuid' }),
      })
    ).rejects.toThrow('notFound')
  })
})
