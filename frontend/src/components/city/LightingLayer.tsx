import { Graphics } from '@pixi/react';
import { Graphics as PixiGraphics } from 'pixi.js';
import { BUILDINGS, STREET_LIGHT_POSITIONS } from '../../city/v3/runtime.ts';

const drawLights = (graphics: PixiGraphics) => {
  graphics.clear();
  BUILDINGS.forEach((building) => {
    const left = building.x - building.width / 2;
    const top = building.baseline - building.height;
    building.windows.forEach((window) => {
      if (!window.active) return;
      graphics.beginFill(window.color, 0.95);
      graphics.drawRect(
        left + window.xRatio * building.width,
        top + window.yRatio * building.height,
        window.widthRatio * building.width,
        window.heightRatio * building.height,
      );
      graphics.endFill();
    });
  });

  // Living-area windows and storefront lightboxes.
  const livingWindows = [
    [68, 906, 14, 11], [106, 906, 14, 11], [180, 906, 14, 11], [218, 906, 14, 11],
    [345, 920, 13, 11], [385, 920, 13, 11], [425, 920, 13, 11],
    [585, 864, 13, 11], [623, 864, 13, 11], [661, 864, 13, 11], [585, 900, 13, 11], [661, 900, 13, 11],
    [1214, 890, 13, 11], [1258, 890, 13, 11], [1302, 890, 13, 11], [1346, 890, 13, 11],
  ];
  livingWindows.forEach(([x, y, width, height], index) => {
    if (index % 4 === 1) return;
    graphics.beginFill(0xffc66a, 0.82);
    graphics.drawRect(x, y, width, height);
    graphics.endFill();
  });
  graphics.beginFill(0xffd27b, 0.78);
  graphics.drawRect(62, 950, 158, 12);
  graphics.drawRect(1596, 943, 118, 10);
  graphics.endFill();

  STREET_LIGHT_POSITIONS.forEach(([x, y]) => {
    // Soft layered ground pool, narrow rather than a solid circular disc.
    graphics.beginFill(0xffcf72, 0.035);
    graphics.drawEllipse(x, y + 7, 58, 17);
    graphics.endFill();
    graphics.beginFill(0xffd980, 0.075);
    graphics.drawEllipse(x, y + 5, 35, 11);
    graphics.endFill();
    graphics.beginFill(0xffe5a4, 0.2);
    graphics.moveTo(x - 4, y - 86);
    graphics.lineTo(x - 25, y + 3);
    graphics.lineTo(x + 25, y + 3);
    graphics.lineTo(x + 4, y - 86);
    graphics.closePath();
    graphics.endFill();
    graphics.beginFill(0xfff0b8, 1);
    graphics.drawRect(x - 5, y - 91, 10, 5);
    graphics.endFill();
  });
};

export function LightingLayer() {
  return <Graphics draw={drawLights} />;
}
