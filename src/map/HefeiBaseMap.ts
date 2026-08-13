import type { LayerSpecification, SourceSpecification } from 'maplibre-gl'
import {
  chaoLake,
  hefeiBoundary,
  hefeiRoads,
  industryDistricts,
  urbanBlocks,
  urbanRoadGrid,
  urbanWaterways,
} from './data/hefeiGeoData'

export const HEFEI_BASE_SOURCES: Record<string, SourceSpecification> = {
  'hefei-boundary': {
    type: 'geojson',
    data: hefeiBoundary,
    attribution: '© OpenStreetMap contributors, ODbL',
  },
  'chao-lake': {
    type: 'geojson',
    data: chaoLake,
    attribution: '© OpenStreetMap contributors, ODbL',
  },
  'hefei-roads': { type: 'geojson', data: hefeiRoads },
  'industry-districts': { type: 'geojson', data: industryDistricts },
  'urban-blocks': { type: 'geojson', data: urbanBlocks },
  'urban-road-grid': { type: 'geojson', data: urbanRoadGrid },
  'urban-waterways': { type: 'geojson', data: urbanWaterways },
}

export const HEFEI_BASE_LAYERS: LayerSpecification[] = [
  {
    id: 'hefei-shadow',
    type: 'fill',
    source: 'hefei-boundary',
    paint: { 'fill-color': '#12231e', 'fill-opacity': 0.72, 'fill-translate': [0, 7] },
  },
  {
    id: 'hefei-land',
    type: 'fill',
    source: 'hefei-boundary',
    paint: { 'fill-color': '#40594b', 'fill-opacity': 0.98, 'fill-outline-color': '#b59a6c' },
  },
  {
    id: 'hefei-border',
    type: 'line',
    source: 'hefei-boundary',
    paint: { 'line-color': '#c4a471', 'line-width': 2.2, 'line-opacity': 0.74 },
  },
  {
    id: 'chao-lake-fill',
    type: 'fill',
    source: 'chao-lake',
    paint: { 'fill-color': '#315e63', 'fill-opacity': 0.98, 'fill-outline-color': '#79a6a6' },
  },
  {
    id: 'chao-lake-shimmer',
    type: 'line',
    source: 'chao-lake',
    paint: { 'line-color': '#8ab4b1', 'line-width': 1.4, 'line-opacity': 0.55 },
  },
  {
    id: 'urban-blocks',
    type: 'fill',
    source: 'urban-blocks',
    paint: {
      'fill-color': ['match', ['get', 'tone'], 0, '#526757', 1, '#485f51', '#40574b'],
      'fill-opacity': 0.72,
      'fill-outline-color': '#61766a',
    },
  },
  {
    id: 'urban-waterway-casing',
    type: 'line',
    source: 'urban-waterways',
    paint: { 'line-color': '#1b3536', 'line-width': 11, 'line-opacity': 0.88 },
  },
  {
    id: 'urban-waterway',
    type: 'line',
    source: 'urban-waterways',
    paint: { 'line-color': '#3f7374', 'line-width': 6.5, 'line-opacity': 0.95 },
  },
  {
    id: 'urban-road-grid-casing',
    type: 'line',
    source: 'urban-road-grid',
    paint: { 'line-color': '#26362f', 'line-width': 3.4, 'line-opacity': 0.92 },
  },
  {
    id: 'urban-road-grid',
    type: 'line',
    source: 'urban-road-grid',
    paint: {
      'line-color': ['match', ['get', 'class'], 'avenue', '#b49b71', '#81928a'],
      'line-width': ['match', ['get', 'class'], 'avenue', 1.35, 0.75],
      'line-opacity': 0.8,
    },
  },
  {
    id: 'expressway-casing',
    type: 'line',
    source: 'hefei-roads',
    filter: ['==', ['get', 'class'], 'expressway'],
    paint: { 'line-color': '#101b19', 'line-width': 5.5, 'line-opacity': 0.82 },
  },
  {
    id: 'expressway',
    type: 'line',
    source: 'hefei-roads',
    filter: ['==', ['get', 'class'], 'expressway'],
    paint: { 'line-color': '#c3a470', 'line-width': 2.1, 'line-opacity': 0.88 },
  },
  {
    id: 'arterials',
    type: 'line',
    source: 'hefei-roads',
    filter: ['==', ['get', 'class'], 'arterial'],
    paint: { 'line-color': '#7da39a', 'line-width': 1.5, 'line-dasharray': [2, 1.4], 'line-opacity': 0.82 },
  },
  {
    id: 'district-points',
    type: 'circle',
    source: 'industry-districts',
    paint: {
      'circle-radius': 4,
      'circle-color': '#d1ad72',
      'circle-stroke-color': '#172521',
      'circle-stroke-width': 2,
    },
  },
]
