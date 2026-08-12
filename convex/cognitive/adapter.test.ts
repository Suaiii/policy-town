import { buildSensoryInput, clampToBounds, findOpenTile, translateIntention } from './adapter';
import { buildSpatialTree, configForMap, nearestArea } from './spatialData';
import { GameTime } from './time';
import { Intention } from './intentions';

const map = { width: 64, height: 48, tileSetUrl: 'gentle.png' };
const gameTime = new GameTime(0, { gameMinutesPerRealSecond: 2 });

describe('spatialData', () => {
  test('configForMap picks the gentle config by tileset url', () => {
    const config = configForMap(map);
    expect(config.length).toBeGreaterThan(1);
    expect(config[0].sector).toBe('central');
  });

  test('buildSpatialTree builds sector/arena/object tree', () => {
    const spatial = buildSpatialTree(map);
    expect(spatial.getSectors()).toContain('central');
    expect(spatial.getObjects('central', 'central_plaza').map((o) => o.x)).toContain(34);
    const fountain = spatial.findObject('fountain');
    expect(fountain?.arena).toBe('central_plaza');
  });

  test('nearestArea finds the closest arena center', () => {
    const areas = [
      { sector: 'a', arena: 'a1', x: 0, y: 0 },
      { sector: 'b', arena: 'b1', x: 100, y: 0 },
    ];
    expect(nearestArea(areas, { x: 1, y: 0 }).arena).toBe('a1');
  });
});

describe('adapter', () => {
  test('clampToBounds clamps into walkable bounds', () => {
    expect(clampToBounds({ x: -5, y: 100 }, map)).toEqual({ x: 1, y: 46 });
  });

  test('findOpenTile returns the tile itself when open', () => {
    const isBlocked = (x: number, y: number) => x === 5 && y === 5;
    expect(findOpenTile({ x: 3, y: 3 }, map, isBlocked)).toEqual({ x: 3, y: 3 });
  });

  test('findOpenTile spirals to a nearby open tile', () => {
    const isBlocked = (x: number, y: number) =>
      (x >= 4 && x <= 6 && y >= 4 && y <= 6) || x === 5 || y === 5;
    const found = findOpenTile({ x: 5, y: 5 }, map, isBlocked);
    expect(found).not.toBeNull();
    expect(isBlocked(found!.x, found!.y)).toBe(false);
  });

  test('buildSensoryInput filters by vision radius and resolves names', () => {
    const sensory = buildSensoryInput({
      playerId: 'p1',
      playerPosition: { x: 10, y: 10 },
      players: [
        { id: 'p1', name: 'Me', position: { x: 10, y: 10 } },
        { id: 'p2', name: 'Maria', position: { x: 11, y: 10 }, activity: { description: 'reading a book' } },
        { id: 'p3', name: 'John', position: { x: 50, y: 50 } },
      ],
      conversations: [{ participants: ['p2'] }],
      areas: [{ sector: 's', arena: 'plaza', x: 10, y: 10 }],
      objectsInArena: [
        { name: 'bench', arena: 'plaza', x: 12, y: 10 },
        { name: 'stall', arena: 'other', x: 0, y: 0 },
      ],
      visionRadius: 6,
    });
    expect(sensory.currentLocation.arena).toBe('plaza');
    expect(sensory.visibleAgents.map((a) => a.name)).toEqual(['Maria']);
    expect(sensory.visibleAgents[0].currentAction).toBe('reading a book');
    expect(sensory.visibleAgents[0].inConversation).toBe(true);
    expect(sensory.visibleObjects.map((o) => o.name)).toEqual(['bench']);
  });

  test('translateIntention: do -> activity with real until', () => {
    const plan = translateIntention(
      { kind: 'do', description: 'read a book', emoji: '📖', durationGameMin: 30 },
      { map, playerPosition: { x: 1, y: 1 }, now: 10_000, gameTime, isBlocked: () => false },
    );
    // 30 game minutes at 2 game-min/real-sec = 15 real seconds.
    expect(plan.activity?.until).toBe(10_000 + 15_000);
    expect(plan.activity?.description).toBe('read a book');
  });

  test('translateIntention: goTo -> open destination or null', () => {
    const blockedAll = () => true;
    const plan = translateIntention(
      { kind: 'goTo', location: { sector: 's', arena: 'plaza', x: 10, y: 10 }, description: 'go to plaza' },
      { map, playerPosition: { x: 1, y: 1 }, now: 0, gameTime, isBlocked: blockedAll },
    );
    expect(plan.destination).toBeUndefined();

    const open = translateIntention(
      { kind: 'goTo', location: { sector: 's', arena: 'plaza', x: 10, y: 10 }, description: 'go to plaza' },
      { map, playerPosition: { x: 1, y: 1 }, now: 0, gameTime, isBlocked: () => false },
    );
    expect(open.destination).toEqual({ x: 10, y: 10 });
  });

  test('translateIntention: talkTo / wander / idle', () => {
    const ctx = { map, playerPosition: { x: 1, y: 1 }, now: 0, gameTime, isBlocked: () => false };
    const talk: Intention = { kind: 'talkTo', targetId: 'p9', targetName: 'Maria' };
    expect(translateIntention(talk, ctx)).toEqual({ invitee: 'p9' });
    const wander = translateIntention({ kind: 'wander' }, ctx);
    expect(wander.destination).toBeDefined();
    expect(translateIntention({ kind: 'sleep' }, ctx)).toEqual({});
    expect(translateIntention({ kind: 'idle', until: 5 }, ctx)).toEqual({});
    expect(translateIntention(null, ctx)).toEqual({});
  });
});
