export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export function geoJsonPolygonToLeaflet(polygon: GeoJSONPolygon | null): [number, number][] | null {
  if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
    return null
  }

  const outerRing = polygon.coordinates[0]
  return outerRing.map(([lng, lat]) => [lat, lng] as [number, number])
}

export function geoJsonToLeafletBounds(polygon: GeoJSONPolygon | null): [[number, number], [number, number]] | null {
  if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
    return null
  }

  const outerRing = polygon.coordinates[0]
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  outerRing.forEach(([lng, lat]) => {
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
  })

  return [[minLat, minLng], [maxLat, maxLng]]
}

export function getPolygonCenter(polygon: GeoJSONPolygon | null): [number, number] | null {
  if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
    return null
  }

  const outerRing = polygon.coordinates[0]
  let sumLat = 0
  let sumLng = 0
  let count = 0

  outerRing.forEach(([lng, lat]) => {
    sumLat += lat
    sumLng += lng
    count++
  })

  return count > 0 ? [sumLat / count, sumLng / count] : null
}
