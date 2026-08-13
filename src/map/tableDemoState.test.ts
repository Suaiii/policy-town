import { describe, expect, it } from 'vitest'
import { isMapSnapshot } from '../../packages/contracts/src'
import { createFullCityDemoSnapshot } from './tableDemoState'

describe('full city map preset', () => {
  it('opens with nine maximum-density parcels that still obey the map contract', () => {
    const snapshot = createFullCityDemoSnapshot()

    expect(isMapSnapshot(snapshot)).toBe(true)
    expect(snapshot.projects).toHaveLength(9)
    expect(snapshot.projects.every((project) => project.physicalAssets.assets.length === 4)).toBe(true)
    expect(snapshot.projects.every((project) => project.physicalAssets.assets.every((asset) => asset.currentLevel === 3))).toBe(true)
    expect(snapshot.projects.every((project) => project.physicalAssets.overflowUnits === 2)).toBe(true)
  })
})
