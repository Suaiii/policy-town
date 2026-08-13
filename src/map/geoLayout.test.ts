import { describe, expect, it } from 'vitest'
import { HEFEI_GEO_PARCELS } from './geoLayout'
import { chaoLake } from './data/hefeiGeoData'

function pointInPolygon(point: [number, number], polygon: number[][]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [x, y] = polygon[index]
    const [previousX, previousY] = polygon[previous]
    const intersects = (y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x
    if (intersects) inside = !inside
  }
  return inside
}

describe('Hefei geographic parcel layout', () => {
  it('provides nine stable, unique land anchors', () => {
    expect(HEFEI_GEO_PARCELS).toHaveLength(9)
    expect(new Set(HEFEI_GEO_PARCELS.map((anchor) => anchor.slotId)).size).toBe(9)
    expect(new Set(HEFEI_GEO_PARCELS.map((anchor) => `${anchor.longitude}:${anchor.latitude}`)).size).toBe(9)

    const lakeRing = chaoLake.features[0].geometry.coordinates[0]
    for (const anchor of HEFEI_GEO_PARCELS) {
      expect(pointInPolygon([anchor.longitude, anchor.latitude], lakeRing)).toBe(false)
    }
  })

  it('keeps parcel anchors separated at city scale', () => {
    for (let left = 0; left < HEFEI_GEO_PARCELS.length; left += 1) {
      for (let right = left + 1; right < HEFEI_GEO_PARCELS.length; right += 1) {
        const a = HEFEI_GEO_PARCELS[left]
        const b = HEFEI_GEO_PARCELS[right]
        const distance = Math.hypot(a.longitude - b.longitude, a.latitude - b.latitude)
        expect(distance).toBeGreaterThan(0.1)
      }
    }
  })
})
