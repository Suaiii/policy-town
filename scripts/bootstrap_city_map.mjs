#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_DIR = path.join(ROOT, 'maps/city-v3');
const TEMPLATE_DIR = path.join(MAP_DIR, 'templates');
const RULE_DIR = path.join(MAP_DIR, 'rules');
const WIDTH = 60;
const HEIGHT = 34;
const TILE = 32;

const prop = (name, type, value) => ({ name, type, value });
const rectangle = (id, name, x, y, width, height, properties = []) => ({
  id, name, type: '', x, y, width, height, rotation: 0, visible: true, properties,
});
const polyline = (id, name, points, properties = []) => ({
  id, name, type: '', x: points[0][0], y: points[0][1], width: 0, height: 0, rotation: 0,
  visible: true, polyline: points.map(([x, y]) => ({ x: x - points[0][0], y: y - points[0][1] })), properties,
});

const templates = {
  government_joint: { kind: 'building', assetId: 'GOV', dayImage: '/policy-town/assets/city-v3/buildings/government-day-v3.png', nightImage: '/policy-town/assets/city-v3/buildings/government-night-v3.png', width: 475, height: 386, anchorX: 0.5, anchorY: 1, zone: 'civic', zIndex: 10, accent: '#f0cb72', label: '城市协同政府', collision: [-178, -30, 356, 44], vehicleExclusion: [-215, -98, 430, 113], entranceOffset: [0, 12] },
  company_a: { kind: 'building', assetId: 'A', dayImage: '/policy-town/assets/city-v3/buildings/company-a-day-v3.png', nightImage: '/policy-town/assets/city-v3/buildings/company-a-night-v3.png', width: 265, height: 418, anchorX: 0.5, anchorY: 1, zone: 'west', zIndex: 20, accent: '#d9a766', label: '成熟期总部', collision: [-100, -28, 200, 42], vehicleExclusion: [-126, -118, 252, 132], entranceOffset: [0, 12] },
  company_b: { kind: 'building', assetId: 'B', dayImage: '/policy-town/assets/city-v3/buildings/company-b-day-v3.png', nightImage: '/policy-town/assets/city-v3/buildings/company-b-night-v3.png', width: 280, height: 333, anchorX: 0.5, anchorY: 1, zone: 'west', zIndex: 30, accent: '#ffb451', label: '增长期总部', collision: [-110, -30, 220, 44], vehicleExclusion: [-133, -82, 266, 97], entranceOffset: [0, 12] },
  company_c: { kind: 'building', assetId: 'C', dayImage: '/policy-town/assets/city-v3/buildings/company-c-day-v3.png', nightImage: '/policy-town/assets/city-v3/buildings/company-c-night-v3.png', width: 260, height: 423, anchorX: 0.5, anchorY: 1, zone: 'east', zIndex: 20, accent: '#72e6ff', label: 'AI 转型总部', collision: [-92, -28, 184, 42], vehicleExclusion: [-124, -120, 248, 135], entranceOffset: [0, 12] },
  company_d: { kind: 'building', assetId: 'D', dayImage: '/policy-town/assets/city-v3/buildings/company-d-day-v3.png', nightImage: '/policy-town/assets/city-v3/buildings/company-d-night-v3.png', width: 355, height: 199, anchorX: 0.5, anchorY: 1, zone: 'east', zIndex: 30, accent: '#90b4be', label: '外包服务中心', collision: [-150, -30, 300, 44], vehicleExclusion: [-170, -78, 340, 93], entranceOffset: [0, 12] },
  office_small_01: { kind: 'living', assetId: 'community', dayImage: '/policy-town/assets/city-v3/living/community-day-v3.png', nightImage: '/policy-town/assets/city-v3/living/community-night-v3.png', width: 188, height: 164, anchorX: 0.5, anchorY: 1, zone: 'living-west', zIndex: 70, collision: [-75, -22, 150, 32] },
  plaza_forecourt: { kind: 'living', assetId: 'park', dayImage: '/policy-town/assets/city-v3/living/social-park-day-v3.png', nightImage: '/policy-town/assets/city-v3/living/social-park-night-v3.png', width: 235, height: 198, anchorX: 0.5, anchorY: 1, zone: 'civic', zIndex: 75, collision: [] },
  talent_market: { kind: 'living', assetId: 'cafe', dayImage: '/policy-town/assets/city-v3/living/cafe-store-day-v3.png', nightImage: '/policy-town/assets/city-v3/living/cafe-store-night-v3.png', width: 230, height: 215, anchorX: 0.5, anchorY: 1, zone: 'living-west', zIndex: 70, collision: [-92, -24, 184, 34] },
  parking_car: { kind: 'parking', vehicleClass: 'car', width: 90, height: 44, direction: 'east' },
  parking_bus: { kind: 'parking', vehicleClass: 'bus', width: 160, height: 58, direction: 'east' },
  bus_stop: { kind: 'prop', atlasIndex: 7, width: 44, height: 106, collision: [-9, -12, 18, 12] },
  street_tree: { kind: 'prop', atlasIndex: 0, width: 72, height: 144, collision: [-12, -12, 24, 18] },
  street_light: { kind: 'prop', atlasIndex: 3, width: 56, height: 112, collision: [-7, -8, 14, 12] },
  bench: { kind: 'prop', atlasIndex: 2, width: 76, height: 82, collision: [-25, -12, 50, 16] },
  traffic_signal: { kind: 'prop', dayImage: '/policy-town/assets/city-v3/third-party/traffic-signal-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/traffic-signal-night-v3.png', width: 50, height: 100, opacity: 0.9 },
  trash_bin: { kind: 'prop', dayImage: '/policy-town/assets/city-v3/third-party/trash-bin-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/trash-bin-night-v3.png', width: 36, height: 36 },
  traffic_cone: { kind: 'prop', dayImage: '/policy-town/assets/city-v3/third-party/traffic-cone-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/traffic-cone-night-v3.png', width: 30, height: 30 },
  fire_hydrant: { kind: 'prop', dayImage: '/policy-town/assets/city-v3/third-party/fire-hydrant-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/fire-hydrant-night-v3.png', width: 34, height: 34 },
  mailbox: { kind: 'prop', dayImage: '/policy-town/assets/city-v3/third-party/mailbox-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/mailbox-night-v3.png', width: 36, height: 36 },
  vending_machine: { kind: 'prop', dayImage: '/policy-town/assets/city-v3/third-party/vending-machine-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/vending-machine-night-v3.png', width: 44, height: 44 },
  flower_box: { kind: 'prop', dayImage: '/policy-town/assets/city-v3/third-party/flower-box-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/flower-box-night-v3.png', width: 54, height: 38 },
  manhole: { kind: 'decal', dayImage: '/policy-town/assets/city-v3/third-party/manhole-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/manhole-night-v3.png', width: 32, height: 32, sortY: 1, opacity: 0.68 },
  road_crack: { kind: 'decal', dayImage: '/policy-town/assets/city-v3/third-party/road-crack-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/road-crack-night-v3.png', width: 64, height: 64, sortY: 1, opacity: 0.32 },
  storm_drain: { kind: 'decal', dayImage: '/policy-town/assets/city-v3/third-party/storm-drain-day-v3.png', nightImage: '/policy-town/assets/city-v3/third-party/storm-drain-night-v3.png', width: 32, height: 32, sortY: 1, opacity: 0.58 },
};
for (const department of ['hr', 'finance', 'industry', 'regulation']) {
  templates[`government_${department}_node`] = { kind: 'portal', department, width: 32, height: 32 };
}

