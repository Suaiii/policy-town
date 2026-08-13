import type { ProjectArchetype } from '../../contracts/src'

export type MapAssetId =
  | 'factory-main'
  | 'factory-utility'
  | 'factory-warehouse'
  | 'factory-support'
  | 'rd-office-procedural'
  | 'rd-pilot-hall'

export interface MapAssetDescriptor {
  id: MapAssetId
  url?: string
  dependencies: string[]
  license: string
  role: 'main' | 'support' | 'warehouse' | 'utility'
  footprint: { width: number; depth: number }
  fallbackColor: string
}

const base = '/models/kenney-industrial'

export const MAP_ASSET_CATALOG: Record<MapAssetId, MapAssetDescriptor> = {
  'factory-main': {
    id: 'factory-main', url: `${base}/building-q.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'main', footprint: { width: 1.15, depth: 0.72 }, fallbackColor: '#738b86',
  },
  'factory-utility': {
    id: 'factory-utility', url: `${base}/building-r.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'utility', footprint: { width: 0.72, depth: 0.6 }, fallbackColor: '#948a67',
  },
  'factory-warehouse': {
    id: 'factory-warehouse', url: `${base}/building-p.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'warehouse', footprint: { width: 0.9, depth: 0.62 }, fallbackColor: '#667e79',
  },
  'factory-support': {
    id: 'factory-support', url: `${base}/building-h.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'support', footprint: { width: 0.7, depth: 0.55 }, fallbackColor: '#8a826c',
  },
  'rd-office-procedural': {
    id: 'rd-office-procedural', dependencies: [], license: 'Project-authored procedural geometry', role: 'main',
    footprint: { width: 0.9, depth: 0.62 }, fallbackColor: '#777798',
  },
  'rd-pilot-hall': {
    id: 'rd-pilot-hall', url: `${base}/building-h.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'support', footprint: { width: 0.72, depth: 0.55 }, fallbackColor: '#817e99',
  },
}

export const ARCHETYPE_RECIPES: Record<ProjectArchetype, MapAssetId[]> = {
  'heavy-manufacturing': ['factory-main', 'factory-utility', 'factory-warehouse', 'factory-support'],
  'energy-manufacturing': ['factory-warehouse', 'factory-support', 'factory-utility'],
  'rd-pilot': ['rd-office-procedural', 'rd-pilot-hall'],
}

const validationCache = new Map<string, Promise<boolean>>()

export function validateAssetDependencies(asset: MapAssetDescriptor): Promise<boolean> {
  if (!asset.url) return Promise.resolve(true)
  const urls = [asset.url, ...asset.dependencies]
  const cacheKey = urls.join('|')
  const cached = validationCache.get(cacheKey)
  if (cached) return cached
  const validation = Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url, { method: 'GET' })
      return response.ok
    } catch {
      return false
    }
  })).then((results) => results.every(Boolean))
  validationCache.set(cacheKey, validation)
  return validation
}
