export interface VectorMapConfig {
  mode: 'hosted-style' | 'offline-pins-only'
  styleUrl: string
  attribution: string
}

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export function getVectorMapConfig(options?: { offline?: boolean }): VectorMapConfig {
  if (options?.offline) {
    return {
      mode: 'offline-pins-only',
      styleUrl: '',
      attribution: '',
    }
  }

  return {
    mode: 'hosted-style',
    styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL,
    attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  }
}
