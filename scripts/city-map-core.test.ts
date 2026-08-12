import { absolutePolyline, decodeGid, mergeTemplateObject, rasterizeRects, stableSerialize } from './city-map-core.mjs';
import manifest from '../frontend/src/city/generated/city-v3-manifest.json';

describe('Tiled city map compiler primitives', () => {
  test('decodes Tiled GID flip flags without changing the local tile id', () => {
    expect(decodeGid((0x80000000 | 0x40000000 | 7) >>> 0, 1)).toEqual({
      gid: 7,
      tileId: 6,
      flipHorizontal: true,
      flipVertical: true,
      flipDiagonal: false,
      rotateHex120: false,
    });
  });

  test('template instances override geometry and properties deterministically', () => {
    const result = mergeTemplateObject(
      { width: 40, height: 20, properties: { inherited: true, value: 1 } },
      { width: 0, height: 50, x: 12, properties: [] },
      { value: 2 },
    );
    expect(result).toMatchObject({ width: 40, height: 50, x: 12, properties: { inherited: true, value: 2 } });
  });

  test('converts relative Tiled polyline points into world coordinates', () => {
    expect(absolutePolyline({ x: 100, y: 200, polyline: [{ x: 0, y: 0 }, { x: 32, y: -16 }] }))
      .toEqual([{ x: 100, y: 200 }, { x: 132, y: 184 }]);
  });

  test('rasterizes only cells touched by ground footprints', () => {
    expect(rasterizeRects([{ x: 31, y: 31, width: 2, height: 2 }], 3, 3, 32)).toEqual([
      [4, 4, -1],
      [4, 4, -1],
      [-1, -1, -1],
    ]);
  });

  test('stable serialization ignores object insertion order', () => {
    expect(stableSerialize({ b: 1, a: { d: 2, c: 3 } })).toBe(stableSerialize({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe('compiled city manifest', () => {
  test('contains the complete V3 scene inventory', () => {
    expect(manifest.map).toMatchObject({ width: 60, height: 34, tileSize: 32, pixelWidth: 1920, pixelHeight: 1088, visibleHeight: 1080 });
    expect(manifest.buildings).toHaveLength(5);
    expect(manifest.vehicles).toHaveLength(10);
    expect(manifest.actorRoutes).toHaveLength(18);
    expect(manifest.collisionGrid).toHaveLength(34);
    expect(manifest.collisionGrid.every((row) => row.length === 60)).toBe(true);
  });

  test('all runtime references resolve to parking slots or routes', () => {
    const parking = new Set(manifest.parkingSlots.map(({ id }) => id));
    const routes = new Set(manifest.vehicleRoutes.map(({ id }) => id));
    expect(manifest.vehicles.every((vehicle) => (
      vehicle.parkingSlotId ? parking.has(vehicle.parkingSlotId) : Boolean(vehicle.routeId && routes.has(vehicle.routeId))
    ))).toBe(true);
  });
});
