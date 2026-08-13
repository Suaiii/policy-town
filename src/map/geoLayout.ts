import type { MapParcelScene } from '../../packages/map-visuals/src/scene'

export type GeoParcelAnchor = {
  slotId: string
  longitude: number
  latitude: number
  rotation: number
  scale: number
}

export type GeoParcelScene = {
  parcel: MapParcelScene
  anchor: GeoParcelAnchor
}

export const HEFEI_GEO_PARCELS: GeoParcelAnchor[] = [
  { slotId: 'parcel-nw', longitude: 117.02, latitude: 31.96, rotation: -0.08, scale: 6200 },
  { slotId: 'parcel-nc', longitude: 117.25, latitude: 32.02, rotation: 0.06, scale: 6200 },
  { slotId: 'parcel-ne', longitude: 117.5, latitude: 31.98, rotation: -0.04, scale: 6200 },
  { slotId: 'parcel-mw', longitude: 117.04, latitude: 31.8, rotation: 0.04, scale: 6200 },
  { slotId: 'parcel-mc', longitude: 117.25, latitude: 31.83, rotation: -0.05, scale: 6200 },
  { slotId: 'parcel-me', longitude: 117.51, latitude: 31.82, rotation: 0.07, scale: 6200 },
  { slotId: 'parcel-sw', longitude: 117.05, latitude: 31.63, rotation: 0.05, scale: 6200 },
  { slotId: 'parcel-sc', longitude: 117.27, latitude: 31.69, rotation: -0.06, scale: 6200 },
  { slotId: 'parcel-se', longitude: 117.64, latitude: 31.75, rotation: 0.08, scale: 6200 },
]

const anchorBySlot = new Map(HEFEI_GEO_PARCELS.map((anchor) => [anchor.slotId, anchor]))

export function placeMapSceneOnGeo(parcels: MapParcelScene[]): GeoParcelScene[] {
  return parcels.flatMap((parcel) => {
    const anchor = anchorBySlot.get(parcel.slot.id)
    return anchor ? [{ parcel, anchor }] : []
  })
}

export function geoAnchorForProject(parcels: GeoParcelScene[], projectId: string | null) {
  return parcels.find(({ parcel }) => parcel.id === projectId)?.anchor
}
