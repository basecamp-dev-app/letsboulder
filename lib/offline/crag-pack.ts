import { createClient } from '@/lib/supabase'
import { getOfflineDb } from '@/lib/offline/db'
import { createObjectUrlFromCache, putInOfflineCache, removeFromOfflineCache } from '@/lib/offline/cache'
import { OFFLINE_PAGES_CACHE, offlineCragMapRequestUrl } from '@/lib/offline/constants'
import {
  bbox4326ToBbox3857,
  computeBboxFromPoints4326,
  expandBbox4326,
  geoJsonPolygonBounds4326,
  projectLonLatToWebMercator,
} from '@/lib/offline/geo'
import type {
  OfflineCragMeta,
  OfflineCragRecord,
  OfflineDownloadProgress,
  OfflineImageRecord,
  OfflineRouteLine,
} from '@/lib/offline/types'

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function bearingDegrees(from: [number, number], to: [number, number]) {
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLon = lon2 - lon1
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

function haversineMeters(from: [number, number], to: [number, number]) {
  const R = 6371000
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

async function asyncPool<T, R>(
  concurrency: number,
  items: T[],
  iterator: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const ret: R[] = []
  const executing: Array<Promise<void>> = []

  for (let i = 0; i < items.length; i++) {
    const p = iterator(items[i], i).then((r) => {
      ret[i] = r
    })
    const e = p.then(() => {
      const idx = executing.indexOf(e)
      if (idx >= 0) executing.splice(idx, 1)
    })
    executing.push(e)
    if (executing.length >= concurrency) await Promise.race(executing)
  }

  await Promise.all(executing)
  return ret
}

export async function isCragDownloaded(cragId: string) {
  const db = await getOfflineDb()
  const meta = await db.get('cragMeta', cragId)
  return !!meta
}

export async function getOfflineCragMeta(cragId: string) {
  const db = await getOfflineDb()
  return await db.get('cragMeta', cragId)
}

export async function getOfflineCrag(cragId: string) {
  const db = await getOfflineDb()
  return await db.get('crags', cragId)
}

export async function getOfflineImagesForCrag(cragId: string) {
  const db = await getOfflineDb()
  return await db.getAllFromIndex('images', 'by-crag', cragId)
}

export async function getOfflineImage(imageId: string) {
  const db = await getOfflineDb()
  return await db.get('images', imageId)
}

export async function getOfflineCragMapObjectUrl(cragId: string) {
  return await createObjectUrlFromCache(offlineCragMapRequestUrl(cragId))
}

export async function listOfflineCrags(): Promise<OfflineCragMeta[]> {
  const db = await getOfflineDb()
  const metas = await db.getAll('cragMeta')
  metas.sort((a, b) => b.downloadedAt - a.downloadedAt)
  return metas
}

export async function removeCragDownload(cragId: string) {
  const db = await getOfflineDb()

  const existingImages = await db.getAllFromIndex('images', 'by-crag', cragId)

  const pagesCache = await caches.open(OFFLINE_PAGES_CACHE)
  await pagesCache.delete(`/crag/${cragId}`)
  for (const img of existingImages) {
    await pagesCache.delete(`/image/${img.imageId}`)
  }

  const tx = db.transaction(['cragMeta', 'crags', 'images'], 'readwrite')
  await tx.objectStore('cragMeta').delete(cragId)
  await tx.objectStore('crags').delete(cragId)

  const keys = await tx.objectStore('images').index('by-crag').getAllKeys(cragId)
  for (const key of keys) {
    await tx.objectStore('images').delete(key as string)
  }
  await tx.done

  await removeFromOfflineCache(offlineCragMapRequestUrl(cragId))

  await asyncPool(6, existingImages, async (img) => {
    try {
      await removeFromOfflineCache(img.url)
    } catch {
      // ignore
    }
    return true
  })
}

function computeOfflineImageOrder(images: Array<{ id: string; latitude: number | null; longitude: number | null }>) {
  const withGeo = images
    .filter((img) => img.latitude != null && img.longitude != null)
    .map((img) => ({ id: img.id, lat: img.latitude!, lon: img.longitude! }))

  if (withGeo.length === 0) return new Map<string, number>()

  const center: [number, number] = [
    withGeo.reduce((s, x) => s + x.lat, 0) / withGeo.length,
    withGeo.reduce((s, x) => s + x.lon, 0) / withGeo.length,
  ]

  const sortable = withGeo.map((x) => {
    const pos: [number, number] = [x.lat, x.lon]
    return {
      id: x.id,
      bearing: bearingDegrees(center, pos),
      dist: haversineMeters(center, pos),
    }
  })
  sortable.sort((a, b) => (a.bearing !== b.bearing ? a.bearing - b.bearing : a.dist - b.dist))
  const out = new Map<string, number>()
  sortable.forEach((x, idx) => out.set(x.id, idx + 1))
  return out
}

async function generateAndCacheCragScreenshot(options: {
  cragId: string
  bbox4326: [number, number, number, number]
  bbox3857: [number, number, number, number]
  width: number
  height: number
  boundary: unknown | null
  pins: Array<{ id: string; latitude: number; longitude: number; index?: number; verified: boolean }>
}) {
  if (typeof window === 'undefined') throw new Error('Screenshot generation requires a browser')

  const { cragId, bbox4326, bbox3857, width, height, boundary, pins } = options
  const [minLon, minLat, maxLon, maxLat] = bbox4326
  const mapRes = await fetch(
    `/api/crags/${cragId}/static-map?bbox=${encodeURIComponent(
      `${minLon},${minLat},${maxLon},${maxLat}`
    )}&w=${width}&h=${height}`
  )
  if (!mapRes.ok) throw new Error('Failed to generate basemap')
  const blob = await mapRes.blob()

  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  ctx.drawImage(bitmap, 0, 0, width, height)

  const [minX, minY, maxX, maxY] = bbox3857
  const scaleX = width / (maxX - minX)
  const scaleY = height / (maxY - minY)

  const toPx = (lon: number, lat: number) => {
    const [x, y] = projectLonLatToWebMercator(lon, lat)
    const px = (x - minX) * scaleX
    const py = (maxY - y) * scaleY
    return [px, py] as [number, number]
  }

  if (boundary) {
    const coords = (boundary as { coordinates?: unknown }).coordinates
    if (Array.isArray(coords) && Array.isArray(coords[0])) {
      const ring = coords[0] as unknown[]
      ctx.save()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)'
      ctx.setLineDash([8, 10])
      ctx.beginPath()
      let started = false
      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length < 2) continue
        const lon = Number(pt[0])
        const lat = Number(pt[1])
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
        const [px, py] = toPx(lon, lat)
        if (!started) {
          ctx.moveTo(px, py)
          started = true
        } else {
          ctx.lineTo(px, py)
        }
      }
      if (started) ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }
  }

  for (const pin of pins) {
    const [px, py] = toPx(pin.longitude, pin.latitude)
    const r = 14

    ctx.save()
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = pin.verified ? '#22c55e' : '#eab308'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.stroke()

    if (pin.index != null) {
      ctx.font = 'bold 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(pin.index), px, py + 0.5)
    }
    ctx.restore()
  }

  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error('Failed to encode PNG'))
      else resolve(b)
    }, 'image/png')
  })

  await putInOfflineCache(
    offlineCragMapRequestUrl(cragId),
    new Response(outBlob, { headers: { 'Content-Type': 'image/png' } })
  )
}

