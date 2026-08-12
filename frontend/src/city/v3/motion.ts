import type { Point } from './types.ts';

export function closedRoutePoint(route: Point[], distance: number) {
  const segments = route.map((point, index) => {
    const next = route[(index + 1) % route.length];
    return { point, next, length: Math.hypot(next.x - point.x, next.y - point.y) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = distance % total;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length ? remaining / segment.length : 0;
      const dx = segment.next.x - segment.point.x;
      const dy = segment.next.y - segment.point.y;
      return {
        x: segment.point.x + dx * ratio,
        y: segment.point.y + dy * ratio,
        orientation: Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 0 : 180) : dy >= 0 ? 90 : 270,
      };
    }
    remaining -= segment.length;
  }
  return { ...route[0], orientation: 0 };
}

export function openRoutePoint(route: Point[], distance: number) {
  const segments = route.slice(0, -1).map((point, index) => {
    const next = route[index + 1];
    return { point, next, length: Math.hypot(next.x - point.x, next.y - point.y) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = distance % total;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length ? remaining / segment.length : 0;
      return {
        x: segment.point.x + (segment.next.x - segment.point.x) * ratio,
        y: segment.point.y + (segment.next.y - segment.point.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  return route[0];
}
