export interface ParcelSlot {
  id: string
  position: { x: number; y: number }
  rotation: number
}

export const HEFEI_PARCEL_SLOTS: ParcelSlot[] = [
  // 高新区：研发项目沿西侧创新走廊布置。
  { id: 'gaoxin-north', position: { x: 0.18, y: 0.34 }, rotation: -0.18 },
  { id: 'gaoxin-south', position: { x: 0.27, y: 0.50 }, rotation: -0.08 },
  // 新站高新区：制造项目沿东北侧铁路与能源走廊展开。
  { id: 'xinzhan-west', position: { x: 0.56, y: 0.23 }, rotation: 0.08 },
  { id: 'xinzhan-east', position: { x: 0.73, y: 0.29 }, rotation: 0.16 },
  { id: 'xinzhan-south', position: { x: 0.66, y: 0.45 }, rotation: 0.04 },
  // 经开区：重型制造和仓储靠近西南物流环。
  { id: 'jingkai-west', position: { x: 0.25, y: 0.69 }, rotation: -0.12 },
  { id: 'jingkai-east', position: { x: 0.43, y: 0.73 }, rotation: 0.02 },
  // 滨湖新区：研发与总部项目沿东南科创廊道布置。
  { id: 'binhu-north', position: { x: 0.68, y: 0.65 }, rotation: 0.12 },
  { id: 'binhu-south', position: { x: 0.77, y: 0.78 }, rotation: 0.2 },
]

export const PARCEL_LOCAL_ANCHORS = {
  // 入口在南侧：仓储临近入口，主厂房位于腹地，公用设施靠边布置。
  main: [-0.28, -0.23] as const,
  support: [0.48, -0.19] as const,
  warehouse: [-0.46, 0.46] as const,
  utility: [0.5, 0.48] as const,
  siteGate: [0, 0.94] as const,
  buildingEntrance: [0, 0.28] as const,
  transitEntry: [0, 1.42] as const,
  alert: [0.73, -0.67] as const,
}
