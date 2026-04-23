import type { Metadata } from 'next'
import Image from 'next/image'
import { permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import JsonLd from '@/components/JsonLd'
import ImageFirstClientLoader from '@/features/image-first/components/ImageFirstClientLoader'
import { buildImageFirstPayload } from '@/features/image-first/server/load-image-first-page'
import type { ImageFirstPayload, ImageFirstRouteLine } from '@/features/image-first/types'
import NotFound from '@/app/not-found'

export const revalidate = 60

interface ImagePageParams {
  country: string
  crag: string
  imageId: string
}

interface ImagePageSearchParams {
  image?: string
  route?: string
  climb?: string
}

const getImagePageResult = cache((args: {
  country: string
  crag: string
  imageId: string
  searchParams: ImagePageSearchParams
}) => buildImageFirstPayload({
  country: args.country,
  crag: args.crag,
  imageId: args.imageId,
  selectedImageId: args.searchParams.image || null,
  routeId: args.searchParams.route || null,
  routeSlug: null,
  climbId: args.searchParams.climb || null,
}))

function getSelectedRoute(payload: ImageFirstPayload): ImageFirstRouteLine | null {
  return payload.initialRoutes.find((route) => route.routeId === payload.initialRouteId)
    || payload.initialRoutes.find((route) => route.climbId === payload.initialClimbId)
    || payload.initialRoutes[0]
    || null
}

function getPageTitle(payload: ImageFirstPayload) {
  const route = getSelectedRoute(payload)
  if (!route) return `${payload.cragName} topo | letsboulder`
  const grade = route.climbGrade ? ` (${route.climbGrade})` : ''
  return `${route.climbName}${grade} | ${payload.cragName} topo`
}

function getPageDescription(payload: ImageFirstPayload) {
  const route = getSelectedRoute(payload)
  if (route?.climbDescription) return route.climbDescription
  if (route) {
    const grade = route.climbGrade ? ` ${route.climbGrade}` : ''
    return `View the topo, line, and route details for ${route.climbName}${grade} at ${payload.cragName}.`
  }
  return `View the climbing topo and route lines for ${payload.cragName}.`
}

function getCanonicalPath(payload: ImageFirstPayload) {
  const params = new URLSearchParams()
  if (payload.initialRouteSlug || payload.initialRouteId) params.set('route', payload.initialRouteSlug || payload.initialRouteId || '')
  if (payload.initialClimbId) params.set('climb', payload.initialClimbId)
  const query = params.toString()
  return `/${payload.countryCode}/${payload.cragSlug}/i/${payload.heroImage.displayImageId}${query ? `?${query}` : ''}`
}

function buildJsonLd(payload: ImageFirstPayload) {
  const route = getSelectedRoute(payload)
  const canonicalPath = getCanonicalPath(payload)
  const imageObject = {
    '@type': 'ImageObject',
    contentUrl: payload.heroImage.src,
    name: route ? `${route.climbName} topo at ${payload.cragName}` : `${payload.cragName} topo`,
    width: payload.heroImage.width,
    height: payload.heroImage.height,
  }

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: getPageTitle(payload),
      description: getPageDescription(payload),
      url: canonicalPath,
      primaryImageOfPage: imageObject,
      about: route
        ? {
            '@type': 'SportsActivityLocation',
            name: route.climbName,
            description: route.climbDescription || undefined,
          }
        : undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: payload.countryCode.toUpperCase(), item: `/${payload.countryCode}` },
        { '@type': 'ListItem', position: 2, name: payload.cragName, item: `/${payload.countryCode}/${payload.cragSlug}` },
        { '@type': 'ListItem', position: 3, name: route?.climbName || 'Topo', item: canonicalPath },
      ],
    },
  ]
}

function ImageFirstServerShell({ payload }: { payload: ImageFirstPayload }) {
  const route = getSelectedRoute(payload)
  const title = getPageTitle(payload)
  const description = getPageDescription(payload)
  const routeMeta = [route?.climbGrade, route?.climbRouteType].filter(Boolean).join(' / ')

  return (
    <section data-image-first-server-shell="true" className="min-h-screen bg-black text-white">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-8">
        <div className="relative h-[58dvh] w-full md:h-[68dvh] lg:h-[72dvh]">
          <Image
            src={payload.heroImage.src}
            alt={route ? `${route.climbName} topo at ${payload.cragName}` : `${payload.cragName} climbing topo`}
            fill
            sizes="(max-width: 1280px) 100vw, 72rem"
            priority
            className="object-contain"
          />
        </div>
        <div className="mt-6 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.2em] text-white/55">{payload.cragName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">{title}</h1>
          {routeMeta ? <p className="mt-3 text-base text-white/70">{routeMeta}</p> : null}
          <p className="mt-4 text-base leading-7 text-white/75">{description}</p>
        </div>
      </main>
    </section>
  )
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<ImagePageParams>
  searchParams: Promise<ImagePageSearchParams>
}): Promise<Metadata> {
  const { country, crag, imageId } = await params
  const query = await searchParams
  const result = await getImagePageResult({ country, crag, imageId, searchParams: query })
  if (!result.payload) return { title: 'Topo Not Found' }

  const title = getPageTitle(result.payload)
  const description = getPageDescription(result.payload)
  const canonicalPath = getCanonicalPath(result.payload)

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      images: [{ url: result.payload.heroImage.src, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [result.payload.heroImage.src],
    },
  }
}

export default async function ImagePage({
  params,
  searchParams,
}: {
  params: Promise<ImagePageParams>
  searchParams: Promise<ImagePageSearchParams>
}) {
  const { country, crag, imageId } = await params
  const query = await searchParams

  const result = await getImagePageResult({
    country,
    crag,
    imageId,
    searchParams: query,
  })

  if (result.redirectTo) {
    permanentRedirect(result.redirectTo)
  }

  return result.payload ? (
    <>
      <JsonLd data={buildJsonLd(result.payload)} />
      <ImageFirstServerShell payload={result.payload} />
      <ImageFirstClientLoader payload={result.payload} />
    </>
  ) : <NotFound />
}
