export type SceneMode = 'day' | 'night';
export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number; ownerId?: string };
export type SceneAssetPair = { dayImage: string; nightImage: string; emissiveImage?: string };

export type WindowLightSpec = {
  xRatio: number; yRatio: number; widthRatio: number; heightRatio: number;
  active: boolean; color: number;
};

export type PlacedSceneObject = {
  id: string; templateId: string; x: number; baseline: number; width: number; height: number;
  anchorX: number; anchorY: number; zIndex: number; asset: SceneAssetPair;
};

export type BuildingVisualSpec = PlacedSceneObject & {
  name: string; accent: string; zone: string; entrance?: PortalSpec;
  collision?: Rect; vehicleExclusion?: Rect; windows: WindowLightSpec[];
};

export type EnvironmentAssetSpec = PlacedSceneObject;
export type PropSpec = { id: string; templateId: string; atlasIndex?: number; asset?: SceneAssetPair; x: number; baseline: number; width: number; height: number; sortY: number; opacity: number; zIndex: number };
export type ParkingSlotSpec = { id: string; x: number; y: number; width: number; height: number; direction: 'east' | 'west'; vehicleClass: 'car' | 'bus' };
export type RouteSpec = { id: string; kind: 'vehicle'; usage: string; points: Point[]; speedClass?: string; stationId?: string };
export type PortalSpec = { id: string; ownerId: string; x: number; y: number; department?: string };
export type ZoneSpec = Rect & { id: string; kind: string };
export type AtlasFrameSpec = { column: number; row: number };
export type VehicleSpec = { id: string; frame: AtlasFrameSpec; parkingSlotId?: string; routeId?: string; speed: number; phase: number; width: number; height: number; flip?: boolean; isBus?: boolean };
export type CityActorSpec = { id: string; skin: `f${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`; route: Point[]; speed: number; phase: number };

export type CityMapManifest = {
  version: number;
  map: { width: number; height: number; tileSize: number; pixelWidth: number; pixelHeight: number; visibleHeight: number };
  ground: SceneAssetPair;
  buildings: Omit<BuildingVisualSpec, 'windows'>[];
  living: EnvironmentAssetSpec[];
  props: PropSpec[];
  parkingSlots: ParkingSlotSpec[];
  vehicles: VehicleSpec[];
  vehicleRoutes: RouteSpec[];
  actorRoutes: CityActorSpec[];
  portals: PortalSpec[];
  zones: ZoneSpec[];
  collisionRects: Rect[];
  vehicleExclusions: Rect[];
  collisionGrid: number[][];
  sourceHash: string;
};
