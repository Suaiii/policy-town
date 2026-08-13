import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'

export const hefeiBoundary: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: '合肥市', source: 'OpenStreetMap relation 3288965' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [116.6813863, 31.821468], [116.7588328, 31.7306581], [116.7583716, 31.574212],
        [116.8752745, 31.5394866], [117.0651291, 31.5547834], [117.2235176, 31.5461668],
        [117.2498837, 31.5036828], [117.1411443, 31.4849163], [117.0672988, 31.3698919],
        [117.0453787, 31.2380224], [117.1202069, 31.1448691], [117.22198, 31.02543],
        [117.358623, 30.948572], [117.502282, 31.004933], [117.5239009, 31.1443802],
        [117.5678153, 31.2700882], [117.6471859, 31.362533], [117.7298354, 31.4872357],
        [117.9003167, 31.5063186], [117.9456997, 31.5413733], [117.9351685, 31.6273563],
        [117.8945929, 31.7050176], [117.9116331, 31.7890688], [117.9028374, 31.8423217],
        [117.9531347, 31.904241], [117.8609292, 31.9561379], [117.833324, 32.014724],
        [117.848901, 32.09207], [117.8568971, 32.2136589], [117.791757, 32.218084],
        [117.6912224, 32.2582493], [117.500394, 32.202185], [117.437452, 32.36775],
        [117.393834, 32.481125], [117.322924, 32.439164], [117.1963763, 32.5384382],
        [117.0697654, 32.5280596], [117.0680823, 32.4685978], [116.9972706, 32.3932661],
        [117.0382762, 32.3853524], [117.031619, 32.2806451], [117.0609798, 32.2378036],
        [116.9982281, 32.2187568], [117.0182455, 32.1038458], [117.0450059, 32.0406925],
        [116.9902282, 31.9935043], [116.9278761, 32.0266068], [116.8691795, 31.9722882],
        [116.748383, 31.8903118], [116.6813863, 31.821468],
      ]],
    },
  }],
}

export const chaoLake: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: '巢湖', source: 'OpenStreetMap relation 1284411' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [117.2878041, 31.657393], [117.2950523, 31.5836214], [117.3362364, 31.5786126],
        [117.3659474, 31.5473133], [117.398132, 31.531058], [117.4284118, 31.5017239],
        [117.4551695, 31.466938], [117.5228076, 31.4338319], [117.5670859, 31.4315183],
        [117.6140712, 31.4403316], [117.6611306, 31.4587291], [117.70475, 31.5085],
        [117.7608847, 31.5500085], [117.8099131, 31.5780755], [117.8537061, 31.5925287],
        [117.8036647, 31.604383], [117.7175, 31.6569998], [117.6679345, 31.6628297],
        [117.62025, 31.6239998], [117.5641513, 31.5724948], [117.5246588, 31.5879038],
        [117.4612673, 31.5842884], [117.4419226, 31.6383534], [117.4551459, 31.6865486],
        [117.417348, 31.7001388], [117.3981616, 31.710348], [117.3544189, 31.7189433],
        [117.3122156, 31.7046548], [117.300245, 31.6809626], [117.2878041, 31.657393],
      ]],
    },
  }],
}

export const hefeiRoads: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature', properties: { class: 'expressway', name: '合肥绕城高速' },
      geometry: { type: 'LineString', coordinates: [
        [116.965, 31.83], [117.015, 31.98], [117.205, 32.035], [117.405, 31.985],
        [117.505, 31.84], [117.425, 31.665], [117.205, 31.625], [117.035, 31.68], [116.965, 31.83],
      ] },
    },
    {
      type: 'Feature', properties: { class: 'expressway', name: '沪陕高速' },
      geometry: { type: 'LineString', coordinates: [
        [116.73, 31.94], [116.98, 31.91], [117.22, 31.89], [117.49, 31.91], [117.8, 31.96],
      ] },
    },
    {
      type: 'Feature', properties: { class: 'expressway', name: '京台高速' },
      geometry: { type: 'LineString', coordinates: [
        [116.91, 32.34], [117.03, 32.08], [117.15, 31.88], [117.29, 31.64], [117.43, 31.39], [117.54, 31.12],
      ] },
    },
    {
      type: 'Feature', properties: { class: 'arterial', name: '城市东西产业轴' },
      geometry: { type: 'LineString', coordinates: [
        [116.92, 31.82], [117.08, 31.82], [117.24, 31.83], [117.42, 31.82], [117.61, 31.79],
      ] },
    },
    {
      type: 'Feature', properties: { class: 'arterial', name: '城市南北产业轴' },
      geometry: { type: 'LineString', coordinates: [
        [117.22, 32.12], [117.23, 31.98], [117.24, 31.83], [117.26, 31.7], [117.29, 31.57],
      ] },
    },
    {
      type: 'Feature', properties: { class: 'arterial', name: '滨湖产业走廊' },
      geometry: { type: 'LineString', coordinates: [
        [117.03, 31.72], [117.16, 31.66], [117.31, 31.63], [117.45, 31.7], [117.6, 31.78],
      ] },
    },
  ],
}

export const industryDistricts: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: '高新技术产业开发区' }, geometry: { type: 'Point', coordinates: [117.08, 31.82] } },
    { type: 'Feature', properties: { name: '经济技术开发区' }, geometry: { type: 'Point', coordinates: [117.2, 31.7] } },
    { type: 'Feature', properties: { name: '新站高新区' }, geometry: { type: 'Point', coordinates: [117.34, 31.96] } },
    { type: 'Feature', properties: { name: '东部产业走廊' }, geometry: { type: 'Point', coordinates: [117.55, 31.85] } },
  ],
}

const urbanLongitudes = [116.96, 117.04, 117.12, 117.2, 117.28, 117.36, 117.44, 117.52]
const urbanLatitudes = [31.66, 31.73, 31.8, 31.87, 31.94, 32.01]

export const urbanBlocks: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: urbanLongitudes.slice(0, -1).flatMap((west, column) =>
    urbanLatitudes.slice(0, -1).map((south, row) => {
      const east = urbanLongitudes[column + 1]
      const north = urbanLatitudes[row + 1]
      const insetX = 0.007
      const insetY = 0.006
      return {
        type: 'Feature' as const,
        properties: { tone: (column + row) % 3, zone: 'central-hefei' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [west + insetX, south + insetY],
            [east - insetX, south + insetY],
            [east - insetX, north - insetY],
            [west + insetX, north - insetY],
            [west + insetX, south + insetY],
          ]],
        },
      }
    }),
  ),
}

export const urbanRoadGrid: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: [
    ...urbanLongitudes.map((longitude, index) => ({
      type: 'Feature' as const,
      properties: { class: index % 2 === 0 ? 'avenue' : 'street' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [[longitude, urbanLatitudes[0]], [longitude, urbanLatitudes.at(-1)!]],
      },
    })),
    ...urbanLatitudes.map((latitude, index) => ({
      type: 'Feature' as const,
      properties: { class: index % 2 === 0 ? 'avenue' : 'street' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [[urbanLongitudes[0], latitude], [urbanLongitudes.at(-1)!, latitude]],
      },
    })),
  ],
}

export const urbanWaterways: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: '南淝河城市段', treatment: 'stylized' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [116.95, 31.9], [117.04, 31.885], [117.13, 31.86], [117.22, 31.855],
        [117.31, 31.83], [117.4, 31.8], [117.5, 31.775], [117.56, 31.75],
      ],
    },
  }],
}
