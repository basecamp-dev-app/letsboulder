import { notFound, permanentRedirect } from 'next/navigation'
import ImageFirstClientLoader from '@/app/[country]/[crag]/i/[imageId]/ImageFirstClientLoader'
import { buildImageFirstPayload } from '@/features/image-first/server/load-image-first-page'

interface ImagePageParams {
  country: string
  crag: string
  imageId: string
}

export default async function ImagePage({
  params,
  searchParams,
}: {
  params: Promise<ImagePageParams>
  searchParams: Promise<{ route?: string; climb?: string }>
}) {
  const { country, crag, imageId } = await params
  const { route, climb } = await searchParams

  const result = await buildImageFirstPayload({
    country,
    crag,
    imageId,
    routeId: route || null,
    routeSlug: route || null,
    climbId: climb || null,
  })

  if (result.redirectTo) {
    permanentRedirect(result.redirectTo)
  }

  if (!result.payload) {
    notFound()
  }

  return <ImageFirstClientLoader payload={result.payload} />
}
