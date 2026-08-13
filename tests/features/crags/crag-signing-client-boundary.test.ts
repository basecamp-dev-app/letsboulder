import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSignedObjectUrls: vi.fn(),
  getAdminClientWithAudit: vi.fn(),
  getUnauthenticatedClient: vi.fn(),
}))

vi.mock('@/lib/media/object-urls', () => ({ createSignedObjectUrls: mocks.createSignedObjectUrls }))
vi.mock('@/lib/supabase-admin', () => ({ getAdminClientWithAudit: mocks.getAdminClientWithAudit }))
vi.mock('@/lib/supabase-server', () => ({ getUnauthenticatedClient: mocks.getUnauthenticatedClient }))

import { loadCragImages } from '@/features/crags/server/load-crag-images'
import { loadImageFaces } from '@/features/crags/server/load-image-faces'

function createReadBuilder(data: unknown) {
  const result = { data, error: null }
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    then: undefined as unknown,
  }

  chain.then = (onFulfilled: (value: typeof result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)

  return chain
}

function createSigningClient() {
  return {
    from: vi.fn(() => {
      throw new Error('Signing client must not perform database reads')
    }),
    rpc: vi.fn(() => {
      throw new Error('Signing client must not perform database reads')
    }),
  }
}

describe('crag signing client boundaries', () => {
  it('uses the request client for crag-image reads and the signing client only for object URLs', async () => {
    const signingClient = createSigningClient()
    const cragBuilder = createReadBuilder({ id: 'crag-1' })
    const imagesBuilder = createReadBuilder([{ id: 'image-1', url: 'private://legacy/image-1.jpg', width: null, height: null, linked_image_id: null, created_at: '2026-01-01' }])
    const metadataBuilder = createReadBuilder({ country_code: 'GB', slug: 'crag-one' })
    const routeLinesBuilder = createReadBuilder([])
    const supabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => {
          if (table === 'crags') return supabase.from.mock.calls.filter(([name]) => name === 'crags').length === 1 ? cragBuilder : metadataBuilder
          if (table === 'crag_images') return imagesBuilder
          if (table === 'route_lines') return routeLinesBuilder
          throw new Error(`Unexpected table: ${table}`)
        }),
      })),
    }
    mocks.getAdminClientWithAudit.mockReturnValue(signingClient)
    mocks.createSignedObjectUrls.mockResolvedValue(new Map([['legacy:image-1.jpg', 'https://signed.example/image-1.jpg']]))

    const response = await loadCragImages(supabase as never, 'crag-1')

    expect(response.status).toBe(200)
    expect(supabase.from).toHaveBeenCalledWith('crags')
    expect(supabase.from).toHaveBeenCalledWith('crag_images')
    expect(supabase.from).toHaveBeenCalledWith('route_lines')
    expect(mocks.createSignedObjectUrls).toHaveBeenCalledWith([{ bucket: 'legacy', path: 'image-1.jpg' }], signingClient)
    expect(signingClient.from).not.toHaveBeenCalled()
    expect(signingClient.rpc).not.toHaveBeenCalled()
  })

  it('uses the anonymous client for face reads and the signing client only for object URLs', async () => {
    const signingClient = createSigningClient()
    const canonicalBuilder = createReadBuilder(null)
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => canonicalBuilder) })),
      rpc: vi.fn(async (name: string) => {
        if (name === 'get_crag_faces_complete_summary') {
          return {
            data: {
              crag_id: 'crag-1',
              primary_image_id: 'image-1',
              faces: [{ image_id: 'image-1', index: 0, is_primary: true, url: 'private://legacy/image-1.jpg', linked_image_id: 'image-1', crag_image_id: null, face_directions: null, metadata: { width: null, height: null }, routes: [], has_routes: false }],
              summary: { total_faces: 1, total_routes: 0 },
            },
            error: null,
          }
        }
        throw new Error(`Unexpected RPC: ${name}`)
      }),
    }
    mocks.getUnauthenticatedClient.mockReturnValue(supabase)
    mocks.getAdminClientWithAudit.mockReturnValue(signingClient)
    mocks.createSignedObjectUrls.mockResolvedValue(new Map([['legacy:image-1.jpg', 'https://signed.example/image-1.jpg']]))

    const response = await loadImageFaces('image-1')

    expect(response.status).toBe(200)
    expect(supabase.from).toHaveBeenCalledWith('crag_images')
    expect(supabase.rpc).toHaveBeenCalledWith('get_crag_faces_complete_summary', { p_image_id: 'image-1' })
    expect(mocks.createSignedObjectUrls).toHaveBeenCalledWith([{ bucket: 'legacy', path: 'image-1.jpg' }], signingClient)
    expect(signingClient.from).not.toHaveBeenCalled()
    expect(signingClient.rpc).not.toHaveBeenCalled()
  })
})
