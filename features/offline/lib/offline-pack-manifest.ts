import type { OfflinePackAsset, OfflinePackManifest } from '@/features/offline/lib/offline-pack-types'

type JsonObject = Record<string, unknown>
export const OFFLINE_READER_VERSION = 2
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/

interface OfflineChildPackManifest {
  packId: string
  kind: 'climb'
  entityId: string
  displayName: string
  version: string
  manifestUrl: string
  exactTotalBytes: number
  assets: OfflinePackAsset[]
  dependentManifestUrls: []
  payload: unknown
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: JsonObject, key: string): string {
  const field = value[key]
  if (typeof field !== 'string' || field.length === 0) throw new Error(`Offline manifest has invalid ${key}`)
  return field
}

function numberField(value: JsonObject, key: string): number {
  const field = value[key]
  if (typeof field !== 'number' || !Number.isFinite(field) || field < 0) {
    throw new Error(`Offline manifest has invalid ${key}`)
  }
  return field
}

function assetFromRecord(asset: JsonObject, baseUrl: string): OfflinePackAsset {
  const url = stringField(asset, 'url')
  let absolute: string
  try {
    absolute = new URL(url, baseUrl).href
  } catch {
    throw new Error(`Offline manifest contains an invalid asset URL: ${url}`)
  }
  const byteCount = numberField(asset, 'byteCount')
  if (!Number.isSafeInteger(byteCount) || byteCount <= 0) throw new Error('Offline manifest asset has invalid byteCount')
  const digest = stringField(asset, 'digest')
  if (!SHA256_PATTERN.test(digest)) throw new Error('Offline manifest asset has invalid digest')
  const mediaType = stringField(asset, 'mediaType')
  const requirement = asset.requirement
  if (requirement !== 'required' && requirement !== 'optional') throw new Error('Offline manifest asset has invalid requirement')
  const owningClimbIds = asset.owningClimbIds
  if (!Array.isArray(owningClimbIds) || !owningClimbIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('Offline manifest asset has invalid owningClimbIds')
  }
  return {
    url: absolute,
    contentKey: stringField(asset, 'contentKey'),
    byteCount,
    mediaType,
    digest: digest as `sha256:${string}`,
    requirement,
    owningImageId: optionalString(asset, 'owningImageId'),
    owningClimbIds: [...owningClimbIds].sort(),
  }
}

function assetList(value: JsonObject, baseUrl: string): OfflinePackAsset[] {
  const field = value.assets
  if (field === undefined) return []
  if (!Array.isArray(field) || !field.every(isObject)) throw new Error('Offline manifest has invalid assets')
  return field.map((asset) => assetFromRecord(asset, baseUrl))
}

function uniqueAssets(assets: OfflinePackAsset[]): OfflinePackAsset[] {
  const byUrl = new Map<string, OfflinePackAsset>()
  for (const asset of assets) {
    const existing = byUrl.get(asset.url)
    if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) {
      throw new Error('Offline manifest contains conflicting asset integrity metadata')
    }
    byUrl.set(asset.url, asset)
  }
  return [...byUrl.values()]
}

function uniqueIds(records: JsonObject[], kind: string): Set<string> {
  const ids = records.map((record) => stringField(record, 'id'))
  if (new Set(ids).size !== ids.length) throw new Error(`Offline manifest has duplicate ${kind} identities`)
  return new Set(ids)
}

function optionalString(value: JsonObject, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' && field.length > 0 ? field : null
}

function parseClimbManifest(payload: unknown, requestedUrl: string): OfflineChildPackManifest {
  if (!isObject(payload)) throw new Error('Offline manifest response must be an object')
  const candidate = isObject(payload.offline_pack) ? payload.offline_pack : payload
  const type = candidate.type

  const inferredClimb = type === 'climb' || typeof candidate.climbId === 'string'
  if (!inferredClimb) throw new Error('Offline manifest has an unsupported pack type')
  return {
    packId: stringField(candidate, 'packId'),
    kind: 'climb',
    entityId: stringField(candidate, 'climbId'),
    displayName: stringField(candidate, 'climbName'),
    version: stringField(candidate, 'version'),
    manifestUrl: typeof candidate.manifestUrl === 'string' ? candidate.manifestUrl : requestedUrl,
    exactTotalBytes: numberField(candidate, 'exactTotalBytes'),
    assets: uniqueAssets([
      ...assetList(candidate, requestedUrl),
    ]),
    dependentManifestUrls: [],
    payload,
  }
}

