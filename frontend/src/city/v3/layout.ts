export const CITY_LOGICAL_WIDTH = 1920;
export const CITY_VISIBLE_HEIGHT = 1080;

export function computeSceneTransform(stageWidth: number, stageHeight: number) {
  const scale = Math.min(stageWidth / CITY_LOGICAL_WIDTH, stageHeight / CITY_VISIBLE_HEIGHT);
  return {
    scale,
    x: (stageWidth - CITY_LOGICAL_WIDTH * scale) / 2,
    y: (stageHeight - CITY_VISIBLE_HEIGHT * scale) / 2,
    contentWidth: CITY_LOGICAL_WIDTH * scale,
    contentHeight: CITY_VISIBLE_HEIGHT * scale,
  };
}
