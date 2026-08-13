import { describe, expect, it } from 'vitest'
import { createFullCityDemoSnapshot } from '../map/tableDemoState'
import { deriveTownProsperity } from './TableFactoryTown'

describe('table town prosperity', () => {
  it('starts at zero when no authoritative physical assets exist', () => {
    const full = createFullCityDemoSnapshot()
    const empty = {
      ...full,
      revision: 0,
      city: { employmentIndex: 0, logisticsIndex: 0, gridPressure: 0, fiscalPressure: 0 },
      projects: full.projects.map((project) => ({
        ...project,
        builtProgress: 0,
        physicalAssets: { ...project.physicalAssets, qualifiedCapital: 0, assets: [] },
      })),
    }

    expect(deriveTownProsperity(empty)).toBe(0)
  })

  it('uses the complete full-city snapshot as the maximum prosperity level', () => {
    expect(deriveTownProsperity(createFullCityDemoSnapshot())).toBe(5)
  })
})

