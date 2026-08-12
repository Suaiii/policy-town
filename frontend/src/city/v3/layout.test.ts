import { CITY_LOGICAL_WIDTH, CITY_VISIBLE_HEIGHT, computeSceneTransform } from './layout.ts';

describe.each([
  [1920, 1080],
  [1600, 900],
  [1366, 768],
  [1440, 900],
])('city scene fitting at %d×%d', (width, height) => {
  test('keeps the full logical scene visible without deformation', () => {
    const result = computeSceneTransform(width, height);
    expect(result.contentWidth).toBeLessThanOrEqual(width);
    expect(result.contentHeight).toBeLessThanOrEqual(height);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.contentWidth / result.contentHeight).toBeCloseTo(CITY_LOGICAL_WIDTH / CITY_VISIBLE_HEIGHT, 8);
  });
});
