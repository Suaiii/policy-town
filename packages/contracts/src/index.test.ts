import { describe, expect, it } from 'vitest'
import {
  MAP_CONTRACT_VERSION,
  isGlobalToMapMessage,
  isMapSnapshot,
  isMapToGlobalMessage,
  type MapSnapshot,
} from './index'

const createSnapshot = (): MapSnapshot => ({
  schemaVersion: MAP_CONTRACT_VERSION,
  simulationId: 'contract-test',
  simulationDate: '2008 · Q4',
  revision: 1,
  city: { employmentIndex: 50, logisticsIndex: 31, gridPressure: 34, fiscalPressure: 55 },
  projects: [
    {
      id: 'factory-1',
      name: '测试工厂',
      industry: '新型显示',
      districtId: 'xinzhan',
      stage: 'construction',
      archetype: 'heavy-manufacturing',
      lifecycle: 'active',
      progress: 46,
      builtProgress: 46,
      employment: 38,
      logistics: 31,
      risk: 42,
      delta: { progress: 18, employment: 12, logistics: 8 },
      position: { x: 0.58, y: 0.36 },
    },
  ],
})

describe('map contract guards', () => {
  it('accepts a versioned map snapshot message', () => {
    const snapshot = createSnapshot()

    expect(isMapSnapshot(snapshot)).toBe(true)
    expect(isGlobalToMapMessage({ type: 'MAP_SNAPSHOT', payload: snapshot })).toBe(true)
  })

  it('rejects incompatible versions and invalid stages', () => {
    const snapshot = createSnapshot()

    expect(isMapSnapshot({ ...snapshot, schemaVersion: '1.0' })).toBe(false)
    expect(
      isMapSnapshot({
        ...snapshot,
        projects: [{ ...snapshot.projects[0], stage: 'imaginary-stage' }],
      }),
    ).toBe(false)
  })

  it('rejects out-of-range visual values and duplicate project ids', () => {
    const snapshot = createSnapshot()

    expect(
      isMapSnapshot({
        ...snapshot,
        projects: [{ ...snapshot.projects[0], progress: 140 }],
      }),
    ).toBe(false)
    expect(
      isMapSnapshot({
        ...snapshot,
        projects: [{ ...snapshot.projects[0], position: { x: -0.2, y: 0.4 } }],
      }),
    ).toBe(false)
    expect(
      isMapSnapshot({
        ...snapshot,
        projects: [snapshot.projects[0], { ...snapshot.projects[0] }],
      }),
    ).toBe(false)
  })

  it('accepts snapshots as the only authoritative global-to-map message', () => {
    expect(
      isGlobalToMapMessage({
        type: 'MAP_EVENTS',
        payload: [
          {
            id: 'event-1',
            at: '2008-Q4',
            type: 'FACTORY_STAGE_CHANGED',
            entityId: 'factory-1',
            stage: 'ramp',
            progress: 74,
          },
        ],
      }),
    ).toBe(false)
    expect(
      isGlobalToMapMessage({
        type: 'MAP_EVENTS',
        payload: [{ type: 'DELETE_EVERYTHING' }],
      }),
    ).toBe(false)
  })

  it('requires physical state, lifecycle, archetype, revision and settlement delta', () => {
    const snapshot = createSnapshot()
    expect(isMapSnapshot({ ...snapshot, revision: -1 })).toBe(false)
    expect(isMapSnapshot({ ...snapshot, projects: [{ ...snapshot.projects[0], builtProgress: 101 }] })).toBe(false)
    expect(isMapSnapshot({ ...snapshot, projects: [{ ...snapshot.projects[0], lifecycle: 'forgotten' }] })).toBe(false)
    expect(isMapSnapshot({ ...snapshot, projects: [{ ...snapshot.projects[0], delta: undefined }] })).toBe(false)
    expect(isMapSnapshot({
      ...snapshot,
      projects: Array.from({ length: 9 }, (_, index) => ({ ...snapshot.projects[0], id: `factory-${index}` })),
    })).toBe(true)
    expect(isMapSnapshot({
      ...snapshot,
      projects: Array.from({ length: 10 }, (_, index) => ({ ...snapshot.projects[0], id: `factory-${index}` })),
    })).toBe(false)
  })

  it('only accepts known map intents', () => {
    expect(isMapToGlobalMessage({ type: 'MAP_ENTITY_SELECTED', payload: { entityId: 'factory-1' } })).toBe(
      true,
    )
    expect(isMapToGlobalMessage({ type: 'DELETE_PROJECT', payload: { entityId: 'factory-1' } })).toBe(false)
  })
})
