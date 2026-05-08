import { haversineMeters } from '@/lib/geo/haversine'

export const CRAG_DUPLICATE_DISTANCE_METERS = 2000

export interface CragDuplicateCandidate {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
}

export interface CragDuplicateMatch extends CragDuplicateCandidate {
  distance: number | null
}

export function normalizeCragDuplicateName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function findCragDuplicateCandidate(input: {
  name: string
  latitude: number | null
  longitude: number | null
  candidates: CragDuplicateCandidate[]
  maxDistanceMeters?: number
}): CragDuplicateMatch | null {
  const normalizedName = normalizeCragDuplicateName(input.name)
  if (!normalizedName) return null

  const matches = input.candidates
    .filter((candidate) => normalizeCragDuplicateName(candidate.name) === normalizedName)
    .map((candidate) => {
      const distance = input.latitude !== null && input.longitude !== null && candidate.latitude !== null && candidate.longitude !== null
        ? Math.round(haversineMeters(input.latitude, input.longitude, candidate.latitude, candidate.longitude))
        : null

      return { ...candidate, distance }
    })
    .filter((candidate) => candidate.distance === null || candidate.distance <= (input.maxDistanceMeters ?? CRAG_DUPLICATE_DISTANCE_METERS))

  if (matches.length === 0) return null

  return matches.sort((a, b) => {
    if (a.distance === null) return 1
    if (b.distance === null) return -1
    return a.distance - b.distance
  })[0]
}