const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
fs.rmSync(TEMPLATE_DIR, { recursive: true, force: true });
fs.rmSync(RULE_DIR, { recursive: true, force: true });
fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
fs.mkdirSync(RULE_DIR, { recursive: true });

for (const [name, properties] of Object.entries(templates)) {
  writeJson(path.join(TEMPLATE_DIR, `${name}.tj`), {
    type: 'template', object: { id: 1, name, type: properties.kind, width: properties.width ?? 0, height: properties.height ?? 0, visible: true,
      properties: Object.entries(properties).map(([key, value]) => prop(key, Array.isArray(value) || typeof value === 'object' ? 'string' : typeof value === 'number' ? 'float' : typeof value === 'boolean' ? 'bool' : 'string', Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : value)),
    },
  });
}

const buildings = [
  ['government', 'government_joint', 960, 510], ['company-a', 'company_a', 245, 590],
  ['company-b', 'company_b', 575, 720], ['company-c', 'company_c', 1375, 595], ['company-d', 'company_d', 1690, 715],
].map(([name, template, x, y], index) => ({ id: 100 + index, name, template: `templates/${template}.tj`, x, y, width: 0, height: 0, rotation: 0, visible: true }));

const livingSpecs = [
  ['cafe', 'talent_market', 145, 1032], ['community', 'office_small_01', 390, 1028],
  ['apartment', null, 625, 1034, 'apartment', 164, 232], ['park', 'plaza_forecourt', 960, 925],
  ['townhouses', null, 1300, 1028, 'townhouses', 280, 218], ['bus-shelter', null, 1655, 1018, 'bus-shelter', 205, 169],
];
const living = livingSpecs.map(([name, template, x, y, assetId, width, height], index) => template
  ? { id: 200 + index, name, template: `templates/${template}.tj`, x, y, width: 0, height: 0, rotation: 0, visible: true }
  : rectangle(200 + index, name, x, y, 0, 0, [prop('kind', 'string', 'living'), prop('assetId', 'string', assetId), prop('dayImage', 'string', `/policy-town/assets/city-v3/living/${assetId}-day-v3.png`), prop('nightImage', 'string', `/policy-town/assets/city-v3/living/${assetId}-night-v3.png`), prop('displayWidth', 'int', width), prop('displayHeight', 'int', height), prop('anchorX', 'float', 0.5), prop('anchorY', 'float', 1), prop('zIndex', 'int', 70)]));

