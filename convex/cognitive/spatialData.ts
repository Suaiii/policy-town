import { SpatialMemory, SpatialTree } from './spatialMemory';

/**
 * Static spatial configuration: named sectors/arenas/objects with tile
 * coordinates for each known map. The engine's WorldMap has no semantic
 * regions, so the cognitive module gets its spatial memory from here.
 * Coordinates were chosen on walkable tiles of the map.
 */
export interface SpatialAreaConfig {
  sector: string;
  arena: string;
  x: number;
  y: number;
  objects?: Record<string, { x: number; y: number }>;
}

export const GENTLE_SPATIAL_CONFIG: SpatialAreaConfig[] = [
  { sector: 'central', arena: 'central_plaza', x: 32, y: 24, objects: { fountain: { x: 34, y: 24 }, bench: { x: 30, y: 24 } } },
  { sector: 'north', arena: 'north_plaza', x: 32, y: 8 },
  { sector: 'north', arena: 'west_garden', x: 16, y: 12, objects: { tree: { x: 15, y: 13 } } },
  { sector: 'north', arena: 'east_market', x: 44, y: 18, objects: { stall: { x: 44, y: 16 } } },
  { sector: 'south', arena: 'south_park', x: 20, y: 30, objects: { tree: { x: 21, y: 31 } } },
  { sector: 'south', arena: 'east_street', x: 40, y: 30 },
  { sector: 'south', arena: 'south_gate', x: 56, y: 24 },
  { sector: 'south', arena: 'meeting_point', x: 12, y: 28 },
];

export interface MapLike {
  width: number;
  height: number;
  tileSetUrl?: string;
}

/** Pick the spatial config for a map (keyed by tileset url; falls back to a single arena). */
export function configForMap(map: MapLike): SpatialAreaConfig[] {
  const url = map.tileSetUrl ?? '';
  if (url.includes('gentle')) {
    return GENTLE_SPATIAL_CONFIG;
  }
  return [
    {
      sector: 'town',
      arena: 'town_center',
      x: Math.floor(map.width / 2),
      y: Math.floor(map.height / 2),
    },
  ];
}

/** Build a SpatialMemory tree from the map and its config. */
export function buildSpatialTree(map: MapLike): SpatialMemory {
  const config = configForMap(map);
  const tree: SpatialTree = {};
  for (const area of config) {
    tree[area.sector] ??= {};
    tree[area.sector][area.arena] = {
      objects: area.objects ?? {},
    };
  }
  return SpatialMemory.fromTree(tree);
}

/** The nearest configured area center to a tile position. */
export function nearestArea(
  areas: { sector: string; arena: string; x: number; y: number }[],
  position: { x: number; y: number },
): { sector: string; arena: string; x: number; y: number } {
  if (areas.length === 0) {
    return { sector: 'town', arena: 'town_center', x: position.x, y: position.y };
  }
  let best = areas[0];
  let bestDist = Infinity;
  for (const area of areas) {
    const dist = (area.x - position.x) ** 2 + (area.y - position.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = area;
    }
  }
  return best;
}
