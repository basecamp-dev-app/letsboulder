export interface LightweightCragMapPin {
  id: string
  latitude: number
  longitude: number
  label?: string
  interactive?: boolean
  tone?: 'draft' | 'published'
}
