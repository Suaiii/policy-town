import rawManifest from '../generated/city-v3-manifest.json';
import type { BuildingVisualSpec, CityMapManifest, WindowLightSpec } from './types.ts';

export const CITY_MAP = rawManifest as CityMapManifest;

const score = (value: number) => {
  const result = Math.sin(value * 8179.21 + 71.3) * 41827.31;
  return result - Math.floor(result);
};

function lightGrid(xRatio: number, yRatio: number, columns: number, rows: number, gapXRatio: number, gapYRatio: number, widthRatio: number, heightRatio: number, ratio: number, seed: number, color = 0xffc45f): WindowLightSpec[] {
  const candidates = Array.from({ length: columns * rows }, (_, index) => ({ index, score: score(seed + index) }));
  const active = new Set([...candidates].sort((a, b) => a.score - b.score).slice(0, Math.round(candidates.length * ratio)).map(({ index }) => index));
  return candidates.map(({ index }) => ({ xRatio: xRatio + (index % columns) * gapXRatio, yRatio: yRatio + Math.floor(index / columns) * gapYRatio, widthRatio, heightRatio, active: active.has(index), color }));
}

const lights: Record<string, WindowLightSpec[]> = {
  A: [...lightGrid(.26,.27,6,8,.086,.071,.024,.02,.55,110), ...lightGrid(.31,.16,5,2,.094,.063,.024,.018,.1,111)],
  B: lightGrid(.26,.24,7,7,.079,.09,.026,.026,.9,210),
  GOV: [...lightGrid(.12,.31,5,5,.069,.077,.018,.023,.6,310), ...lightGrid(.64,.31,5,5,.069,.077,.018,.023,.6,311), ...lightGrid(.42,.24,3,6,.063,.074,.02,.025,.9,312,0xffd77a)],
  C: [...lightGrid(.28,.27,3,9,.071,.067,.025,.017,.35,410), ...lightGrid(.58,.24,3,10,.071,.065,.025,.017,.8,411,0x89efff)],
  D: lightGrid(.15,.23,10,4,.073,.141,.025,.034,.75,510),
};

export const BUILDINGS: BuildingVisualSpec[] = CITY_MAP.buildings.map((building) => ({ ...building, windows: lights[building.id] ?? [] })).sort((a,b)=>a.zIndex-b.zIndex);
export const LIVING_ASSETS = CITY_MAP.living;
export const PROPS = CITY_MAP.props;
export const VEHICLES = CITY_MAP.vehicles;
export const ACTORS = CITY_MAP.actorRoutes;
export const PARKING_SLOTS = new Map(CITY_MAP.parkingSlots.map((slot) => [slot.id, slot]));
export const VEHICLE_ROUTES = new Map(CITY_MAP.vehicleRoutes.map((route) => [route.id, route]));
export const STREET_LIGHT_POSITIONS = PROPS.filter((prop)=>prop.templateId==='street_light').map((prop)=>[prop.x,prop.baseline] as const);
