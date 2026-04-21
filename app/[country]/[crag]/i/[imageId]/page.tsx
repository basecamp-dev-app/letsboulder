import { notFound, permanentRedirect } from 'next/navigation'
import ImageFirstClientLoader from '@/features/image-first/components/ImageFirstClientLoader'
import ShallowLocalClimbPage from '@/features/offline/components/ShallowLocalClimbPage'
import { buildImageFirstPayload } from '@/features/image-first/server/load-image-first-page'
import { readMostRecentLocalEntry } from '@/lib/offline/recent-local'

export const dynamic = 'force-dynamic'

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
  searchParams: Promise<{ image?: string; route?: string; climb?: string }>
}) {
  const { country, crag, imageId } = await params
  const { image, route, climb } = await searchParams

  const result = await buildImageFirstPayload({
    country,
    crag,
    imageId,
    selectedImageId: image || null,
    routeId: route || null,
    routeSlug: route || null,
    climbId: climb || null,
  })

  if (result.redirectTo) {
    permanentRedirect(result.redirectTo)
  }

  if (!result.payload) {
    const fallbackHref = `/${country}/${crag}/i/${imageId}`
    const recentLocalEntry = readMostRecentLocalEntry()
    if (recentLocalEntry?.href === fallbackHref) {
      return (
        <ShallowLocalClimbPage
          imageId={imageId}
          climbId={climb || null}
          href={fallbackHref}
          subtitle={recentLocalEntry.subtitle}
        />
      )
    }

    notFound()
  }

  return <ImageFirstClientLoader payload={result.payload} />
}