export function parseOfflinePackManifest(payload: unknown, requestedUrl: string): OfflinePackManifest {
  if (!isObject(payload)) throw new Error('Offline manifest response must be an object')
  const candidate = isObject(payload.offline_pack) ? payload.offline_pack : payload
  if (candidate.type !== 'crag') throw new Error('Only crag guides can be saved offline')
  return parseCragManifest(payload, requestedUrl)
}

function parseCragManifest(payload: unknown, requestedUrl: string): OfflinePackManifest {
  if (!isObject(payload)) throw new Error('Offline manifest response must be an object')
  const candidate = isObject(payload.offline_pack) ? payload.offline_pack : payload
  const type = candidate.type
  if (type !== 'crag') throw new Error('Only crag guides can be saved offline')
  if (candidate.schemaVersion !== OFFLINE_READER_VERSION) {
    throw new Error('Offline manifest has an unsupported schemaVersion')
  }
  if (typeof candidate.minReaderVersion !== 'number' || candidate.minReaderVersion > OFFLINE_READER_VERSION) {
    throw new Error('Offline manifest requires a newer reader')
  }
  if (!isObject(candidate.reader) || candidate.reader.family !== 'letsboulder-offline-field-guide'
    || candidate.reader.minimumVersion !== candidate.minReaderVersion) {
    throw new Error('Offline manifest has incompatible reader metadata')
  }
  const contentVersion = stringField(candidate, 'contentVersion')
  if (contentVersion !== stringField(candidate, 'cragVersionHash')) {
    throw new Error('Offline manifest has inconsistent content version metadata')
  }
  const generatedAt = stringField(candidate, 'generatedAt')
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Offline manifest has invalid generation time')
  if (!stringField(candidate, 'canonicalPath').startsWith('/')) throw new Error('Offline manifest has invalid canonical path')
  if (!isObject(candidate.metadata) || !isObject(candidate.metadata.crag)
    || !Array.isArray(candidate.metadata.climbs) || !Array.isArray(candidate.metadata.images)
    || !Array.isArray(candidate.metadata.routeLines) || !Array.isArray(candidate.metadata.sectors)) {
    throw new Error('Offline manifest has invalid metadata')
  }
  const tiles = candidate.tileManifest
  if (tiles !== undefined && tiles !== null && !isObject(tiles)) throw new Error('Offline manifest has invalid tileManifest')
  const climbs = candidate.climbs
  if (!Array.isArray(climbs) || !climbs.every(isObject)) throw new Error('Offline manifest has invalid climbs')
  const dependentManifestUrls = climbs.map((climb) => optionalString(climb, 'manifestUrl')).filter((url): url is string => url !== null)
  const assets = uniqueAssets(assetList(candidate, requestedUrl))
  const requiredAssets = assets.filter((asset) => asset.requirement === 'required')
  const exactTotalBytes = numberField(candidate, 'exactTotalBytes')
  if (requiredAssets.reduce((total, asset) => total + asset.byteCount, 0) !== exactTotalBytes) {
    throw new Error('Offline manifest exactTotalBytes does not match required assets')
  }
  validateRelationships(candidate, requiredAssets)
  return {
    packId: stringField(candidate, 'packId'), kind: 'crag', entityId: stringField(candidate, 'cragId'),
    displayName: stringField(candidate, 'cragName'), version: stringField(candidate, 'cragVersionHash'),
    manifestUrl: typeof candidate.manifestUrl === 'string' ? candidate.manifestUrl : requestedUrl,
    exactTotalBytes,
    assets, dependentManifestUrls, payload,
  }
}