export async function downloadCragForOffline(
  cragId: string,
  options?: {
    onProgress?: (p: OfflineDownloadProgress) => void
  }
) {
  if (typeof window === 'undefined') throw new Error('Offline downloads are only available in the browser')
  if (!navigator.onLine) throw new Error('You are offline')

  if (navigator.storage?.persist) {
    try {
      await navigator.storage.persist()
    } catch {
      // ignore
    }
  }

  const onProgress = options?.onProgress
  onProgress?.({ phase: 'metadata', completed: 0, total: 1, message: 'Fetching crag data' })

  const supabase = createClient()

  const { data: cragData, error: cragError } = await supabase
    .from('crags')
    .select('id, name, latitude, longitude, region_id, description, access_notes, rock_type, type, boundary')
    .eq('id', cragId)
    .single()

  if (cragError || !cragData) throw new Error('Failed to load crag')

  const { data: imagesData, error: imagesError } = await supabase
    .from('images')
    .select(
      'id, url, latitude, longitude, is_verified, verification_count, crag_id, width, height, natural_width, natural_height, created_at'
    )
    .eq('crag_id', cragId)
    .order('created_at', { ascending: false })

  if (imagesError) throw new Error('Failed to load images')
  const images = imagesData || []

  const imageIds = images.map((x) => x.id)
  let routeLinesData: unknown[] = []
  if (imageIds.length > 0) {
    const { data, error: rlError } = await supabase
      .from('route_lines')
      .select(
        `
        id,
        image_id,
        points,
        color,
        climb_id,
        image_width,
        image_height,
        climbs (
          id,
          name,
          grade,
          description
        )
      `
      )
      .in('image_id', imageIds)

    if (rlError) throw new Error('Failed to load route lines')
    routeLinesData = (data as unknown as unknown[]) || []
  }

  const routeLinesByImageId = new Map<string, OfflineRouteLine[]>()
  for (const rl of (routeLinesData as unknown as OfflineRouteLine[]) || []) {
    const existing = routeLinesByImageId.get(rl.image_id) || []
    existing.push(rl)
    routeLinesByImageId.set(rl.image_id, existing)
  }

  const offlineOrder = computeOfflineImageOrder(images)

  const imageRecords: OfflineImageRecord[] = images.map((img) => {
    const routeLines = routeLinesByImageId.get(img.id) || []
    const formattedRouteLines = routeLines
      .filter((rl) => !!rl.climbs)
      .map((rl) => ({
        id: rl.id,
        points: rl.points,
        color: rl.color || '#ff00ff',
        imageWidth: rl.image_width,
        imageHeight: rl.image_height,
        climb: rl.climbs
          ? {
              id: rl.climbs.id,
              name: (rl.climbs.name || '').trim() || null,
              grade: (rl.climbs.grade || '').trim() || null,
              description: (rl.climbs.description || '').trim() || null,
            }
          : null,
      }))

    return {
      imageId: img.id,
      cragId,
      offlineIndex: offlineOrder.get(img.id),
      url: img.url,
      latitude: img.latitude,
      longitude: img.longitude,
      is_verified: img.is_verified || false,
      verification_count: img.verification_count || 0,
      width: img.width ?? null,
      height: img.height ?? null,
      natural_width: img.natural_width ?? null,
      natural_height: img.natural_height ?? null,
      route_lines: formattedRouteLines,
    }
  })

  const boundaryBbox = geoJsonPolygonBounds4326(cragData.boundary)
  const pointsBbox = computeBboxFromPoints4326(images)
  const fallbackPoint =
    cragData.latitude != null && cragData.longitude != null
      ? ([cragData.longitude, cragData.latitude, cragData.longitude, cragData.latitude] as [
          number,
          number,
          number,
          number
        ])
      : null

  const baseBbox = boundaryBbox || pointsBbox || fallbackPoint
  if (!baseBbox) throw new Error('Unable to compute crag bounds')
  const bbox4326 = expandBbox4326(baseBbox)
  const bbox3857 = bbox4326ToBbox3857(bbox4326)
  const screenshotRequestUrl = offlineCragMapRequestUrl(cragId)

  const meta: OfflineCragMeta = {
    cragId,
    name: cragData.name,
    downloadedAt: Date.now(),
    bbox4326,
    bbox3857,
    screenshotRequestUrl,
    screenshotUpdatedAt: Date.now(),
  }

  const cragRecord: OfflineCragRecord = {
    cragId,
    crag: {
      id: cragData.id,
      name: cragData.name,
      latitude: cragData.latitude,
      longitude: cragData.longitude,
      region_id: cragData.region_id,
      description: cragData.description,
      access_notes: cragData.access_notes,
      rock_type: cragData.rock_type,
      type: cragData.type,
      boundary: cragData.boundary,
    },
  }

  onProgress?.({ phase: 'metadata', completed: 1, total: 1, message: 'Saving offline metadata' })

  const db = await getOfflineDb()
  const tx = db.transaction(['cragMeta', 'crags', 'images'], 'readwrite')

  await tx.objectStore('cragMeta').put(meta, cragId)
  await tx.objectStore('crags').put(cragRecord, cragId)

  const existingKeys = await tx.objectStore('images').index('by-crag').getAllKeys(cragId)
  for (const key of existingKeys) {
    await tx.objectStore('images').delete(key as string)
  }

  for (const rec of imageRecords) {
    await tx.objectStore('images').put(rec, rec.imageId)
  }
  await tx.done

  const pagesCache = await caches.open(OFFLINE_PAGES_CACHE)
  const pageUrls = [`/crag/${cragId}`, ...imageRecords.map((x) => `/image/${x.imageId}`)]
  let pageCompleted = 0
  onProgress?.({ phase: 'pages', completed: pageCompleted, total: pageUrls.length, message: 'Saving pages for offline' })
  await asyncPool(3, pageUrls, async (url) => {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (res.ok) await pagesCache.put(url, res)
    } catch {
      // ignore
    } finally {
      pageCompleted += 1
      onProgress?.({ phase: 'pages', completed: pageCompleted, total: pageUrls.length })
    }
    return true
  })

  const pins = imageRecords
    .filter((x) => x.latitude != null && x.longitude != null)
    .map((x) => ({
      id: x.imageId,
      latitude: x.latitude!,
      longitude: x.longitude!,
      index: x.offlineIndex,
      verified: x.is_verified,
    }))

  onProgress?.({ phase: 'screenshot', completed: 0, total: 1, message: 'Generating map screenshot' })
  await generateAndCacheCragScreenshot({
    cragId,
    bbox4326,
    bbox3857,
    width: 1200,
    height: 700,
    boundary: cragData.boundary,
    pins,
  })
  onProgress?.({ phase: 'screenshot', completed: 1, total: 1, message: 'Map screenshot saved' })

  const totalImages = imageRecords.length
  let completed = 0
  onProgress?.({ phase: 'images', completed, total: totalImages, message: 'Downloading images' })

  await asyncPool(4, imageRecords, async (img) => {
    try {
      const res = await fetch(img.url, { cache: 'no-cache' })
      if (res.ok || res.type === 'opaque') {
        await putInOfflineCache(img.url, res.clone())
      }
    } finally {
      completed += 1
      onProgress?.({ phase: 'images', completed, total: totalImages })
    }
    return true
  })

  return { crag: cragRecord, meta, imageCount: totalImages }
}
