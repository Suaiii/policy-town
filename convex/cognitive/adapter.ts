import { GameTime } from './time';
import { Intention } from './intentions';
import { SensoryInput, WorldArea } from './types';

export interface MapDims {
  width: number;
  height: number;
}

export interface EnginePlayerView {
  id: string;
  name: string;
  position: { x: number; y: number };
  activity?: { description: string } | null;
  pathfinding?: unknown;
  human?: string;
}

export interface EngineConversationView {
  participants: string[];
}

/**
 * Build the cognitive module's sensory input from engine state. Pure and
 * unit-testable; the engine adapter calls it with serialized world data.
 */
export function buildSensoryInput(args: {
  playerId: string;
  playerPosition: { x: number; y: number };
  players: EnginePlayerView[];
  conversations: EngineConversationView[];
  areas: WorldArea[];
  objectsInArena: { name: string; arena: string; x: number; y: number }[];
  visionRadius: number;
}): SensoryInput {
  const { playerId, playerPosition, players, conversations, areas, objectsInArena, visionRadius } = args;
  const currentArea = nearestArea(areas, playerPosition);

  const visibleAgents = players
    .filter((p) => p.id !== playerId)
    .filter((p) => Math.hypot(p.position.x - playerPosition.x, p.position.y - playerPosition.y) <= visionRadius)
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      currentAction: p.activity?.description ?? (p.pathfinding ? 'walking around' : null),
      inConversation: conversations.some((c) => c.participants.includes(p.id)),
    }));

  const visibleConversations = conversations
    .filter((c) =>
      c.participants.some((pid) =>
        players.some(
          (p) =>
            p.id === pid &&
            Math.hypot(p.position.x - playerPosition.x, p.position.y - playerPosition.y) <= visionRadius,
        ),
      ),
    )
    .map((c) => ({ participants: c.participants }));

  const visibleObjects = objectsInArena.filter((o) => o.arena === currentArea.arena);

  return {
    currentLocation: currentArea,
    visibleAgents,
    visibleObjects,
    visibleConversations,
  };
}

/** Clamp a tile position into the walkable bounds of the map. */
export function clampToBounds(pos: { x: number; y: number }, map: MapDims): { x: number; y: number } {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    x: clamp(Math.round(pos.x), 1, map.width - 2),
    y: clamp(Math.round(pos.y), 1, map.height - 2),
  };
}

/** Find an open tile near `pos`, spiraling outward up to `radius` tiles. */
export function findOpenTile(
  pos: { x: number; y: number },
  map: MapDims,
  isBlocked: (x: number, y: number) => boolean,
  radius = 5,
): { x: number; y: number } | null {
  if (!isBlocked(pos.x, pos.y)) {
    return pos;
  }
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) {
          continue;
        }
        const candidate = clampToBounds({ x: pos.x + dx, y: pos.y + dy }, map);
        if (!isBlocked(candidate.x, candidate.y)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

export interface IntentionContext {
  map: MapDims;
  playerPosition: { x: number; y: number };
  now: number;
  gameTime: GameTime;
  isBlocked: (x: number, y: number) => boolean;
}

export interface CognitiveActionPlan {
  destination?: { x: number; y: number };
  activity?: { description: string; emoji?: string; until: number };
  invitee?: string;
}

/**
 * Translate a cognitive intention into engine actions (the inverse of
 * buildSensoryInput). Pure and unit-testable.
 */
export function translateIntention(
  intention: Intention | null,
  ctx: IntentionContext,
): CognitiveActionPlan {
  if (!intention) {
    return {};
  }
  switch (intention.kind) {
    case 'goTo': {
      const destination = findOpenTile(
        clampToBounds({ x: intention.location.x, y: intention.location.y }, ctx.map),
        ctx.map,
        ctx.isBlocked,
      );
      return destination ? { destination } : {};
    }
    case 'do': {
      const realMs = ctx.gameTime.gameMinuteToRealMs(intention.durationGameMin);
      return {
        activity: {
          description: intention.description,
          emoji: intention.emoji,
          until: ctx.now + realMs,
        },
      };
    }
    case 'talkTo':
      return { invitee: intention.targetId };
    case 'wander': {
      for (let i = 0; i < 10; i++) {
        const candidate = {
          x: 1 + Math.floor(Math.random() * (ctx.map.width - 2)),
          y: 1 + Math.floor(Math.random() * (ctx.map.height - 2)),
        };
        if (!ctx.isBlocked(candidate.x, candidate.y)) {
          return { destination: candidate };
        }
      }
      return {};
    }
    case 'sleep':
    case 'idle':
      return {};
  }
}

/** The nearest configured area center to a tile position. */
export function nearestArea(
  areas: WorldArea[],
  position: { x: number; y: number },
): WorldArea {
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
