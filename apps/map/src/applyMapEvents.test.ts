import { describe, expect, it } from 'vitest'
import { createDemoSnapshot } from './demoState'
import { applyMapEvents } from './applyMapEvents'

describe('applyMapEvents', () => {
  it('updates only the targeted factory stage', () => {
    const snapshot = createDemoSnapshot('construction')
    const result = applyMapEvents(snapshot, [
      {
        id: 'event-1',
        at: '2009-Q1',
        type: 'FACTORY_STAGE_CHANGED',
        entityId: 'display-industrial-base',
        stage: 'operating',
        progress: 100,
      },
    ])

    expect(result.projects[0].stage).toBe('operating')
    expect(result.projects[0].progress).toBe(100)
    expect(result.projects[1]).toEqual(snapshot.projects[1])
  })

  it('maps district events into city and matching project feedback', () => {
    const snapshot = createDemoSnapshot()
    const result = applyMapEvents(snapshot, [
      {
        id: 'event-2',
        at: '2009-Q1',
        type: 'LOGISTICS_FLOW_CHANGED',
        districtId: 'xinzhan',
        value: 76,
      },
    ])

    expect(result.city.logisticsIndex).toBe(76)
    expect(result.projects.find((project) => project.districtId === 'xinzhan')?.logistics).toBe(76)
    expect(result.projects.find((project) => project.districtId === 'jingkai')?.logistics).not.toBe(76)
  })
})
