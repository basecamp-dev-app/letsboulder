import type { StyleSpecification } from 'maplibre-gl'

import type { VectorMapConfig } from '@/lib/map/vector-map-config'

const SOURCE_NAME = 'letsboulder-vector'
const FONT_STACK = 'Noto Sans Regular'

export function buildMapLibreStyle(config: VectorMapConfig): StyleSpecification {
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

  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      [SOURCE_NAME]: {
        type: 'vector',
        url: `pmtiles://${config.pmtilesUrl}`,
        attribution: config.attribution,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#f3efe7' },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: SOURCE_NAME,
        'source-layer': 'landuse',
        paint: { 'fill-color': '#e8e0cf', 'fill-opacity': 0.55 },
      },
      {
        id: 'water',
        type: 'fill',
        source: SOURCE_NAME,
        'source-layer': 'water',
        paint: { 'fill-color': '#a9cbd0' },
      },
      {
        id: 'boundaries',
        type: 'line',
        source: SOURCE_NAME,
        'source-layer': 'boundaries',
        paint: { 'line-color': '#b8ab96', 'line-opacity': 0.55, 'line-width': 0.8 },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: SOURCE_NAME,
        'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['minor_road', 'path', 'track']]],
        paint: { 'line-color': '#d8cdbb', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 14, 1.6] },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: SOURCE_NAME,
        'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]],
        paint: { 'line-color': '#c9a777', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 13, 3] },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: SOURCE_NAME,
        'source-layer': 'places',
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': [FONT_STACK],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 10, 13, 14, 15],
          'text-anchor': 'center',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#5f5749',
          'text-halo-color': '#f3efe7',
          'text-halo-width': 1.2,
        },
      },
    ],
  }
}
