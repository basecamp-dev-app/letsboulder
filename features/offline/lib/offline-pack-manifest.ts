import type { OfflinePackAsset, OfflinePackManifest } from '@/features/offline/lib/offline-pack-types'

type JsonObject = Record<string, unknown>
const SUPPORTED_CRAG_SCHEMA_VERSION = 1

interface OfflineChildPackManifest {
  packId: string
  kind: 'climb'
  entityId: string
  displayName: string
  version: string
  manifestUrl: string
  estimatedBytes: number
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

function optionalUrlList(value: JsonObject, key: string): string[] {
  const field = value[key]
  if (field === undefined) return []
  if (!Array.isArray(field) || !field.every((entry) => typeof entry === 'string' && entry.length > 0)) {
    throw new Error(`Offline manifest has invalid ${key}`)
  }
  return field
}

function assetFromUrl(url: string, baseUrl: string, estimatedBytes: number | null = null, mediaType: string | null = null): OfflinePackAsset {
  let absolute: string
  try {
    absolute = new URL(url, baseUrl).href
  } catch {
    throw new Error(`Offline manifest contains an invalid asset URL: ${url}`)
  }
  return { url: absolute, estimatedBytes, mediaType }
}

function assetList(value: JsonObject, baseUrl: string): OfflinePackAsset[] {
  const field = value.assets
  if (field === undefined) return []
  if (!Array.isArray(field) || !field.every(isObject)) throw new Error('Offline manifest has invalid assets')
  return field.map((asset) => {
    const estimatedBytes = asset.estimatedBytes
    const mediaType = asset.mediaType
    if (estimatedBytes !== undefined && (typeof estimatedBytes !== 'number' || !Number.isFinite(estimatedBytes) || estimatedBytes < 0)) {
      throw new Error('Offline manifest asset has invalid estimatedBytes')
    }
    if (mediaType !== undefined && (typeof mediaType !== 'string' || mediaType.length === 0)) {
      throw new Error('Offline manifest asset has invalid mediaType')
    }
    return assetFromUrl(stringField(asset, 'url'), baseUrl, estimatedBytes ?? null, mediaType ?? null)
  })
}

function uniqueAssets(assets: OfflinePackAsset[]): OfflinePackAsset[] {
  const byUrl = new Map<string, OfflinePackAsset>()
  for (const asset of assets) byUrl.set(asset.url, asset)
  return [...byUrl.values()]
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
    estimatedBytes: numberField(candidate, 'estimatedBytes'),
    assets: uniqueAssets([
      ...optionalUrlList(candidate, 'mediaUrls').map((url) => assetFromUrl(url, requestedUrl)),
      ...optionalUrlList(candidate, 'tileUrls').map((url) => assetFromUrl(url, requestedUrl)),
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
  if (candidate.schemaVersion !== SUPPORTED_CRAG_SCHEMA_VERSION) {
    throw new Error('Offline manifest has an unsupported schemaVersion')
  }
  if (typeof candidate.minReaderVersion !== 'number' || candidate.minReaderVersion > SUPPORTED_CRAG_SCHEMA_VERSION) {
    throw new Error('Offline manifest requires a newer reader')
  }
  if (!isObject(candidate.metadata) || !isObject(candidate.metadata.crag)
    || !Array.isArray(candidate.metadata.climbs) || !Array.isArray(candidate.metadata.images)
    || !Array.isArray(candidate.metadata.routeLines) || !Array.isArray(candidate.metadata.sectors)) {
    throw new Error('Offline manifest has invalid metadata')
  }
  const tiles = candidate.tileManifest
  if (tiles !== undefined && tiles !== null && !isObject(tiles)) throw new Error('Offline manifest has invalid tileManifest')
  const climbs = candidate.climbs
  if (!Array.isArray(climbs) || !climbs.every(isObject)) throw new Error('Offline manifest has invalid climbs')
  const childMedia = climbs.flatMap((climb) => optionalUrlList(climb, 'mediaUrls')).map((url) => assetFromUrl(url, requestedUrl))
  const dependentManifestUrls = climbs.map((climb) => optionalString(climb, 'manifestUrl')).filter((url): url is string => url !== null)
  const tileUrls = isObject(tiles) ? optionalUrlList(tiles, 'tileUrls') : []
  return {
    packId: stringField(candidate, 'packId'), kind: 'crag', entityId: stringField(candidate, 'cragId'),
    displayName: stringField(candidate, 'cragName'), version: stringField(candidate, 'cragVersionHash'),
    manifestUrl: typeof candidate.manifestUrl === 'string' ? candidate.manifestUrl : requestedUrl,
    estimatedBytes: numberField(candidate, 'estimatedBytes'),
    assets: uniqueAssets([
      ...optionalUrlList(candidate, 'mediaUrls').map((url) => assetFromUrl(url, requestedUrl)),
      ...childMedia, ...tileUrls.map((url) => assetFromUrl(url, requestedUrl)), ...assetList(candidate, requestedUrl),
    ]), dependentManifestUrls, payload,
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