const parkingPositions = [[120,670],[300,670],[900,670],[1020,670],[1300,670],[1420,670]];
const parking = parkingPositions.map(([x,y], index) => ({ id: 300 + index, name: `parking-${index + 1}`, template: 'templates/parking_car.tj', x, y, width: 0, height: 0, rotation: index >= 3 ? 180 : 0, visible: true }));

const vehicleRoutes = [
  polyline(400, 'route-east-1', [[-120,755],[2040,755]], [prop('usage','string','vehicle'),prop('speedClass','string','normal')]),
  polyline(401, 'route-west-1', [[2040,815],[-120,815]], [prop('usage','string','vehicle'),prop('speedClass','string','fast')]),
  polyline(402, 'route-east-2', [[-160,755],[2040,755]], [prop('usage','string','vehicle'),prop('speedClass','string','slow')]),
  polyline(403, 'route-bus', [[-250,815],[1450,815],[1660,815],[2040,815]], [prop('usage','string','bus'),prop('speedClass','string','bus'),prop('stationId','string','bus-stop-east')]),
];

const actorDefinitions = [
 ['gov-1','f1',20,.05,[[860,560],[930,560],[930,590],[860,590]]], ['gov-2','f2',18,.31,[[990,560],[1060,560],[1060,590],[990,590]]], ['gov-3','f3',19,.59,[[870,620],[950,620],[950,655],[870,655]]], ['gov-4','f4',17,.82,[[970,620],[1040,620],[1040,655],[970,655]]],
 ['enterprise-a','f5',18,.18,[[165,625],[325,625],[325,650],[165,650]]], ['enterprise-b','f6',19,.41,[[495,635],[655,635],[655,655],[495,655]]], ['enterprise-c','f7',18,.67,[[1300,650],[1450,650],[1450,680],[1300,680]]], ['enterprise-d','f8',20,.91,[[1605,640],[1770,640],[1770,660],[1605,660]]],
 ['employee-a1','f2',25,.03,[[80,705],[330,705],[330,690],[80,690]]], ['employee-a2','f3',23,.25,[[120,630],[420,630],[420,650],[120,650]]], ['employee-a3','f5',24,.48,[[250,900],[680,900],[680,920],[250,920]]], ['employee-a4','f8',22,.73,[[610,920],[700,920],[700,950],[610,950]]],
 ['employee-b1','f1',25,.12,[[450,875],[700,875],[700,890],[450,890]]], ['employee-b2','f6',21,.64,[[520,940],[700,940],[700,970],[520,970]]], ['employee-c1','f4',25,.36,[[1250,650],[1510,650],[1510,680],[1250,680]]], ['employee-c2','f7',22,.84,[[1220,875],[1435,875],[1435,890],[1220,890]]], ['employee-d1','f3',24,.56,[[1460,900],[1840,900],[1840,920],[1460,920]]], ['employee-unemployed','f6',16,.44,[[1450,920],[1800,920],[1800,950],[1450,950]]],
];
const actorRoutes = actorDefinitions.map(([name, skin, speed, phase, points], index) => polyline(500 + index, name, points, [prop('usage','string','actor'), prop('skin','string',skin), prop('speed','float',speed), prop('phase','float',phase)]));

