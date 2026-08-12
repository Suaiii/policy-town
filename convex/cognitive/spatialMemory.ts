import { WorldArea } from './types';

export interface SpatialObject {
  x: number;
  y: number;
}

export interface SpatialArena {
  objects: Record<string, SpatialObject>;
}

// world -> sector -> arena -> { objectName -> position }
export type SpatialTree = Record<string, Record<string, SpatialArena>>;

export interface LocatedObject {
  sector: string;
  arena: string;
  name: string;
  object: SpatialObject;
}

/**
 * Spatial memory: a tree of world -> sector -> arena -> game objects,
 * faithful to
 * generative_agents/reverie/backend_server/persona/memory_structures/spatial_memory.py
 */
export class SpatialMemory {
  constructor(private readonly tree: SpatialTree) {}

  static empty(): SpatialMemory {
    return new SpatialMemory({});
  }

  static fromTree(tree: SpatialTree): SpatialMemory {
    return new SpatialMemory(tree);
  }

  getTree(): SpatialTree {
    return this.tree;
  }

  getSectors(): string[] {
    return Object.keys(this.tree);
  }

  getArenas(sector: string): string[] {
    return Object.keys(this.tree[sector] ?? {});
  }

  getObjects(sector: string, arena: string): SpatialObject[] {
    return Object.values(this.tree[sector]?.[arena]?.objects ?? {});
  }

  findObject(name: string): LocatedObject | null {
    for (const sector of Object.keys(this.tree)) {
      for (const arena of Object.keys(this.tree[sector])) {
        const objects = this.tree[sector][arena].objects;
        const exact = objects[name];
        if (exact) {
          return { sector, arena, name, object: exact };
        }
        const lowered = name.toLowerCase();
        for (const key of Object.keys(objects)) {
          if (key.toLowerCase().includes(lowered)) {
            return { sector, arena, name: key, object: objects[key] };
          }
        }
      }
    }
    return null;
  }

  /** Pick a random arena within a sector (or any sector) as a destination. */
  sampleArena(sector?: string): WorldArea | null {
    const sectors = sector ? [sector] : this.getSectors();
    for (const s of sectors) {
      const arenas = this.getArenas(s);
      if (arenas.length > 0) {
        const arena = arenas[Math.floor(Math.random() * arenas.length)];
        return { sector: s, arena, x: 0, y: 0 };
      }
    }
    return null;
  }
}
