export interface CragImageAssociationLink {
  source_image_id: string | null
  linked_image_id: string | null
}

/**
 * Returns every canonical image ID in the same crag-image family as each
 * requested image. Older and multi-face submissions can draw a card from the
 * source image while storing their route lines against a linked face.
 */
export function buildImageRouteAssociationIds(
  imageIds: string[],
  links: CragImageAssociationLink[],
): Map<string, Set<string>> {
  const neighbours = new Map<string, Set<string>>()

  const add = (first: string, second: string) => {
    const current = neighbours.get(first) || new Set<string>()
    current.add(second)
    neighbours.set(first, current)
  }

  for (const link of links) {
    if (!link.source_image_id || !link.linked_image_id) continue
    add(link.source_image_id, link.linked_image_id)
    add(link.linked_image_id, link.source_image_id)
  }

  return new Map(imageIds.map((imageId) => {
    const family = new Set<string>([imageId])
    const pending = [imageId]
    while (pending.length > 0) {
      const current = pending.pop()
      if (!current) continue
      for (const neighbour of neighbours.get(current) || []) {
        if (family.has(neighbour)) continue
        family.add(neighbour)
        pending.push(neighbour)
      }
    }
    return [imageId, family]
  }))
}
