export interface ImageIdentityLike {
  id?: string | null
  linked_image_id?: string | null
  image_id?: string | null
}

export interface ImageCoordinateLike {
  id: string
  latitude: number | null
  longitude: number | null
}

export interface CragImageLinkLike {
  linked_image_id: string | null
  source_image_id: string | null
}

export function getDisplayImageId(input: ImageIdentityLike | null | undefined): string | null {
  if (!input) return null
  if (input.image_id) return input.image_id
  return input.linked_image_id || input.id || null
}

export function matchesDisplayImageId(
  input: ImageIdentityLike | null | undefined,
  targetId: string | null | undefined
): boolean {
  const displayImageId = getDisplayImageId(input)
  return !!displayImageId && !!targetId && displayImageId === targetId
}

export function requireDisplayImageId(
  input: ImageIdentityLike | null | undefined,
  context = 'Unknown Context'
): string {
  const displayImageId = getDisplayImageId(input)
  if (!displayImageId) {
    throw new Error(`Missing Display Image ID: ${context}`)
  }
  return displayImageId
}

export function buildSelectableImageIdByImageId(
  images: ImageCoordinateLike[],
  links: CragImageLinkLike[]
): Record<string, string> {
  const imageById = new Map(images.map((image) => [image.id, image]))
  const selectableImageIdByImageId: Record<string, string> = {}

  for (const image of images) {
    selectableImageIdByImageId[image.id] = image.id
  }

  for (const link of links) {
    const linkedImageId = link.linked_image_id
    const sourceImageId = link.source_image_id
    if (!linkedImageId || !sourceImageId) continue

    const linkedImage = imageById.get(linkedImageId)
    const sourceImage = imageById.get(sourceImageId)
    if (!linkedImage || !sourceImage) continue

    const linkedHasCoords = typeof linkedImage.latitude === 'number' && typeof linkedImage.longitude === 'number'
    const sourceHasCoords = typeof sourceImage.latitude === 'number' && typeof sourceImage.longitude === 'number'

    if (linkedHasCoords && !sourceHasCoords) {
      selectableImageIdByImageId[sourceImageId] = linkedImageId
      continue
    }

    if (!linkedHasCoords && sourceHasCoords) {
      selectableImageIdByImageId[linkedImageId] = sourceImageId
    }
  }

  return selectableImageIdByImageId
}
