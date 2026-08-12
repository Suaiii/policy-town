#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { absolutePolyline, decodeGid, mergeTemplateObject, rasterizeRects, stableSerialize } from './city-map-core.mjs';
import { inspectRgbaPng } from './png-inspect.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_FILE = path.join(ROOT, 'maps/city-v3/city-v3.tmj');
const OUT_JSON = path.join(ROOT, 'frontend/src/city/generated/city-v3-manifest.json');
const OUT_AI = path.join(ROOT, 'data/city-v3-map.js');
const CHECK = process.argv.includes('--check');
const TILE = 32;
const requiredLayers = { bgtiles:'tilelayer', objmap:'tilelayer', buildings:'objectgroup', living:'objectgroup', props:'objectgroup', parking:'objectgroup', vehicle_routes:'objectgroup', actor_routes:'objectgroup', portals:'objectgroup', zones:'objectgroup' };
const fail = (message) => { throw new Error(`city-map: ${message}`); };
const properties = (object) => Object.fromEntries((object.properties ?? []).map((item) => [item.name, item.value]));
const parseMaybe = (value) => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return value; } };
const templateId = (value) => path.basename(value, path.extname(value));
const loadTemplate = (relative) => {
  const source = JSON.parse(fs.readFileSync(path.resolve(path.dirname(MAP_FILE), relative), 'utf8')).object;
  return { ...source, properties: Object.fromEntries(Object.entries(properties(source)).map(([key,value])=>[key,parseMaybe(value)])) };
};
const mergeObject = (object) => {
  const template = object.template ? loadTemplate(object.template) : { properties:{} };
  return mergeTemplateObject(template, object, properties(object));
};
const rectIntersects = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
const pointInRect = (point,rect) => point.x >= rect.x && point.x <= rect.x+rect.width && point.y >= rect.y && point.y <= rect.y+rect.height;
const pointsOf = absolutePolyline;
const sampleRoute = (points, step=8) => points.slice(0,-1).flatMap((point,index)=>{ const next=points[index+1]; const length=Math.hypot(next.x-point.x,next.y-point.y); const count=Math.max(1,Math.ceil(length/step)); return Array.from({length:count+1},(_,i)=>({x:point.x+(next.x-point.x)*i/count,y:point.y+(next.y-point.y)*i/count})); });
const serialize = stableSerialize;

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
if (map.width !== 60 || map.height !== 34 || map.tilewidth !== TILE || map.tileheight !== TILE) fail('map must be 60x34 with 32px tiles');
const layers = Object.fromEntries(map.layers.map((layer)=>[layer.name,layer]));
for (const [name,type] of Object.entries(requiredLayers)) if (!layers[name] || layers[name].type !== type) fail(`required ${type} layer ${name} is missing`);
const allObjects = Object.values(layers).filter((layer)=>layer.type==='objectgroup').flatMap((layer)=>layer.objects.map(mergeObject));
const ids = allObjects.map((object)=>object.name);
if (new Set(ids).size !== ids.length) fail('object names must be globally unique');

const collisionRects = [];
const vehicleExclusions = [];
const toWorldRect = (object, value) => ({ x:object.x+value[0], y:object.y+value[1], width:value[2], height:value[3], ownerId:object.name });
for (const object of [...layers.buildings.objects,...layers.living.objects,...layers.props.objects].map(mergeObject)) {
  const collision = object.properties.collision;
  if (Array.isArray(collision) && collision.length === 4) collisionRects.push(toWorldRect(object,collision));
  const exclusion = object.properties.vehicleExclusion;
  if (Array.isArray(exclusion) && exclusion.length === 4) vehicleExclusions.push(toWorldRect(object,exclusion));
}
const collisionGrid = rasterizeRects(collisionRects, map.width, map.height, TILE);