const propObjects = [];
let propId = 600;
const addProps = (template, positions) => positions.forEach(([x,y]) => propObjects.push({ id: propId++, name: `${template}-${propId}`, template: `templates/${template}.tj`, x, y, width: 0, height: 0, rotation: 0, visible: true }));
addProps('street_tree', [[60,580],[445,575],[690,680],[1230,675],[1515,585],[1860,590],[745,890],[1175,890]]);
addProps('street_light', [[55,690],[375,690],[695,690],[1225,690],[1545,690],[1865,690],[55,885],[395,885],[720,885],[1200,885],[1525,885],[1865,885]]);
addProps('bench', [[810,650],[1110,650],[850,920],[1070,920]]);
addProps('traffic_signal', [[770,710],[1150,710],[770,870],[1150,870]]);
addProps('trash_bin', [[260,1048],[490,1038],[1410,1046],[1790,1038]]);
addProps('traffic_cone', [[685,704],[720,704],[1510,704]]);
addProps('fire_hydrant', [[465,694],[1470,694],[805,1048],[1120,1048]]);
addProps('mailbox', [[1180,1045],[1515,1045]]);
addProps('vending_machine', [[245,1018],[1772,1008]]);
addProps('flower_box', [[725,1048],[1195,1048]]);
addProps('manhole', [[470,780],[1100,800],[1770,780]]);
addProps('road_crack', [[250,790],[1325,785]]);
addProps('storm_drain', [[590,728],[965,842],[1590,728],[1850,842]]);

const zones = [
 rectangle(700,'vehicle-zone',0,720,1920,130,[prop('kind','string','vehicle')]),
 rectangle(701,'walk-north',0,600,1920,110,[prop('kind','string','walk')]),
 rectangle(702,'walk-south',0,850,1920,210,[prop('kind','string','walk')]),
 rectangle(703,'civic-zone',780,500,360,205,[prop('kind','string','public')]),
];
const portals = [
 ...buildings.map((building,index)=>rectangle(800+index,`${building.name}-entrance`,building.x,building.y+12,1,1,[prop('ownerId','string',building.name)])),
 rectangle(810,'bus-stop-east',1655,880,1,1,[prop('ownerId','string','bus-shelter')]),
 ...['hr','finance','industry','regulation'].map((name,index)=>({id:820+index,name:`government-${name}`,template:`templates/government_${name}_node.tj`,x:900+index*40,y:560,width:0,height:0,rotation:0,visible:true})),
];

