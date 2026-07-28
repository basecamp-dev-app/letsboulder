export function isCanonicalImageObjectKey(imageId: string, objectKey: string): boolean {
  return [
    `images/staging/${imageId}/`,
    `images/assets/${imageId}/`,
    `images/originals/${imageId}/`,
  ].some((prefix) => objectKey.startsWith(prefix))
}