const zones = layers.zones.objects.map((raw)=>{const object=mergeObject(raw); return {id:object.name,kind:object.properties.kind,x:object.x,y:object.y,width:object.width,height:object.height};});
const findZone = (kind,point) => zones.some((zone)=>zone.kind===kind && pointInRect(point,zone));
const parkingSlots = layers.parking.objects.map((raw)=>{ const object=mergeObject(raw); return {id:object.name,x:object.x,y:object.y,width:object.properties.width??90,height:object.properties.height??44,direction:object.rotation===180?'west':object.properties.direction,vehicleClass:object.properties.vehicleClass}; });
for (let i=0;i<parkingSlots.length;i++) {
  const slot={...parkingSlots[i],x:parkingSlots[i].x-parkingSlots[i].width/2,y:parkingSlots[i].y-parkingSlots[i].height/2};
  const collisionOwner=collisionRects.find((rect)=>rectIntersects(slot,rect));
  const exclusionOwner=vehicleExclusions.find((rect)=>rectIntersects(slot,rect));
  if (collisionOwner || exclusionOwner) fail(`parking slot ${parkingSlots[i].id} overlaps ${collisionOwner?.ownerId ?? exclusionOwner?.ownerId}`);
  if (parkingSlots.slice(i+1).some((other)=>rectIntersects(slot,{...other,x:other.x-other.width/2,y:other.y-other.height/2}))) fail(`parking slot ${parkingSlots[i].id} overlaps another slot`);
}

const portals = layers.portals.objects.map((raw)=>{const object=mergeObject(raw);return {id:object.name,ownerId:object.properties.ownerId??'government',x:object.x,y:object.y,department:object.properties.department};});
for (const portal of portals.filter((item)=>item.id.endsWith('-entrance'))) {
  if (portal.x<0||portal.y<0||portal.x>=map.width*TILE||portal.y>=map.height*TILE) fail(`portal ${portal.id} is out of bounds`);
  const col=Math.floor(portal.x/TILE),row=Math.floor(portal.y/TILE); let open=false;
  for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) if (Math.abs(dx)+Math.abs(dy)>0 && collisionGrid[row+dy]?.[col+dx]===-1) open=true;
  if (!open) fail(`portal ${portal.id} has no adjacent walkable tile`);
}

const routes = (layerName,kind) => layers[layerName].objects.map((raw)=>{const object=mergeObject(raw);return {id:object.name,kind,usage:object.properties.usage,points:pointsOf(object),speedClass:object.properties.speedClass,stationId:object.properties.stationId,skin:object.properties.skin,speed:object.properties.speed,phase:object.properties.phase};});
const vehicleRoutes = routes('vehicle_routes','vehicle');
for (const route of vehicleRoutes) {
  const samples=sampleRoute(route.points).filter((point)=>point.x>=0&&point.x<map.width*TILE);
  if (samples.some((point)=>!findZone('vehicle',point))) fail(`vehicle route ${route.id} leaves the vehicle zone`);
  if (samples.some((point)=>collisionRects.some((rect)=>pointInRect(point,rect)))) fail(`vehicle route ${route.id} crosses collision geometry`);
  if (route.usage==='bus') { const station=portals.find((portal)=>portal.id===route.stationId); if (!station) fail(`bus route ${route.id} references a missing station`); if (!samples.some((point)=>Math.hypot(point.x-station.x,point.y-station.y)<96)) fail(`bus route ${route.id} does not reach ${route.stationId}`); }
}
const actorRoutesRaw = routes('actor_routes','actor');
const actorRouteErrors = [];
for (const route of actorRoutesRaw) {
  const samples=sampleRoute([...route.points,route.points[0]]);
  const hit=samples.find((point)=>{
    const col=Math.floor(point.x/TILE),row=Math.floor(point.y/TILE);
    return collisionGrid[row]?.[col] !== -1;
  });
  if (hit) actorRouteErrors.push(`${route.id} crosses objmap near ${Math.round(hit.x)},${Math.round(hit.y)}`);
  const offWalk = samples.find((point)=>!findZone('walk',point)&&!findZone('public',point));
  if (offWalk) actorRouteErrors.push(`${route.id} leaves walk/public zones near ${Math.round(offWalk.x)},${Math.round(offWalk.y)}`);
}
if (actorRouteErrors.length) fail(`actor routes are invalid:\n- ${actorRouteErrors.join('\n- ')}`);