const emptyTiles = Array(WIDTH * HEIGHT).fill(0);
const initialGroundTiles = Array.from({ length: HEIGHT }, (_, row) => Array.from({ length: WIDTH }, (_, col) => {
  const x = col * TILE + TILE / 2;
  const y = row * TILE + TILE / 2;
  if (y >= 720 && y <= 850) return 3;
  if ((y >= 600 && y <= 710) || (y >= 850 && y <= 1060) || (x >= 780 && x <= 1140 && y >= 500 && y <= 705)) return 4;
  return y >= 850 ? 2 : 1;
})).flat();
const map = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
  width: WIDTH, height: HEIGHT, tilewidth: TILE, tileheight: TILE, infinite: false, nextlayerid: 20, nextobjectid: 900,
  tilesets: [{ firstgid: 1, source: 'city-v3.tsj' }],
  layers: [
    { id:1,name:'bgtiles',type:'tilelayer',width:WIDTH,height:HEIGHT,x:0,y:0,opacity:1,visible:true,data:initialGroundTiles },
    { id:2,name:'objmap',type:'tilelayer',width:WIDTH,height:HEIGHT,x:0,y:0,opacity:.3,visible:false,locked:true,data:emptyTiles },
    { id:3,name:'buildings',type:'objectgroup',draworder:'topdown',visible:true,opacity:1,objects:buildings },
    { id:4,name:'living',type:'objectgroup',draworder:'topdown',visible:true,opacity:1,objects:living },
    { id:5,name:'props',type:'objectgroup',draworder:'topdown',visible:true,opacity:1,objects:propObjects },
    { id:6,name:'parking',type:'objectgroup',draworder:'topdown',visible:true,opacity:1,objects:parking },
    { id:7,name:'vehicle_routes',type:'objectgroup',draworder:'topdown',visible:true,opacity:1,objects:vehicleRoutes },
    { id:8,name:'actor_routes',type:'objectgroup',draworder:'topdown',visible:true,opacity:1,objects:actorRoutes },
    { id:9,name:'portals',type:'objectgroup',draworder:'topdown',visible:true,opacity:1,objects:portals },
    { id:10,name:'zones',type:'objectgroup',draworder:'topdown',visible:false,opacity:.35,objects:zones },
  ],
};
writeJson(path.join(MAP_DIR, 'city-v3.tmj'), map);
writeJson(path.join(MAP_DIR, 'city-v3.tsj'), { type:'tileset', version:'1.10', tiledversion:'1.10.2', name:'city-v3-logic', tilewidth:32, tileheight:32, tilecount:5, columns:5, image:'../../public/assets/city-v3/ground/city-logic-tiles-v3.png', imagewidth:160, imageheight:32, tiles:[{id:0,type:'lot'},{id:1,type:'grass'},{id:2,type:'road'},{id:3,type:'walk'},{id:4,type:'collision'}] });
writeJson(path.join(MAP_DIR, 'city-v3.tiled-project'), { folders:['.'], extensions:[] });
fs.writeFileSync(path.join(RULE_DIR, 'rules.txt'), 'road-furniture-rules.tmj\n');
const ruleTiles = Array(25).fill(0);
ruleTiles[12] = 3;
writeJson(path.join(RULE_DIR, 'road-furniture-rules.tmj'), {
  type:'map',version:'1.10',tiledversion:'1.10.2',orientation:'orthogonal',renderorder:'right-down',
  width:5,height:5,tilewidth:32,tileheight:32,infinite:false,nextlayerid:3,nextobjectid:2,
  layers:[
    {id:1,name:'input_bgtiles',type:'tilelayer',width:5,height:5,x:0,y:0,visible:true,opacity:1,data:ruleTiles},
    {id:2,name:'output_props',type:'objectgroup',draworder:'topdown',visible:true,opacity:1,objects:[{id:1,name:'auto-street-light',template:'../templates/street_light.tj',x:80,y:80,width:0,height:0,rotation:0,visible:true}]},
  ],
  tilesets:[{firstgid:1,source:'../city-v3.tsj'}],
});
console.log(`Bootstrapped ${path.relative(ROOT, MAP_DIR)}`);
