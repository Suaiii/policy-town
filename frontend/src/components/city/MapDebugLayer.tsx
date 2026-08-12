import { Graphics } from '@pixi/react';
import { Graphics as PixiGraphics } from 'pixi.js';
import { CITY_MAP } from '../../city/v3/runtime.ts';

const drawDebug = (graphics: PixiGraphics) => {
  graphics.clear();
  const { tileSize, width, height } = CITY_MAP.map;
  graphics.lineStyle(1, 0x83d8ff, 0.16);
  for (let x = 0; x <= width; x++) graphics.moveTo(x * tileSize, 0).lineTo(x * tileSize, height * tileSize);
  for (let y = 0; y <= height; y++) graphics.moveTo(0, y * tileSize).lineTo(width * tileSize, y * tileSize);

  graphics.beginFill(0xff3344, 0.32);
  CITY_MAP.collisionGrid.forEach((row, y) => row.forEach((tile, x) => {
    if (tile !== -1) graphics.drawRect(x * tileSize, y * tileSize, tileSize, tileSize);
  }));
  graphics.endFill();

  graphics.lineStyle(2, 0xffa23a, 0.9);
  CITY_MAP.vehicleExclusions.forEach((rect) => graphics.drawRect(rect.x, rect.y, rect.width, rect.height));
  graphics.lineStyle(2, 0x65e5ff, 0.95);
  CITY_MAP.parkingSlots.forEach((slot) => graphics.drawRect(slot.x - slot.width / 2, slot.y - slot.height / 2, slot.width, slot.height));

  graphics.lineStyle(3, 0xffe06f, 0.85);
  CITY_MAP.vehicleRoutes.forEach((route) => route.points.forEach((point, index) => {
    if (!index) graphics.moveTo(point.x, point.y); else graphics.lineTo(point.x, point.y);
  }));
  graphics.lineStyle(2, 0x77ff9d, 0.75);
  CITY_MAP.actorRoutes.forEach((route) => [...route.route, route.route[0]].forEach((point, index) => {
    if (!index) graphics.moveTo(point.x, point.y); else graphics.lineTo(point.x, point.y);
  }));

  graphics.beginFill(0x58ff90, 1);
  CITY_MAP.portals.forEach((portal) => graphics.drawCircle(portal.x, portal.y, 5));
  graphics.endFill();
};

export function MapDebugLayer() {
  return <Graphics draw={drawDebug} />;
}