const firstGid = map.tilesets[0]?.firstgid ?? 1;
const bgGrid = Array.from({ length: map.height }, (_, row) => Array.from({ length: map.width }, (_, col) => {
  const tile = decodeGid(layers.bgtiles.data[row * map.width + col] ?? 0, firstGid);
  if (tile.tileId < 0 || tile.tileId > 3) fail(`bgtiles has invalid tile at ${col},${row}`);
  return tile.tileId;
}));
const tiledObjectData=collisionGrid.flat().map((tile)=>tile===-1?0:tile+1);
const sameData=(left,right)=>Array.isArray(left)&&left.length===right.length&&left.every((value,index)=>value===right[index]);
if (CHECK) {
  if (!sameData(layers.objmap.data,tiledObjectData)) fail('objmap is stale; run npm run city:compile');
} else {
  layers.objmap.data=tiledObjectData;
  fs.writeFileSync(MAP_FILE, `${JSON.stringify(map, null, 2)}\n`);
}

const buildings = layers.buildings.objects.map((raw)=>{const object=mergeObject(raw);return {id:object.properties.assetId,name:object.properties.label,templateId:templateId(raw.template),asset:{dayImage:object.properties.dayImage,nightImage:object.properties.nightImage},x:object.x,baseline:object.y,width:object.properties.width,height:object.properties.height,anchorX:object.properties.anchorX,anchorY:object.properties.anchorY,accent:object.properties.accent,zone:object.properties.zone,zIndex:object.properties.zIndex,entrance:portals.find((portal)=>portal.ownerId===object.name),collision:collisionRects.find((rect)=>rect.ownerId===object.name),vehicleExclusion:vehicleExclusions.find((rect)=>rect.ownerId===object.name)};});
const living = layers.living.objects.map((raw)=>{const object=mergeObject(raw);return {id:object.properties.assetId??object.name,templateId:raw.template?templateId(raw.template):'inline',asset:{dayImage:object.properties.dayImage,nightImage:object.properties.nightImage},x:object.x,baseline:object.y,width:object.properties.width??object.properties.displayWidth,height:object.properties.height??object.properties.displayHeight,anchorX:object.properties.anchorX??.5,anchorY:object.properties.anchorY??1,zIndex:object.properties.zIndex??70};});
const props = layers.props.objects.map((raw)=>{const object=mergeObject(raw);return {id:object.name,templateId:templateId(raw.template),atlasIndex:object.properties.atlasIndex,asset:object.properties.dayImage?{dayImage:object.properties.dayImage,nightImage:object.properties.nightImage}:undefined,x:object.x,baseline:object.y,width:object.properties.width,height:object.properties.height,sortY:object.properties.sortY??object.y,opacity:object.properties.opacity??1,zIndex:65};});
const resolvePublicAsset = (url) => path.join(ROOT, 'public', url.replace(/^\/policy-town\//, ''));
for (const object of [...buildings, ...living]) {
  const dayFile = resolvePublicAsset(object.asset.dayImage);
  const nightFile = resolvePublicAsset(object.asset.nightImage);
  if (!fs.existsSync(dayFile) || !fs.existsSync(nightFile)) fail(`${object.id} references a missing day/night asset`);
  const day = inspectRgbaPng(dayFile);
  const night = inspectRgbaPng(nightFile);
  if (day.width !== night.width || day.height !== night.height) fail(`${object.id} day/night dimensions differ`);
  if (!day.alpha.equals(night.alpha)) fail(`${object.id} day/night alpha masks differ`);
  const corners = [0, day.width - 1, (day.height - 1) * day.width, day.width * day.height - 1];
  if (corners.some((index) => day.alpha[index] !== 0)) fail(`${object.id} must have transparent corners`);
}
for (const object of props.filter((item)=>item.asset)) {
  const dayFile = resolvePublicAsset(object.asset.dayImage);
  const nightFile = resolvePublicAsset(object.asset.nightImage);
  if (!fs.existsSync(dayFile) || !fs.existsSync(nightFile)) fail(`${object.id} references a missing day/night prop asset`);
  const day = inspectRgbaPng(dayFile);
  const night = inspectRgbaPng(nightFile);
  if (day.width !== night.width || day.height !== night.height || !day.alpha.equals(night.alpha)) fail(`${object.id} day/night prop pair is not aligned`);
}
const parkedVehicles = [
 ['parked-blue',0,0,82,39],['parked-gray',2,0,82,39],['parked-gray-2',2,0,82,39],['parked-red',1,1,82,39],['parked-van',0,1,88,42],['parked-blue-2',0,0,82,39],
].map(([id,column,row,width,height],index)=>({id,frame:{column,row},parkingSlotId:parkingSlots[index].id,speed:0,phase:0,width,height,flip:parkingSlots[index].direction==='west'}));
const movingVehicles = [
 ['moving-taxi',1,0,'route-east-1',66,.15,90,42,false],['moving-blue',0,0,'route-west-1',78,.58,88,42,true],['moving-van',0,1,'route-east-2',52,.72,96,45,false],['moving-bus',2,1,'route-bus',42,.03,142,58,false],
].map(([id,column,row,routeId,speed,phase,width,height,flip])=>({id,frame:{column,row},routeId,speed,phase,width,height,flip,isBus:id==='moving-bus'}));
const actorRoutes = actorRoutesRaw.map((route)=>({id:route.id,skin:route.skin,route:route.points,speed:route.speed,phase:route.phase}));
const sourceForHash=JSON.parse(JSON.stringify(map));
for (const layer of sourceForHash.layers) if (layer.name==='objmap') layer.data=[];
const manifest = {version:1,map:{width:map.width,height:map.height,tileSize:TILE,pixelWidth:map.width*TILE,pixelHeight:map.height*TILE,visibleHeight:1080},ground:{dayImage:'/policy-town/assets/city-v3/ground/city-ground-axial-day-v3.png',nightImage:'/policy-town/assets/city-v3/ground/city-ground-axial-night-v3.png'},buildings,living,props,parkingSlots,vehicles:[...parkedVehicles,...movingVehicles],vehicleRoutes,actorRoutes,portals,zones,collisionRects,vehicleExclusions,collisionGrid,sourceHash:crypto.createHash('sha256').update(JSON.stringify(sourceForHash)).digest('hex')};
const manifestContent=serialize(manifest);
const transpose=(grid)=>Array.from({length:map.width},(_,x)=>Array.from({length:map.height},(_,y)=>grid[y][x]));
const aiContent=`// Map generated by scripts/compile_city_map.mjs\nexport const tilesetpath = "/policy-town/assets/city-v3/ground/city-logic-tiles-v3.png";\nexport const tiledim = 32;\nexport const screenxtiles = 60;\nexport const screenytiles = 34;\nexport const tilesetpxw = 160;\nexport const tilesetpxh = 32;\nexport const bgtiles = ${JSON.stringify([transpose(bgGrid)])};\nexport const objmap = ${JSON.stringify([transpose(collisionGrid)])};\nexport const animatedsprites = [];\nexport const mapwidth = 60;\nexport const mapheight = 34;\n`;
const checkFile=(file,content)=>{if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content)fail(`${path.relative(ROOT,file)} is stale; run npm run city:compile`);};
if(CHECK){checkFile(OUT_JSON,manifestContent);checkFile(OUT_AI,aiContent);console.log('City map is valid and generated files are current.');}
else {fs.mkdirSync(path.dirname(OUT_JSON),{recursive:true});fs.writeFileSync(OUT_JSON,manifestContent);fs.writeFileSync(OUT_AI,aiContent);console.log(`Compiled ${path.relative(ROOT,MAP_FILE)}`);}
