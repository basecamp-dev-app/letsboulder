export interface ManagedCragImage {
  imageId: string | null
  cragImageId: string | null
  sourceKind: 'canonical' | 'legacy'
  previewUrl: string | null
  status: string
  visibility: string
  processingStatus: string
  moderationStatus: string | null
  routeCount: number
  routesWithoutAlternativeImage: number
  routeNames: string[]
  createdAt: string | null
  canRemove: boolean
  canReplace: boolean
}
export interface ManagedCragSummary {
  id: string
  name: string
  countryCode: string | null
  slug: string | null
  regionName: string | null
  subArea: string | null
  routeCount: number
  imageCount: number
  publicationStatus: 'draft' | 'review' | 'published' | 'archived'
  publicationNotes: string | null
}

export interface ManagedCragImagesPage {
  crag: ManagedCragSummary
  images: ManagedCragImage[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  isAdmin: boolean
}
