import { revalidateTag } from 'next/cache'

export function getCragCacheTag(cragId: string) {
  return `crag:${cragId}`
}

export function getCragSlugCacheTag(countryCode: string, slug: string) {
  return `crag-slug:${countryCode.toUpperCase()}:${slug}`
}

export function revalidatePublicCrag(cragId: string) {
  revalidateTag(getCragCacheTag(cragId), { expire: 0 })
}

export function revalidatePublicCragSlug(countryCode: string, slug: string) {
  revalidateTag(getCragSlugCacheTag(countryCode, slug), { expire: 0 })
}
