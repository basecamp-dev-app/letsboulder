import type { Metadata } from 'next'
import { getCragById } from '@/features/crags/server/get-crag-by-id'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const crag = await getCragById(id)

  if (!crag) {
    return {
      title: 'Crag Not Found',
      description: 'This crag could not be found.',
      robots: { index: false, follow: true },
    }
  }

  const climbingAreaName = crag.climbing_areas && Array.isArray(crag.climbing_areas) && crag.climbing_areas.length > 0 ? crag.climbing_areas[0].name : null
  const countryRow = crag.countries && Array.isArray(crag.countries) ? crag.countries[0] : crag.countries
  const adminRegionSource = countryRow?.regions
  const adminRegionRow = Array.isArray(adminRegionSource) ? adminRegionSource[0] : adminRegionSource
  const unRegionSource = adminRegionRow?.un_regions
  const unRegionRow = Array.isArray(unRegionSource) ? unRegionSource[0] : unRegionSource
  const locationParts = [crag.region_name, climbingAreaName, countryRow?.name, adminRegionRow?.name, unRegionRow?.continent_name].filter(Boolean) as string[]
  const title = locationParts.length > 0 ? `${crag.name}, ${locationParts[0]}` : `${crag.name}`
  const locationSuffix = locationParts.length > 0 ? ` in ${locationParts.join(', ')}` : ''
  const canonicalPath = crag.slug && crag.country_code
    ? `/${crag.country_code.toLowerCase()}/${crag.slug}`
    : `/crag/${id}`

  return {
    title,
    description: `View climbing routes at ${crag.name}${locationSuffix}. Discover photo topos, beta, access info, and nearby climbs.`,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
      url: canonicalPath,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
      images: ['/og.png'],
    },
  }
}

export default function CragLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
