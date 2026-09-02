import { CRAG_PACK_SCHEMA_VERSION, type CragPackManifest } from '@/types/crag-pack-manifest'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function hasReadableCoordinates(value: unknown): boolean {
  return isObject(value) && isNullableNumber(value.latitude) && isNullableNumber(value.longitude)
}

function isReadableCragManifest(value: unknown): value is CragPackManifest {
  if (!isObject(value) || value.type !== 'crag' || typeof value.packId !== 'string'
    || typeof value.cragId !== 'string' || typeof value.cragName !== 'string'
    || value.schemaVersion !== CRAG_PACK_SCHEMA_VERSION || typeof value.minReaderVersion !== 'number'
    || value.minReaderVersion > CRAG_PACK_SCHEMA_VERSION
    || !isObject(value.metadata) || !isObject(value.metadata.crag)
    || typeof value.metadata.crag.name !== 'string' || !Array.isArray(value.metadata.climbs)
    || !Array.isArray(value.metadata.images) || !Array.isArray(value.metadata.routeLines)
    || !Array.isArray(value.assets)) return false

  return value.metadata.climbs.every((climb) => isObject(climb)
      && typeof climb.id === 'string' && typeof climb.grade === 'string'
      && hasReadableCoordinates(climb.coordinates))
    && value.metadata.images.every((image) => isObject(image) && typeof image.id === 'string')
    && value.metadata.routeLines.every((line) => isObject(line)
      && typeof line.id === 'string' && typeof line.climbId === 'string' && typeof line.imageId === 'string')
    && value.assets.every((asset) => isObject(asset) && typeof asset.imageId === 'string'
      && (asset.variant === 'detail' || asset.variant === 'topo') && typeof asset.url === 'string'
      && typeof asset.width === 'number' && typeof asset.height === 'number'
      && typeof asset.byteCount === 'number' && typeof asset.digest === 'string')
}

function isLegacyReadableCragManifest(value: unknown): boolean {
  if (!isObject(value) || value.type !== 'crag' || (value.schemaVersion !== undefined && value.schemaVersion !== 1)
    || typeof value.packId !== 'string' || typeof value.cragId !== 'string'
    || !isObject(value.metadata) || !isObject(value.metadata.crag)
    || typeof value.metadata.crag.name !== 'string' || !Array.isArray(value.metadata.climbs)
    || !Array.isArray(value.metadata.images) || !Array.isArray(value.metadata.routeLines)
    || !Array.isArray(value.assets)) return false
  return value.metadata.climbs.every((climb) => isObject(climb) && typeof climb.id === 'string' && typeof climb.grade === 'string')
    && value.assets.every((asset) => isObject(asset) && typeof asset.url === 'string')
}

function readable(value: unknown): CragPackManifest | null {
  if (isReadableCragManifest(value)) return value
  return isLegacyReadableCragManifest(value) ? value as unknown as CragPackManifest : null
}

/** Reads current manifests and the wrapped payload written by the legacy child-pack installer. */
export function readOfflineCragPayload(payload: unknown): CragPackManifest | null {
  const direct = readable(payload)
  if (direct) return direct
  if (!isObject(payload)) return null
  const nested = readable(payload.offline_pack) ?? readable(payload.manifest)
  if (nested) return nested
  return isObject(payload.manifest) ? readable(payload.manifest.offline_pack) : null
}
