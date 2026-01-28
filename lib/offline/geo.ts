export function projectLonLatToWebMercator(lon: number, lat: number): [number, number] {
  const R = 6378137
  const maxLat = 85.05112878
  const clampedLat = Math.max(-maxLat, Math.min(maxLat, lat))
  const x = (R * lon * Math.PI) / 180
  const y = R * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360))
  return [x, y]
}

export function computeBboxFromPoints4326(points: Array<{ latitude: number | null; longitude: number | null }>) {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  for (const p of points) {
    if (p.latitude == null || p.longitude == null) continue
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
    minLon = Math.min(minLon, p.longitude)
    maxLon = Math.max(maxLon, p.longitude)
  }

  if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) return null
  return [minLon, minLat, maxLon, maxLat] as [number, number, number, number]
}

export function expandBbox4326(
  bbox: [number, number, number, number],
  paddingRatio = 0.12,
  minPaddingDegrees = 0.001
): [number, number, number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const dLon = Math.max(maxLon - minLon, 0)
  const dLat = Math.max(maxLat - minLat, 0)
  const padLon = Math.max(dLon * paddingRatio, minPaddingDegrees)
  const padLat = Math.max(dLat * paddingRatio, minPaddingDegrees)
  return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat]
}

export function bbox4326ToBbox3857(bbox: [number, number, number, number]) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const [minX, minY] = projectLonLatToWebMercator(minLon, minLat)
  const [maxX, maxY] = projectLonLatToWebMercator(maxLon, maxLat)

  return [
    Math.min(minX, maxX),
    Math.min(minY, maxY),
    Math.max(minX, maxX),
    Math.max(minY, maxY),
  ] as [number, number, number, number]
}

export function geoJsonPolygonBounds4326(boundary: unknown): [number, number, number, number] | null {
  if (!boundary || typeof boundary !== 'object') return null
  const coords = (boundary as { coordinates?: unknown }).coordinates
  if (!Array.isArray(coords)) return null

  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  for (const ring of coords as unknown[]) {
    if (!Array.isArray(ring)) continue
    for (const pt of ring as unknown[]) {
      if (!Array.isArray(pt) || pt.length < 2) continue
      const lon = Number(pt[0])
      const lat = Number(pt[1])
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
      minLon = Math.min(minLon, lon)
      maxLon = Math.max(maxLon, lon)
    }
  }

  if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) return null
  return [minLon, minLat, maxLon, maxLat]
}
