export interface SavedClimb {
  climbId: string
  createdAt: string
  name: string
  grade: string | null
  cragName: string
  canonicalUrl: string | null
}

export interface SavedCrag {
  cragId: string
  createdAt: string
  name: string
  regionName: string | null
  countryName: string | null
  canonicalUrl: string | null
}
