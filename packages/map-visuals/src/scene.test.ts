import { describe, expect, it } from 'vitest'
import type { MapSnapshot } from '../../contracts/src'
import { createDemoSnapshot } from '../../../src/map/tableDemoState'
import { constructionStateFor, deriveMapScene } from './scene'

describe('deriveMapScene', () => {
  it('uses physical progress for four truthful construction phases', () => {
    expect(constructionStateFor(8)).toBe('site')
    expect(constructionStateFor(30)).toBe('frame')
    expect(constructionStateFor(78)).toBe('shell')
    expect(constructionStateFor(90)).toBe('complete')
  })

  it('produces deterministic non-overlapping slots for the same snapshot', () => {
    const base = createDemoSnapshot()
    const source = base.projects[0]
    const snapshot: MapSnapshot = {
      ...base,
      projects: Array.from({ length: 9 }, (_, index) => ({
        ...source,
        id: `anonymous-project-${index + 1}`,
        position: { x: 0.14 + (index % 3) * 0.27, y: 0.2 + Math.floor(index / 3) * 0.28 },
      })),
    }
    const first = deriveMapScene(snapshot)
    const second = deriveMapScene({ ...snapshot, projects: [...snapshot.projects].reverse() })
    const positions = (scene: ReturnType<typeof deriveMapScene>) => Object.fromEntries(scene.parcels.map((parcel) => [parcel.id, parcel.slot.id]))
    expect(positions(first)).toEqual(positions(second))
    expect(new Set(first.parcels.map((parcel) => parcel.slot.id)).size).toBe(first.parcels.length)
    expect(first.parcels).toHaveLength(9)
    expect(first.residentActors).toBeLessThanOrEqual(24)
  })

  it('does not replay transitions on cold load or the same revision', () => {
    const snapshot = createDemoSnapshot('construction', 1)
    expect(deriveMapScene(snapshot).transitionQueue).toHaveLength(0)
    expect(deriveMapScene(snapshot, snapshot).transitionQueue).toHaveLength(0)
  })

  it('keeps an unfunded zero-asset city free of premature resident actors', () => {
    const snapshot = createDemoSnapshot('proposal', 0)
    snapshot.projects = snapshot.projects.map((project) => ({
      ...project,
      physicalAssets: { ...project.physicalAssets, assets: [] },
    }))

    const scene = deriveMapScene(snapshot)
    expect(scene.residentActors).toBe(0)
    expect(scene.parcels.every((parcel) => parcel.assetScenes.length === 0)).toBe(true)
  })

  it('creates a bounded, ordered transition queue after a revision increment', () => {
    const previous = createDemoSnapshot('proposal', 0)
    const next = createDemoSnapshot('construction', 1, previous)
    next.projects[0] = {
      ...next.projects[0],
      employment: previous.projects[0].employment + 12,
      delta: { ...next.projects[0].delta, employment: 12 },
    }
    const scene = deriveMapScene(next, previous)
    expect(scene.transitionQueue[0].projectId).toBe('display-industrial-base')
    expect(scene.transitionQueue[0].eventActors).toBe(4)
    expect(scene.transitionQueue.length).toBeLessThanOrEqual(3)
  })

  it('keeps built structures for stalled and exited projects while reducing residents', () => {
    const stalled = createDemoSnapshot('stalled', 1)
    const exited: MapSnapshot = createDemoSnapshot('exited', 2)
    expect(deriveMapScene(stalled).parcels[0].constructionState).toBe('frame')
    expect(deriveMapScene(stalled).parcels[0].residentActors).toBeLessThanOrEqual(2)
    expect(deriveMapScene(exited).parcels[0].residentActors).toBe(0)
  })
})
