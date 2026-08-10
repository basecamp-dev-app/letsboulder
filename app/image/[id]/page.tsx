import { notFound, permanentRedirect } from 'next/navigation'
import { getLegacyImageRedirect } from '@/features/image-first/server/legacy-redirects'

export const dynamic = 'force-dynamic'

export default async function ImageRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ image?: string; route?: string; climb?: string; tab?: string }>
}) {
  const { id } = await params
  const { image: selectedImageId, route, climb, tab } = await searchParams

  const resolvedImage = await getLegacyImageRedirect(id)
  if (!resolvedImage) {
    notFound()
  }

  const next = new URLSearchParams()
  if (selectedImageId) next.set('image', selectedImageId)
  if (route) next.set('route', route)
  if (climb) next.set('climb', climb)
  if (tab === 'tops' || tab === 'climb') next.set('tab', tab)

  const target = `/${resolvedImage.countryCode}/${resolvedImage.cragSlug}/i/${resolvedImage.imageId}`
  permanentRedirect(next.toString() ? `${target}?${next.toString()}` : target)
}
