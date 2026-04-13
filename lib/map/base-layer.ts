export interface MapBaseLayerConfig {
  imageryUrl: string
  imageryAttribution: string
  labelsUrl: string | null
  labelsAttribution: string | null
  mode: 'satellite' | 'offline-fallback'
}

const ESRI_WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_WORLD_BOUNDARIES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
export function getMapBaseLayerConfig(options?: { offline?: boolean }): MapBaseLayerConfig {
  if (options?.offline) {
    return {
      imageryUrl: '/api/offline-tiles/imagery/{z}/{x}/{y}',
      imageryAttribution: 'Offline imagery tiles',
      labelsUrl: '/api/offline-tiles/labels/{z}/{x}/{y}',
      labelsAttribution: 'Offline labels tiles',
      mode: 'offline-fallback',
    }
  }

  return {
    imageryUrl: ESRI_WORLD_IMAGERY,
    imageryAttribution: 'Imagery © Esri',
    labelsUrl: ESRI_WORLD_BOUNDARIES,
    labelsAttribution: 'Labels © Esri',
    mode: 'satellite',
  }
}
