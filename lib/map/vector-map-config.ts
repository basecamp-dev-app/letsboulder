export interface VectorMapConfig {
  mode: 'vector' | 'offline-pins-only'
  pmtilesUrl: string
  attribution: string
}

export const DEFAULT_PMTILES_URL = 'https://static.letsboulder.com/maps/v1/planet.pmtiles'

export function getVectorMapConfig(options?: { offline?: boolean }): VectorMapConfig {
  if (options?.offline) {
    return {
      mode: 'offline-pins-only',
      pmtilesUrl: '',
      attribution: '',
    }
  }

  return {
    mode: 'vector',
    pmtilesUrl: process.env.NEXT_PUBLIC_PMTILES_URL || DEFAULT_PMTILES_URL,
    attribution: '© OpenStreetMap contributors',
  }
}
