import type { PhysicalAssetRole, ProjectArchetype } from '../../contracts/src'

export type MapAssetId =
  | 'factory-main'
  | 'factory-utility'
  | 'factory-warehouse'
  | 'factory-support'
  | 'factory-long-hall'
  | 'factory-sawtooth-hall'
  | 'factory-logistics-hall'
  | 'factory-energy-core'
  | 'factory-energy-utility'
  | 'factory-process-utility'
  | 'factory-production-annex'
  | 'factory-service-wing'
  | 'factory-admin-wing'
  | 'factory-compact-plant'
  | 'factory-logistics-depot'
  | 'factory-production-shed'
  | 'factory-utility-house'
  | 'rd-office-campus'
  | 'rd-office-tower'
  | 'rd-lab-block'
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
  'factory-long-hall': {
    id: 'factory-long-hall', url: `${base}/building-s.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'main', footprint: { width: 1.2, depth: 0.62 }, fallbackColor: '#75857d',
  },
  'factory-sawtooth-hall': {
    id: 'factory-sawtooth-hall', url: `${base}/building-k.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'main', footprint: { width: 1.08, depth: 0.7 }, fallbackColor: '#74827b',
  },
  'factory-logistics-hall': {
    id: 'factory-logistics-hall', url: `${base}/building-i.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'warehouse', footprint: { width: 0.78, depth: 0.54 }, fallbackColor: '#7d867d',
  },
  'factory-energy-core': {
    id: 'factory-energy-core', url: `${base}/building-t.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'main', footprint: { width: 0.96, depth: 0.72 }, fallbackColor: '#7c806d',
  },
  'factory-energy-utility': {
    id: 'factory-energy-utility', url: `${base}/building-e.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'utility', footprint: { width: 0.68, depth: 0.56 }, fallbackColor: '#8d8669',
  },
  'factory-process-utility': {
    id: 'factory-process-utility', url: `${base}/building-c.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'utility', footprint: { width: 0.68, depth: 0.56 }, fallbackColor: '#89836e',
  },
  'factory-production-annex': {
    id: 'factory-production-annex', url: `${base}/building-l.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'support', footprint: { width: 0.84, depth: 0.58 }, fallbackColor: '#71817b',
  },
  'factory-service-wing': {
    id: 'factory-service-wing', url: `${base}/building-g.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'support', footprint: { width: 0.72, depth: 0.56 }, fallbackColor: '#70847e',
  },
  'factory-admin-wing': {
    id: 'factory-admin-wing', url: `${base}/building-b.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'main', footprint: { width: 0.82, depth: 0.62 }, fallbackColor: '#71817a',
  },
  'factory-compact-plant': {
    id: 'factory-compact-plant', url: `${base}/building-f.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'support', footprint: { width: 0.7, depth: 0.56 }, fallbackColor: '#778179',
  },
  'factory-logistics-depot': {
    id: 'factory-logistics-depot', url: `${base}/building-j.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'warehouse', footprint: { width: 0.74, depth: 0.56 }, fallbackColor: '#7b847b',
  },
  'factory-production-shed': {
    id: 'factory-production-shed', url: `${base}/building-m.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'main', footprint: { width: 0.86, depth: 0.62 }, fallbackColor: '#78827a',
  },
  'factory-utility-house': {
    id: 'factory-utility-house', url: `${base}/building-n.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'utility', footprint: { width: 0.58, depth: 0.5 }, fallbackColor: '#89836d',
  },
  'rd-office-campus': {
    id: 'rd-office-campus', url: `${base}/building-a.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'main', footprint: { width: 0.86, depth: 0.62 }, fallbackColor: '#6d817d',
  },
  'rd-office-tower': {
    id: 'rd-office-tower', url: `${base}/building-d.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'support', footprint: { width: 0.62, depth: 0.5 }, fallbackColor: '#718681',
  },
  'rd-lab-block': {
    id: 'rd-lab-block', url: `${base}/building-o.glb`, dependencies: [`${base}/Textures/colormap.png`],
    license: 'CC0 1.0 — Kenney City Kit Industrial', role: 'warehouse', footprint: { width: 0.68, depth: 0.52 }, fallbackColor: '#70837f',
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
  'heavy-manufacturing': ['factory-long-hall', 'factory-production-annex', 'factory-logistics-hall', 'factory-utility'],
  'energy-manufacturing': ['factory-energy-core', 'factory-service-wing', 'factory-logistics-hall', 'factory-energy-utility'],
  'rd-pilot': ['rd-office-campus', 'rd-office-tower', 'rd-lab-block', 'factory-energy-utility'],
}

export const ARCHETYPE_ROLE_VARIANTS: Record<ProjectArchetype, Record<PhysicalAssetRole, MapAssetId[]>> = {
  'heavy-manufacturing': {
    main: ['factory-long-hall', 'factory-sawtooth-hall', 'factory-production-shed', 'factory-main'],
    support: ['factory-production-annex', 'factory-service-wing', 'factory-support', 'factory-compact-plant'],
    warehouse: ['factory-logistics-hall', 'factory-logistics-depot', 'factory-warehouse'],
    utility: ['factory-utility', 'factory-energy-utility', 'factory-process-utility', 'factory-utility-house'],
  },
  'energy-manufacturing': {
    main: ['factory-energy-core', 'factory-admin-wing', 'factory-production-shed', 'factory-main'],
    support: ['factory-service-wing', 'factory-compact-plant', 'factory-production-annex'],
    warehouse: ['factory-logistics-depot', 'factory-logistics-hall', 'factory-warehouse'],
    utility: ['factory-energy-utility', 'factory-process-utility', 'factory-utility-house', 'factory-utility'],
  },
  'rd-pilot': {
    main: ['rd-office-campus', 'factory-admin-wing', 'rd-office-procedural'],
    support: ['rd-office-tower', 'factory-service-wing', 'factory-compact-plant'],
    warehouse: ['rd-lab-block', 'factory-logistics-depot', 'factory-logistics-hall'],
    utility: ['factory-utility-house', 'factory-energy-utility', 'factory-process-utility', 'factory-utility'],
  },
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
