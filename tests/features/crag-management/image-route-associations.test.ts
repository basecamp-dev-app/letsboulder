import { describe, expect, it } from 'vitest'

import { buildImageRouteAssociationIds } from '@/features/crag-management/lib/image-route-associations'

describe('buildImageRouteAssociationIds', () => {
  it('includes routes stored against a linked face in the source image family', () => {
    const result = buildImageRouteAssociationIds(['source'], [
      { source_image_id: 'source', linked_image_id: 'face-a' },
      { source_image_id: 'source', linked_image_id: 'face-b' },
    ])

    expect([...result.get('source') || []].sort()).toEqual(['face-a', 'face-b', 'source'])
  })

  it('resolves transitive legacy association chains and ignores incomplete links', () => {
    const result = buildImageRouteAssociationIds(['face-a', 'standalone'], [
      { source_image_id: 'source', linked_image_id: 'face-a' },
      { source_image_id: 'source', linked_image_id: 'face-b' },
      { source_image_id: null, linked_image_id: 'standalone' },
    ])

    expect([...result.get('face-a') || []].sort()).toEqual(['face-a', 'face-b', 'source'])
    expect([...result.get('standalone') || []]).toEqual(['standalone'])
  })
})
