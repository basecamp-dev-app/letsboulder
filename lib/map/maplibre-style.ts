import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'

import type { VectorMapConfig } from '@/lib/map/vector-map-config'

const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs'

export function buildMapLibreStyle(config: VectorMapConfig): StyleSpecification | string {
  if (typeof maplibregl.setWorkerUrl === 'function') {
    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL)
  }

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
