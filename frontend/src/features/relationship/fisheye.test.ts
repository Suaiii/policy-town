import { applyFisheye, DEFAULT_FISHEYE, smoothstep } from './fisheye.ts';

describe('fisheye transform', () => {
  const cursor = { x: 100, y: 100 };

  test('smoothstep 边界与单调性', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.7)).toBeGreaterThan(smoothstep(0.3));
  });

  test('光标为 null 时原样返回', () => {
    expect(applyFisheye(50, 60, null)).toEqual({ x: 50, y: 60, scale: 1 });
  });

  test('半径外不受影响', () => {
    const r = applyFisheye(100 + DEFAULT_FISHEYE.radius + 10, 100, cursor);
    expect(r).toEqual({ x: 230, y: 100, scale: 1 });
  });

  test('圆心处放大到最大倍率', () => {
    const r = applyFisheye(100, 100, cursor);
    expect(r.scale).toBeCloseTo(DEFAULT_FISHEYE.maxScale);
  });

  test('半径内节点沿远离光标方向外扩，且放大随距离衰减', () => {
    const near = applyFisheye(120, 100, cursor);
    const far = applyFisheye(190, 100, cursor);
    expect(near.x).toBeGreaterThan(120);
    expect(far.x).toBeGreaterThan(190);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(far.scale).toBeGreaterThan(1);
  });
});
