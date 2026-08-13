import type { MapProjectVisualState, MapSnapshot, ProjectStage } from '../../contracts/src'
import { ARCHETYPE_RECIPES, type MapAssetId } from './assetCatalog'
import { HEFEI_PARCEL_SLOTS, PARCEL_LOCAL_ANCHORS, type ParcelSlot } from './hefeiLayout'

export type ConstructionState = 'site' | 'frame' | 'shell' | 'complete'

export interface SceneBuilding {
  assetId: MapAssetId
  anchor: 'main' | 'support' | 'warehouse' | 'utility'
}

export interface MapParcelScene {
  id: string
  slot: ParcelSlot
  project: MapProjectVisualState
  constructionState: ConstructionState
  buildings: SceneBuilding[]
  commutePath: Array<[number, number]>
  logisticsPath: Array<[number, number]>
  residentActors: number
  inactive: boolean
}

export interface SceneTransition {
  projectId: string
  revision: number
  fromStage: ProjectStage
  toStage: ProjectStage
  builtDelta: number
  employmentDelta: number
  logisticsDelta: number
  eventActors: number
  direction: 'arrive' | 'depart' | 'none'
  durationMs: number
}

export interface MapScene {
  parcels: MapParcelScene[]
  buildings: Array<SceneBuilding & { projectId: string }>
  constructionStates: Record<string, ConstructionState>
  commutePaths: Record<string, Array<[number, number]>>
  logisticsPaths: Record<string, Array<[number, number]>>
  residentActors: number
  transitionQueue: SceneTransition[]
}

export const constructionStateFor = (builtProgress: number): ConstructionState => {
  if (builtProgress < 20) return 'site'
  if (builtProgress < 65) return 'frame'
  if (builtProgress < 90) return 'shell'
  return 'complete'
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const MAX_RESIDENT_ACTORS = 24

function applyResidentBudget(parcels: MapParcelScene[]): MapParcelScene[] {
  const desiredTotal = parcels.reduce((sum, parcel) => sum + parcel.residentActors, 0)
  if (desiredTotal <= MAX_RESIDENT_ACTORS) return parcels

  const allocations = new Map(parcels.map((parcel) => [parcel.id, parcel.residentActors > 0 ? 1 : 0]))
  let remaining = MAX_RESIDENT_ACTORS - [...allocations.values()].reduce((sum, value) => sum + value, 0)
  while (remaining > 0) {
    const candidate = [...parcels]
      .filter((parcel) => (allocations.get(parcel.id) ?? 0) < parcel.residentActors)
      .sort((a, b) => {
        const aGap = a.residentActors - (allocations.get(a.id) ?? 0)
        const bGap = b.residentActors - (allocations.get(b.id) ?? 0)
        return bGap - aGap || b.project.employment - a.project.employment || a.id.localeCompare(b.id)
      })[0]
    if (!candidate) break
    allocations.set(candidate.id, (allocations.get(candidate.id) ?? 0) + 1)
    remaining -= 1
  }
  return parcels.map((parcel) => ({ ...parcel, residentActors: allocations.get(parcel.id) ?? 0 }))
}

function assignStableSlots(projects: MapProjectVisualState[]) {
  const available = [...HEFEI_PARCEL_SLOTS]
  const assignments = new Map<string, ParcelSlot>()
  for (const project of [...projects].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 9)) {
    available.sort((a, b) => {
      const da = (a.position.x - project.position.x) ** 2 + (a.position.y - project.position.y) ** 2
      const db = (b.position.x - project.position.x) ** 2 + (b.position.y - project.position.y) ** 2
      return da - db || a.id.localeCompare(b.id)
    })
    assignments.set(project.id, available.shift()!)
  }
  return assignments
}

function buildingsFor(project: MapProjectVisualState): SceneBuilding[] {
  if (constructionStateFor(project.builtProgress) !== 'complete') return []
  const anchors: SceneBuilding['anchor'][] = ['main', 'support', 'warehouse', 'utility']
  return ARCHETYPE_RECIPES[project.archetype].map((assetId, index) => ({ assetId, anchor: anchors[index] }))
}

function createTransitions(snapshot: MapSnapshot, previous?: MapSnapshot): SceneTransition[] {
  if (!previous || snapshot.revision <= previous.revision) return []
  const previousById = new Map(previous.projects.map((project) => [project.id, project]))
  return snapshot.projects
    .map((project) => {
      const before = previousById.get(project.id)
      const builtDelta = before ? Math.max(0, project.builtProgress - before.builtProgress) : 0
      const employmentDelta = project.delta.employment
      const logisticsDelta = project.delta.logistics
      if (!before || (builtDelta === 0 && employmentDelta === 0 && logisticsDelta === 0 && before.stage === project.stage)) return null
      return {
        projectId: project.id,
        revision: snapshot.revision,
        fromStage: before.stage,
        toStage: project.stage,
        builtDelta,
        employmentDelta,
        logisticsDelta,
        eventActors: employmentDelta === 0 ? 0 : clamp(Math.ceil(Math.abs(employmentDelta) / 3), 1, 6),
        direction: employmentDelta > 0 ? 'arrive' as const : employmentDelta < 0 ? 'depart' as const : 'none' as const,
        durationMs: 3600,
      }
    })
    .filter((transition): transition is SceneTransition => transition !== null)
    .sort((a, b) => b.builtDelta - a.builtDelta || a.projectId.localeCompare(b.projectId))
    .slice(0, 3)
}

export function deriveMapScene(snapshot: MapSnapshot, previousSnapshot?: MapSnapshot): MapScene {
  const projects = snapshot.projects.slice(0, 9)
  const slots = assignStableSlots(projects)
  const parcels = applyResidentBudget(projects.map((project): MapParcelScene => {
    const constructionState = constructionStateFor(project.builtProgress)
    const destination = constructionState === 'site' || constructionState === 'frame'
      ? PARCEL_LOCAL_ANCHORS.siteGate
      : PARCEL_LOCAL_ANCHORS.buildingEntrance
    const residentActors = project.lifecycle === 'exited'
      ? 0
      : project.lifecycle === 'stalled'
        ? Math.min(2, Math.round(project.employment / 10))
        : clamp(Math.round(project.employment / 10), 0, 8)
    return {
      id: project.id,
      slot: slots.get(project.id)!,
      project,
      constructionState,
      buildings: buildingsFor(project),
      commutePath: [
        [...PARCEL_LOCAL_ANCHORS.transitEntry] as [number, number],
        [...PARCEL_LOCAL_ANCHORS.siteGate] as [number, number],
        [...destination] as [number, number],
      ],
      logisticsPath: [
        [-1.1, 0.95],
        [...PARCEL_LOCAL_ANCHORS.siteGate] as [number, number],
        [...PARCEL_LOCAL_ANCHORS.warehouse] as [number, number],
      ],
      residentActors,
      inactive: project.lifecycle !== 'active',
    }
  }))
  return {
    parcels,
    buildings: parcels.flatMap((parcel) => parcel.buildings.map((building) => ({ ...building, projectId: parcel.id }))),
    constructionStates: Object.fromEntries(parcels.map((parcel) => [parcel.id, parcel.constructionState])),
    commutePaths: Object.fromEntries(parcels.map((parcel) => [parcel.id, parcel.commutePath])),
    logisticsPaths: Object.fromEntries(parcels.map((parcel) => [parcel.id, parcel.logisticsPath])),
    residentActors: parcels.reduce((sum, parcel) => sum + parcel.residentActors, 0),
    transitionQueue: createTransitions(snapshot, previousSnapshot),
  }
}
