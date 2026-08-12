import { Fragment, MutableRefObject, useRef } from 'react';
import { Container, Graphics, Sprite, Text, useTick } from '@pixi/react';
import { BaseTexture, Graphics as PixiGraphics, Rectangle, SCALE_MODES, Sprite as PixiSprite, TextStyle, Texture } from 'pixi.js';
import { BUILDINGS, CITY_MAP, LIVING_ASSETS, PROPS } from '../../city/v3/runtime.ts';

const PROPS_DAY = '/policy-town/assets/city-v3/atlases/street-props-day-v3.png';
const PROPS_NIGHT = '/policy-town/assets/city-v3/atlases/street-props-night-v3.png';
const PROP_OPACITY = new Map(PROPS.map((prop) => [prop.id, prop.opacity]));

const atlasCache = new Map<string, Texture[]>();

function propTextures(url: string) {
  const cached = atlasCache.get(url);
  if (cached) return cached;
  const base = BaseTexture.from(url, { scaleMode: SCALE_MODES.NEAREST });
  const textures = Array.from({ length: 8 }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    return new Texture(base, new Rectangle(column * 200, row * 400, 200, 400));
  });
  atlasCache.set(url, textures);
  return textures;
}

const labelStyle = new TextStyle({
  fill: '#f7f1dc',
  fontFamily: 'VCR OSD Mono, monospace',
  fontSize: 13,
  fontWeight: '700',
  stroke: '#14202b',
  strokeThickness: 3,
  lineJoin: 'round',
});

export function BackgroundLayer({ night }: { night: boolean }) {
  const suffix = night ? 'night' : 'day';
  return (
    <Container>
      <Sprite image={`/policy-town/assets/city-v3/background/sky-${suffix}-v3.png`} x={0} y={0} width={1920} height={1080} />
      <Sprite
        image={`/policy-town/assets/city-v3/background/skyline-${suffix}-v3.png`}
        x={0}
        y={55}
        width={1920}
        height={295}
        alpha={night ? 0.88 : 0.72}
        roundPixels
      />
      <Sprite
        image={`/policy-town/assets/city-v3/background/midground-${suffix}-v3.png`}
        x={170}
        y={214}
        width={1580}
        height={360}
        alpha={night ? 0.82 : 0.68}
        roundPixels
      />
    </Container>
  );
}

function BuildingLabels() {
  return (
    <Fragment>
      {BUILDINGS.map((building) => (
        <Container key={building.id} x={building.entrance?.x ?? building.x} y={building.entrance?.y ?? building.baseline + 12} zIndex={building.baseline + 13}>
          <Graphics
            draw={(graphics: PixiGraphics) => {
              graphics.clear();
              graphics.beginFill(0x20303b, 0.92);
              graphics.drawRect(-62, 0, 124, 23);
              graphics.endFill();
              graphics.lineStyle(2, building.accent, 0.9);
              graphics.drawRect(-62, 0, 124, 23);
            }}
          />
          <Text
            text={`${building.id} · ${building.name}`}
            x={0}
            y={5}
            anchor={{ x: 0.5, y: 0 }}
            style={labelStyle}
            roundPixels
          />
        </Container>
      ))}
    </Fragment>
  );
}

export function GroundLayer({ night }: { night: boolean }) {
  return (
    <Sprite
      image={night ? CITY_MAP.ground.nightImage : CITY_MAP.ground.dayImage}
      x={0}
      y={0}
      width={1920}
      height={1080}
    />
  );
}

export function StaticWorldObjects({ transition }: { transition: MutableRefObject<number> }) {
  const daySprites = useRef<Record<string, PixiSprite | null>>({});
  const nightSprites = useRef<Record<string, PixiSprite | null>>({});
  const propDayTextures = propTextures(PROPS_DAY);
  const propNightTextures = propTextures(PROPS_NIGHT);

  useTick(() => {
    const nightAlpha = Math.max(0, Math.min(1, (transition.current - 0.25) / 0.5));
    Object.entries(daySprites.current).forEach(([id, sprite]) => {
      if (sprite) sprite.alpha = (PROP_OPACITY.get(id) ?? 1) * (1 - nightAlpha);
    });
    Object.entries(nightSprites.current).forEach(([id, sprite]) => {
      if (sprite) sprite.alpha = (PROP_OPACITY.get(id) ?? 1) * nightAlpha;
    });
  });

  return (
    <Fragment>
      {BUILDINGS.map((building) => (
        <Container key={building.id} x={building.x} y={building.baseline} zIndex={building.baseline}>
          <Sprite ref={(node) => { daySprites.current[building.id] = node; }} image={building.asset.dayImage} width={building.width} height={building.height} anchor={{ x: 0.5, y: 1 }} roundPixels />
          <Sprite ref={(node) => { nightSprites.current[building.id] = node; }} image={building.asset.nightImage} width={building.width} height={building.height} anchor={{ x: 0.5, y: 1 }} alpha={0} roundPixels />
        </Container>
      ))}
      {LIVING_ASSETS.map((asset) => (
        <Container key={asset.id} x={asset.x} y={asset.baseline} zIndex={asset.baseline}>
          <Sprite ref={(node) => { daySprites.current[asset.id] = node; }} image={asset.asset.dayImage} width={asset.width} height={asset.height} anchor={{ x: 0.5, y: 1 }} roundPixels />
          <Sprite ref={(node) => { nightSprites.current[asset.id] = node; }} image={asset.asset.nightImage} width={asset.width} height={asset.height} anchor={{ x: 0.5, y: 1 }} alpha={0} roundPixels />
        </Container>
      ))}
      {PROPS.map((prop) => (
        <Container key={prop.id} x={prop.x} y={prop.baseline} zIndex={prop.sortY}>
          <Sprite ref={(node) => { daySprites.current[prop.id] = node; }} {...(prop.asset ? { image: prop.asset.dayImage } : { texture: propDayTextures[prop.atlasIndex!] })} width={prop.width} height={prop.height} anchor={{ x: 0.5, y: 1 }} alpha={prop.opacity} roundPixels />
          <Sprite ref={(node) => { nightSprites.current[prop.id] = node; }} {...(prop.asset ? { image: prop.asset.nightImage } : { texture: propNightTextures[prop.atlasIndex!] })} width={prop.width} height={prop.height} anchor={{ x: 0.5, y: 1 }} alpha={0} roundPixels />
        </Container>
      ))}
      <BuildingLabels />
    </Fragment>
  );
}
