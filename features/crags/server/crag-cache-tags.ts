import { revalidatePath, revalidateTag } from 'next/cache'

export function getCragCacheTag(cragId: string) {
  return `crag:${cragId}`
}

export function getCragSlugCacheTag(countryCode: string, slug: string) {
  return `crag-slug:${countryCode.toUpperCase()}:${slug}`
}

export function revalidatePublicCrag(cragId: string) {
  revalidateTag(getCragCacheTag(cragId), { expire: 0 })
}

export function revalidatePublicCragPaths(input: {
  cragId: string
  countryCode?: string | null
  slug?: string | null
}) {
  revalidatePath('/')
  revalidatePublicCrag(input.cragId)
  if (input.countryCode && input.slug) {
    revalidatePath(`/${input.countryCode.toLowerCase()}/${input.slug}`)
  }
}

export function revalidatePublicCragSlug(countryCode: string, slug: string) {
  revalidateTag(getCragSlugCacheTag(countryCode, slug), { expire: 0 })
}
