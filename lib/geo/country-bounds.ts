import { getGeoJsonBoundingBoxesForCountry } from '@/lib/geo/country-bounds.generated'
import type { BoundingBox } from '@/lib/geo/bounding-boxes'

export type { BoundingBox }

export function getGeoJsonBoundingBoxesForCountryFallback(countryCode: string): BoundingBox[] {
  return getGeoJsonBoundingBoxesForCountry(countryCode)
}
