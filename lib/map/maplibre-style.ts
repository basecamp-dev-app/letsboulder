import type { StyleSpecification } from 'maplibre-gl'

import type { VectorMapConfig } from '@/lib/map/vector-map-config'

export function buildMapLibreStyle(config: VectorMapConfig): StyleSpecification | string {
  if (config.mode === 'offline-pins-only') {
    return {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#0f172a' },
        },
      ],
    }
  }

  return config.styleUrl
}
