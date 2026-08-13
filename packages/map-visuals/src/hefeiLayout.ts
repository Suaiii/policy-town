export interface ParcelSlot {
  id: string
  position: { x: number; y: number }
  rotation: number
}

export const HEFEI_PARCEL_SLOTS: ParcelSlot[] = [
  { id: 'parcel-nw', position: { x: 0.18, y: 0.24 }, rotation: -0.08 },
  { id: 'parcel-nc', position: { x: 0.42, y: 0.22 }, rotation: 0.06 },
  { id: 'parcel-ne', position: { x: 0.65, y: 0.27 }, rotation: -0.04 },
  { id: 'parcel-mw', position: { x: 0.26, y: 0.48 }, rotation: 0.04 },
  { id: 'parcel-mc', position: { x: 0.50, y: 0.47 }, rotation: -0.05 },
  { id: 'parcel-me', position: { x: 0.73, y: 0.50 }, rotation: 0.07 },
  { id: 'parcel-sw', position: { x: 0.17, y: 0.73 }, rotation: 0.05 },
  { id: 'parcel-sc', position: { x: 0.41, y: 0.75 }, rotation: -0.06 },
  { id: 'parcel-se', position: { x: 0.64, y: 0.70 }, rotation: 0.08 },
]

export const PARCEL_LOCAL_ANCHORS = {
  main: [-0.22, -0.08] as const,
  support: [0.58, -0.2] as const,
  warehouse: [-0.42, 0.52] as const,
  utility: [0.56, 0.5] as const,
  siteGate: [0, 0.94] as const,
  buildingEntrance: [0, 0.48] as const,
  transitEntry: [0, 1.42] as const,
  alert: [0, -0.72] as const,
}
