import { FACE_DIRECTIONS, type FaceDirection } from '@/lib/submission-types'

export function normalizePointForCompare(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function sortFaceDirections(directions: FaceDirection[]): FaceDirection[] {
  return [...directions].sort((a, b) => FACE_DIRECTIONS.indexOf(a) - FACE_DIRECTIONS.indexOf(b))
}

export function coordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}:${longitude.toFixed(5)}`
}
