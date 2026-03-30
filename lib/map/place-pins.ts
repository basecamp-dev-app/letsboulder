import type Supercluster from 'supercluster'

export interface PlacePin {
  id: string
  name: string
  type: 'crag' | 'gym'
  latitude: number
  longitude: number
  slug: string | null
  country_code: string | null
  image_count: number | null
  route_count: number | null
}

interface ClusterProperties extends PlacePin {
  cluster: false
  placeCount: 1
}

interface ClusterPointProperties {
  cluster: true
  cluster_id: number
  point_count: number
  point_count_abbreviated: string | number
}

export type ClusterFeature = GeoJSON.Feature<GeoJSON.Point, ClusterPointProperties>
export type PinFeature = GeoJSON.Feature<GeoJSON.Point, ClusterProperties>
export type ClusterResult = ClusterFeature | PinFeature
export type ClusterIndex = Supercluster<ClusterProperties, ClusterPointProperties>

export function buildPinFeatures(placePins: PlacePin[]): PinFeature[] {
  return placePins.map((pin) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [pin.longitude, pin.latitude],
    },
    properties: {
      ...pin,
      cluster: false,
      placeCount: 1,
    },
  }))
}

export function isClusterFeature(feature: ClusterResult): feature is ClusterFeature {
  return feature.properties.cluster === true
}
