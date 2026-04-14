export interface MapBaseLayerConfig {
  imageryUrl: string
  imageryAttribution: string
  labelsUrl: string | null
  labelsAttribution: string | null
  mode: 'satellite' | 'offline-pins-only'
}

const ESRI_WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_WORLD_BOUNDARIES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
export function getMapBaseLayerConfig(options?: { offline?: boolean }): MapBaseLayerConfig {
  if (options?.offline) {
    return {
      imageryUrl: '',
      imageryAttribution: '',
      labelsUrl: null,
      labelsAttribution: null,
      mode: 'offline-pins-only',
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