function validateRelationships(candidate: JsonObject, requiredAssets: OfflinePackAsset[]): void {
  const metadata = candidate.metadata as JsonObject
  const climbs = metadata.climbs as JsonObject[]
  const images = metadata.images as JsonObject[]
  const sectors = metadata.sectors as JsonObject[]
  const routeLines = metadata.routeLines as JsonObject[]
  const climbIds = uniqueIds(climbs, 'climb')
  const imageIds = uniqueIds(images, 'image')
  const sectorIds = uniqueIds(sectors, 'sector')
  uniqueIds(routeLines, 'route-line')
  const cragId = stringField(candidate, 'cragId')
  if (!isObject(metadata.crag) || stringField(metadata.crag, 'id') !== cragId) {
    throw new Error('Offline manifest has an inconsistent crag identity')
  }
  for (const climb of climbs) {
    const sectorId = optionalString(climb, 'sectorId')
    if (sectorId && !sectorIds.has(sectorId)) throw new Error('Offline manifest has an incomplete sector relationship')
  }
  const requiredImageIds = new Set(requiredAssets.flatMap((asset) => asset.owningImageId ? [asset.owningImageId] : []))
  for (const line of routeLines) {
    if (!climbIds.has(stringField(line, 'climbId')) || !imageIds.has(stringField(line, 'imageId'))
      || !requiredImageIds.has(stringField(line, 'imageId'))) {
      throw new Error('Offline manifest has an incomplete route-line relationship')
    }
  }
  for (const asset of requiredAssets) {
    if (!asset.owningImageId || !imageIds.has(asset.owningImageId)
      || asset.owningClimbIds.some((id) => !climbIds.has(id))) {
      throw new Error('Offline manifest has an incomplete asset ownership relationship')
    }
    const expectedOwners = routeLines
      .filter((line) => stringField(line, 'imageId') === asset.owningImageId)
      .map((line) => stringField(line, 'climbId'))
    if (JSON.stringify([...new Set(expectedOwners)].sort()) !== JSON.stringify(asset.owningClimbIds)) {
      throw new Error('Offline manifest has inconsistent asset ownership')
    }
  }
  const routes = candidate.requiredOfflineRoutes
  const cragRoute = `/offline/crag?id=${encodeURIComponent(cragId)}`
  const expectedRoutes = [cragRoute, ...[...climbIds].map((id) => `${cragRoute}&climb=${encodeURIComponent(id)}`)]
  if (!Array.isArray(routes) || routes.length !== expectedRoutes.length
    || !routes.every((route) => typeof route === 'string')
    || expectedRoutes.some((route) => !routes.includes(route))) {
    throw new Error('Offline manifest has invalid required offline routes')
  }
  const climbEntries = candidate.climbs
  const entryIds = Array.isArray(climbEntries) && climbEntries.every(isObject)
    ? climbEntries.map((entry) => stringField(entry, 'climbId'))
    : []
  if (!Array.isArray(climbEntries) || climbEntries.length !== climbIds.size
    || !climbEntries.every(isObject)
    || new Set(entryIds).size !== entryIds.length
    || entryIds.some((id) => !climbIds.has(id))) {
    throw new Error('Offline manifest has incomplete climb relationships')
  }
}

export async function fetchOfflinePackManifest(url: string, fetcher: typeof fetch = fetch): Promise<OfflinePackManifest> {
  const response = await fetcher(url, { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit' })
  if (!response.ok) throw new Error(`Offline manifest request failed (${response.status})`)
  const contentType = response.headers.get('content-type')
  if (!contentType?.toLowerCase().includes('application/json')) {
    throw new Error('Offline manifest response is not JSON')
  }
  return parseOfflinePackManifest(await response.json() as unknown, response.url || url)
}

export async function fetchOfflineChildPackManifest(url: string, fetcher: typeof fetch = fetch): Promise<OfflineChildPackManifest> {
  const response = await fetcher(url, { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit' })
  if (!response.ok) throw new Error(`Offline manifest request failed (${response.status})`)
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('Offline manifest response is not JSON')
  const payload = await response.json() as unknown
  if (!isObject(payload)) throw new Error('Offline manifest response must be an object')
  const candidate = isObject(payload.offline_pack) ? payload.offline_pack : payload
  if (candidate.type !== 'climb') throw new Error('Crag pack contains a non-climb dependency')
  return parseClimbManifest(payload, response.url || url)
}
