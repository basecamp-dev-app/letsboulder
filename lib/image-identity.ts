export interface ImageIdentityLike {
  id?: string | null
  linked_image_id?: string | null
  image_id?: string | null
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
