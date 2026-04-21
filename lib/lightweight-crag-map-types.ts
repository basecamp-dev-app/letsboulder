export interface LightweightCragMapPin {
  id: string
  latitude: number
  longitude: number
  label?: string
  activeImageIds?: string[]
  primaryImageId?: string
  interactive?: boolean
  tone?: 'draft' | 'published'
}
