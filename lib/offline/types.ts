export interface OfflineCragMeta {
  cragId: string
  name: string
  downloadedAt: number
  bbox4326: [number, number, number, number]
  bbox3857: [number, number, number, number]
  screenshotRequestUrl: string
  screenshotUpdatedAt: number
}

export interface OfflineRoutePoint {
  x: number
  y: number
}

export interface OfflineRouteLine {
  id: string
  image_id: string
  points: OfflineRoutePoint[]
  color: string | null
  climb_id: string | null
  image_width: number | null
  image_height: number | null
  climbs: {
    id: string
    name: string | null
    grade: string | null
    description: string | null
    status?: string | null
  } | null
}

export interface OfflineImageRecord {
  imageId: string
  cragId: string
  offlineIndex?: number
  url: string
  latitude: number | null
  longitude: number | null
  is_verified: boolean
  verification_count: number
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  route_lines: Array<{
    id: string
    points: OfflineRoutePoint[]
    color: string
    imageWidth?: number | null
    imageHeight?: number | null
    climb: {
      id: string
      name: string | null
      grade: string | null
      description: string | null
    } | null
  }>
}

export interface OfflineCragRecord {
  cragId: string
  crag: {
    id: string
    name: string
    latitude: number | null
    longitude: number | null
    region_id: string | null
    description: string | null
    access_notes: string | null
    rock_type: string | null
    type: string | null
    boundary: unknown | null
  }
}

export interface OfflineDownloadProgress {
  phase: 'metadata' | 'pages' | 'screenshot' | 'images'
  completed: number
  total: number
  message?: string
}
