import { permanentRedirect } from 'next/navigation'
import ImageFirstClientLoader from '@/features/image-first/components/ImageFirstClientLoader'
import ShallowLocalClimbPage from '@/features/offline/components/ShallowLocalClimbPage'
import RecentLocalRouteGate from '@/features/offline/components/RecentLocalRouteGate'
import { buildImageFirstPayload } from '@/features/image-first/server/load-image-first-page'
import NotFound from '@/app/not-found'

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

  const fallbackHref = `/${country}/${crag}/i/${imageId}`
  const pageContent = result.payload ? <ImageFirstClientLoader payload={result.payload} /> : <NotFound />

  return (
    <RecentLocalRouteGate
      href={fallbackHref}
      localView={
        <ShallowLocalClimbPage
          imageId={imageId}
          climbId={climb || null}
          href={fallbackHref}
          subtitle={'Recent shallow local climb view'}
        />
      }
    >
      {pageContent}
    </RecentLocalRouteGate>
  )
}
