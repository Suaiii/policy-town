import { CITY_MAP } from './runtime.ts';
import { closedRoutePoint, openRoutePoint } from './motion.ts';

const inside = (point: { x: number; y: number }, zone: { x: number; y: number; width: number; height: number }) => (
  point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height
);

describe('five-minute deterministic motion simulation', () => {
  test('all moving vehicles stay in the vehicle zone for 300 seconds', () => {
    const vehicleZones = CITY_MAP.zones.filter(({ kind }) => kind === 'vehicle');
    const routes = new Map(CITY_MAP.vehicleRoutes.map((route) => [route.id, route]));
    for (const vehicle of CITY_MAP.vehicles.filter(({ routeId }) => routeId)) {
      const route = routes.get(vehicle.routeId!)!;
      for (let frame = 0; frame <= 300 * 60; frame += 1) {
        const point = openRoutePoint(route.points, frame / 60 * vehicle.speed + vehicle.phase * 2200);
        if (point.x >= 0 && point.x < CITY_MAP.map.pixelWidth) expect(vehicleZones.some((zone) => inside(point, zone))).toBe(true);
      }
    }
  });

  test('all actors stay out of objmap for 300 seconds', () => {
    const { tileSize } = CITY_MAP.map;
    for (const actor of CITY_MAP.actorRoutes) {
      for (let frame = 0; frame <= 300 * 60; frame += 1) {
        const point = closedRoutePoint(actor.route, frame / 60 * actor.speed + actor.phase * 900);
        const row = Math.floor(point.y / tileSize);
        const column = Math.floor(point.x / tileSize);
        expect(CITY_MAP.collisionGrid[row]?.[column]).toBe(-1);
      }
    }
  });
});
