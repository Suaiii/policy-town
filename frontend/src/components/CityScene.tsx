import { useMemo, useRef, useState } from 'react';
import { Container, Graphics, Stage, useTick } from '@pixi/react';
import { Container as PixiContainer, Graphics as PixiGraphics } from 'pixi.js';
import { useElementSize } from 'usehooks-ts';
import { SceneMode } from '../city/v3/types.ts';
import { CITY_LOGICAL_WIDTH, CITY_VISIBLE_HEIGHT, computeSceneTransform } from '../city/v3/layout.ts';
import { BackgroundLayer, GroundLayer, StaticWorldObjects } from './city/StaticLayers.tsx';
import { MotionLayers } from './city/MotionLayers.tsx';
import { LightingLayer } from './city/LightingLayer.tsx';
import { MapDebugLayer } from './city/MapDebugLayer.tsx';

const TRANSITION_SECONDS = 1.6;

const smoothstep = (start: number, end: number, value: number) => {
  const ratio = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return ratio * ratio * (3 - 2 * ratio);
};

const drawAtmosphere = (graphics: PixiGraphics) => {
  graphics.clear();
  graphics.beginFill(0x27345e, 0.12);
  graphics.drawRect(0, 0, CITY_LOGICAL_WIDTH, CITY_VISIBLE_HEIGHT);
  graphics.endFill();
};

function SceneRuntime({ mode, debug }: { mode: SceneMode; debug: boolean }) {
  const progress = useRef(mode === 'night' ? 1 : 0);
  const dayBackground = useRef<PixiContainer | null>(null);
  const nightBackground = useRef<PixiContainer | null>(null);
  const dayGround = useRef<PixiContainer | null>(null);
  const nightGround = useRef<PixiContainer | null>(null);
  const atmosphere = useRef<PixiContainer | null>(null);
  const lights = useRef<PixiContainer | null>(null);

  useTick((delta) => {
    const direction = mode === 'night' ? 1 : -1;
    const step = Math.min(0.03, delta / 60 / TRANSITION_SECONDS);
    progress.current = Math.max(0, Math.min(1, progress.current + direction * step));

    const skyNight = smoothstep(0, 0.35, progress.current);
    const objectNight = smoothstep(0.25, 0.75, progress.current);
    const lightLevel = smoothstep(0.45, 1, progress.current);

    if (dayBackground.current) dayBackground.current.alpha = 1 - skyNight;
    if (nightBackground.current) nightBackground.current.alpha = skyNight;
    if (dayGround.current) dayGround.current.alpha = 1 - objectNight;
    if (nightGround.current) nightGround.current.alpha = objectNight;
    if (atmosphere.current) atmosphere.current.alpha = progress.current;
    if (lights.current) lights.current.alpha = lightLevel;
  });

  return (
    <Container>
      <Container ref={dayBackground} alpha={mode === 'day' ? 1 : 0}>
        <BackgroundLayer night={false} />
      </Container>
      <Container ref={nightBackground} alpha={mode === 'night' ? 1 : 0}>
        <BackgroundLayer night />
      </Container>
      <Container ref={dayGround} alpha={mode === 'day' ? 1 : 0}>
        <GroundLayer night={false} />
      </Container>
      <Container ref={nightGround} alpha={mode === 'night' ? 1 : 0}>
        <GroundLayer night />
      </Container>
      <Container sortableChildren>
        <StaticWorldObjects transition={progress} />
        <MotionLayers transition={progress} />
      </Container>
      <Container ref={atmosphere} alpha={mode === 'night' ? 1 : 0}>
        <Graphics draw={drawAtmosphere} />
      </Container>
      <Container ref={lights} alpha={mode === 'night' ? 1 : 0}>
        <LightingLayer />
      </Container>
      {debug && <MapDebugLayer />}
    </Container>
  );
}

export default function CityScene() {
  const [wrapperRef, { width, height }] = useElementSize();
  const [mode, setMode] = useState<SceneMode>('day');
  const debug = useMemo(() => new URLSearchParams(window.location.search).get('debugMap') === '1', []);
  const stageWidth = Math.max(1, width);
  const stageHeight = Math.max(1, height);
  const transform = useMemo(() => {
    return computeSceneTransform(stageWidth, stageHeight);
  }, [stageHeight, stageWidth]);

  return (
    <div ref={wrapperRef} className="city-scene">
      <Stage
        width={stageWidth}
        height={stageHeight}
        options={{ backgroundColor: 0x0b1434, antialias: false, autoDensity: true }}
      >
        <Container x={transform.x} y={transform.y} scale={transform.scale}>
          <SceneRuntime mode={mode} debug={debug} />
        </Container>
      </Stage>
      <a
        className="day-night-toggle relationship-entry"
        href="#/relationship"
        aria-label="打开人物关系网络"
      >
        <span aria-hidden="true" className="day-night-icon">♦</span>
        <span>关系网</span>
      </a>
      <button
        type="button"
        className="day-night-toggle"
        aria-label={mode === 'day' ? '切换到夜间' : '切换到白天'}
        aria-pressed={mode === 'night'}
        onClick={() => setMode((current) => (current === 'day' ? 'night' : 'day'))}
      >
        <span aria-hidden="true" className="day-night-icon">{mode === 'day' ? '☀' : '☾'}</span>
        <span>{mode === 'day' ? '日间' : '夜间'}</span>
      </button>
    </div>
  );
}
