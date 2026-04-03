import { sortFaceDirections } from '@/lib/face-directions'
import type { FaceDirection } from '@/types/domain'

export function parseCoordinate(value: string): number | null {
  if (value.trim() === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Number.NaN

  return parsed
}

export function formatCoordinate(value: number) {
  return value.toFixed(6)
}

export function parseOptionalCoordinate(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

export function isImageMetadataDirty(input: {
  initialLatitude: string
  initialLongitude: string
  latitude: string
  longitude: string
  initialFaceDirections: FaceDirection[]
  faceDirections: FaceDirection[]
  initialLocationMode: 'shared' | 'custom'
  locationMode: 'shared' | 'custom'
}) {
  const initialLat = parseCoordinate(input.initialLatitude)
  const initialLng = parseCoordinate(input.initialLongitude)
  const currentLat = parseCoordinate(input.latitude)
  const currentLng = parseCoordinate(input.longitude)

  return initialLat !== currentLat
    || initialLng !== currentLng
    || sortFaceDirections(input.initialFaceDirections).join('|') !== sortFaceDirections(input.faceDirections).join('|')
    || input.initialLocationMode !== input.locationMode
}

export function isCragMetadataDirty(input: {
  canEditCragMetadata: boolean
  cragName: string
  initialCragName: string
  regionTag: string
  initialRegionTag: string
  subArea: string
  initialSubArea: string
}) {
  if (!input.canEditCragMetadata) return false

  return input.cragName.trim() !== input.initialCragName.trim()
    || input.regionTag.trim() !== input.initialRegionTag.trim()
    || input.subArea.trim() !== input.initialSubArea.trim()
}
