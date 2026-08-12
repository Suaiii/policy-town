import { Fragment, MutableRefObject, useRef } from 'react';
import { Container, Graphics, Sprite, useTick } from '@pixi/react';
import {
  BaseTexture,
  Container as PixiContainer,
  Graphics as PixiGraphics,
  Rectangle,
  SCALE_MODES,
  Sprite as PixiSprite,
  Texture,
} from 'pixi.js';
import { characters } from '../../../../data/characters.ts';
import { ACTORS, PARKING_SLOTS, VEHICLES, VEHICLE_ROUTES } from '../../city/v3/runtime.ts';
import { CityActorSpec, VehicleSpec } from '../../city/v3/types.ts';
import { closedRoutePoint, openRoutePoint } from '../../city/v3/motion.ts';
import { Character } from '../Character.tsx';

const vehicleBases = {
  day: BaseTexture.from('/policy-town/assets/city-v3/atlases/vehicles-day-v3.png', { scaleMode: SCALE_MODES.NEAREST }),
  night: BaseTexture.from('/policy-town/assets/city-v3/atlases/vehicles-night-v3.png', { scaleMode: SCALE_MODES.NEAREST }),
};

function vehicleTexture(spec: VehicleSpec, night: boolean) {
  const columns = 3;
  const x = Math.floor((800 / columns) * spec.frame.column);
  const y = spec.frame.row * 400;
  const width = spec.frame.column === columns - 1 ? 800 - x : Math.floor(800 / columns);
  return new Texture(night ? vehicleBases.night : vehicleBases.day, new Rectangle(x, y, width, 400));
}

const drawHeadlights = (graphics: PixiGraphics) => {
  graphics.clear();
  graphics.beginFill(0xffe9ac, 0.18);
  graphics.moveTo(30, -11);
  graphics.lineTo(88, -24);
  graphics.lineTo(88, 14);
  graphics.lineTo(30, 7);
  graphics.closePath();
  graphics.endFill();
  graphics.beginFill(0xfff2c2, 0.9);
  graphics.drawRect(26, -10, 5, 5);
  graphics.drawRect(26, 4, 5, 5);
  graphics.endFill();
  graphics.beginFill(0xff5b58, 0.9);
  graphics.drawRect(-31, -8, 4, 4);
  graphics.drawRect(-31, 5, 4, 4);
  graphics.endFill();
};

export function MotionLayers({ transition }: { transition: MutableRefObject<number> }) {
  const elapsed = useRef(0);
  const vehicleContainers = useRef<Record<string, PixiContainer | null>>({});
  const vehicleDaySprites = useRef<Record<string, PixiSprite | null>>({});
  const vehicleNightSprites = useRef<Record<string, PixiSprite | null>>({});
  const vehicleLights = useRef<Record<string, PixiGraphics | null>>({});
  const actorContainers = useRef<Record<string, PixiContainer | null>>({});

  useTick((delta) => {
    elapsed.current += delta / 60;
    const nightAlpha = Math.max(0, Math.min(1, (transition.current - 0.25) / 0.5));
    const lightAlpha = Math.max(0, Math.min(1, (transition.current - 0.45) / 0.55));

    VEHICLES.forEach((vehicle) => {
      const container = vehicleContainers.current[vehicle.id];
      if (!container) return;
      const slot = vehicle.parkingSlotId ? PARKING_SLOTS.get(vehicle.parkingSlotId) : undefined;
      const route = vehicle.routeId ? VEHICLE_ROUTES.get(vehicle.routeId) : undefined;
      const point = slot ?? openRoutePoint(route!.points, elapsed.current * vehicle.speed + vehicle.phase * 2200);
      container.position.set(point.x, point.y);
      container.zIndex = point.y;
      container.scale.x = vehicle.flip ? -1 : 1;
      if (vehicleDaySprites.current[vehicle.id]) vehicleDaySprites.current[vehicle.id]!.alpha = 1 - nightAlpha;
      if (vehicleNightSprites.current[vehicle.id]) vehicleNightSprites.current[vehicle.id]!.alpha = nightAlpha;
      if (vehicleLights.current[vehicle.id]) vehicleLights.current[vehicle.id]!.alpha = lightAlpha;
    });

    ACTORS.forEach((actor) => {
      const container = actorContainers.current[actor.id];
      if (!container) return;
      const point = closedRoutePoint(actor.route, elapsed.current * actor.speed + actor.phase * 900);
      container.position.set(point.x, point.y);
      container.zIndex = point.y;
    });
  });

  return (
    <Fragment>
      {VEHICLES.map((vehicle) => (
        <Container
          key={vehicle.id}
          ref={(node) => { vehicleContainers.current[vehicle.id] = node; }}
          x={vehicle.parkingSlotId ? PARKING_SLOTS.get(vehicle.parkingSlotId)?.x ?? 0 : 0}
          y={vehicle.parkingSlotId ? PARKING_SLOTS.get(vehicle.parkingSlotId)?.y ?? 0 : 0}
          zIndex={vehicle.parkingSlotId ? PARKING_SLOTS.get(vehicle.parkingSlotId)?.y ?? 0 : 0}
        >
          <Sprite
            ref={(node) => { vehicleDaySprites.current[vehicle.id] = node; }}
            texture={vehicleTexture(vehicle, false)}
            width={vehicle.width}
            height={vehicle.height}
            anchor={{ x: 0.5, y: 0.5 }}
            roundPixels
          />
          <Sprite
            ref={(node) => { vehicleNightSprites.current[vehicle.id] = node; }}
            texture={vehicleTexture(vehicle, true)}
            width={vehicle.width}
            height={vehicle.height}
            anchor={{ x: 0.5, y: 0.5 }}
            alpha={0}
            roundPixels
          />
          <Graphics ref={(node) => { vehicleLights.current[vehicle.id] = node; }} draw={drawHeadlights} alpha={0} />
        </Container>
      ))}
      {ACTORS.map((actor: CityActorSpec) => {
        const character = characters.find((candidate) => candidate.name === actor.skin)!;
        const initial = closedRoutePoint(actor.route, actor.phase * 900);
        return (
          <Container
            key={actor.id}
            ref={(node) => { actorContainers.current[actor.id] = node; }}
            x={initial.x}
            y={initial.y}
            scale={1.2}
            zIndex={initial.y}
          >
            <Character
              x={0}
              y={0}
              orientation={initial.orientation}
              isMoving
              textureUrl={character.textureUrl}
              spritesheetData={character.spritesheetData}
              speed={character.speed}
            />
          </Container>
        );
      })}
    </Fragment>
  );
}
