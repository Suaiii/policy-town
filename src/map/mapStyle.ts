import type { StyleSpecification } from 'maplibre-gl'
import { HEFEI_BASE_LAYERS, HEFEI_BASE_SOURCES } from './HefeiBaseMap'

export const HEFEI_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'Hefei tabletop local style',
  sources: HEFEI_BASE_SOURCES,
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#07100f' },
    },
    ...HEFEI_BASE_LAYERS,
  ],
  light: {
    anchor: 'viewport',
    color: '#f3d4a0',
    intensity: 0.34,
    position: [1.2, 210, 35],
  },
}
