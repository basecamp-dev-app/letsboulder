import { SITE_URL } from '@/lib/site'
import type { BreadcrumbItem, CragPageServerCrag } from '@/features/crags/lib/crag-page-types'

interface CragStructuredDataProps {
  crag: CragPageServerCrag
  canonicalPath: string
  breadcrumbs: BreadcrumbItem[]
}

export default function CragStructuredData({ crag, canonicalPath, breadcrumbs }: CragStructuredDataProps) {
  const canonicalUrl = `${SITE_URL}${canonicalPath}`
  const placeSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: crag.name,
    description: crag.description || `${crag.type || 'Bouldering'} crag on letsboulder`,
    url: canonicalUrl,
    address: {
      '@type': 'PostalAddress',
      addressLocality: crag.region_name,
      addressCountry: crag.country_code || 'GB',
    },
  }

  const localBusinessSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: crag.name,
    description: crag.description || `${crag.type || 'Bouldering'} crag on letsboulder`,
    url: canonicalUrl,
    areaServed: [crag.region_name, crag.country].filter(Boolean).join(', ') || undefined,
  }

  if (typeof crag.latitude === 'number' && typeof crag.longitude === 'number') {
    const geo = {
      '@type': 'GeoCoordinates',
      latitude: crag.latitude,
      longitude: crag.longitude,
    }
    placeSchema.geo = geo
    localBusinessSchema.geo = geo
  }

  const additionalProperties: Record<string, unknown>[] = []
  if (crag.rock_type) {
    additionalProperties.push({
      '@type': 'PropertyValue',
      name: 'rockType',
      value: crag.rock_type,
    })
  }
  if (crag.type) {
    additionalProperties.push({
      '@type': 'PropertyValue',
      name: 'climbingType',
      value: crag.type,
    })
  }

  if (additionalProperties.length > 0) {
    placeSchema.additionalProperty = additionalProperties
    localBusinessSchema.additionalProperty = additionalProperties
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: item.href ? `${SITE_URL}${item.href}` : canonicalUrl,
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify([placeSchema, localBusinessSchema, breadcrumbSchema]),
      }}
    />
  )
}
