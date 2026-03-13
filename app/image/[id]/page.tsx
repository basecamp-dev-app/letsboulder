import { notFound, redirect } from 'next/navigation'
import { getImageByDisplayId } from '@/app/[country]/[crag]/i/[imageId]/image-page-server'

export default async function ImageRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ route?: string; climb?: string; tab?: string }>
}) {
  const { id } = await params
  const { route, climb, tab } = await searchParams

  const image = await getImageByDisplayId(id)
  if (!image) {
    notFound()
  }

  const next = new URLSearchParams()
  if (route) next.set('route', route)
  if (climb) next.set('climb', climb)
  if (tab === 'tops' || tab === 'climb') next.set('tab', tab)

  const target = `/${image.countryCode}/${image.cragSlug}/i/${image.canonicalId}`
  redirect(next.toString() ? `${target}?${next.toString()}` : target)
}
