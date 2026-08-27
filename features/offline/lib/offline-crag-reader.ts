import type { CragPackManifest } from '@/types/crag-pack-manifest'

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
      && typeof asset.width === 'number' && typeof asset.height === 'number')
}

/** Reads current manifests and the wrapped payload written by the legacy child-pack installer. */
export function readOfflineCragPayload(payload: unknown): CragPackManifest | null {
  if (isReadableCragManifest(payload)) return payload
  if (!isObject(payload)) return null
  if (isReadableCragManifest(payload.offline_pack)) return payload.offline_pack
  if (isReadableCragManifest(payload.manifest)) return payload.manifest
  return isObject(payload.manifest) && isReadableCragManifest(payload.manifest.offline_pack)
    ? payload.manifest.offline_pack
    : null
}
