export const MAP_CONTRACT_VERSION = '3.0' as const

export type ProjectArchetype =
  | 'heavy-manufacturing'
  | 'energy-manufacturing'
  | 'rd-pilot'

export type ProjectLifecycle = 'active' | 'stalled' | 'exited'

export type PhysicalAssetStatus = 'planned' | 'building' | 'complete' | 'paused' | 'abandoned'

export type PhysicalAssetRole = 'main' | 'support' | 'warehouse' | 'utility'

export interface PhysicalAssetVisualState {
  id: string
  role: PhysicalAssetRole
  slotIndex: number
  currentLevel: number
  targetLevel: number
  workProgress: number
  status: PhysicalAssetStatus
  createdStage: string
  decisionId: string
}

export interface PhysicalAssetLedgerVisualState {
  developmentUnitCost: number
  qualifiedCapital: number
  capitalRemainder: number
  overflowUnits: number
  constructionDelta: number
  assets: PhysicalAssetVisualState[]
}

export type ProjectStage =
  | 'proposal'
  | 'construction'
  | 'ramp'
  | 'operating'
  | 'stalled'
  | 'exited'

export interface NormalizedPosition {
  x: number
  y: number
}

export interface MapProjectVisualState {
  id: string
  name: string
  industry: string
  districtId: string
  stage: ProjectStage
  archetype: ProjectArchetype
  lifecycle: ProjectLifecycle
  progress: number
  builtProgress: number
  physicalAssets: PhysicalAssetLedgerVisualState
  employment: number
  logistics: number
  risk: number
  delta: {
    progress: number
    employment: number
    logistics: number
  }
  position: NormalizedPosition
}

export interface MapCityState {
  employmentIndex: number
  logisticsIndex: number
  gridPressure: number
  fiscalPressure: number
}

export interface MapSnapshot {
  schemaVersion: typeof MAP_CONTRACT_VERSION
  simulationId: string
  simulationDate: string
  revision: number
  city: MapCityState
  projects: MapProjectVisualState[]
}

export type MapVisualEvent =
  | {
      id: string
      at: string
      type: 'FACTORY_STAGE_CHANGED'
      entityId: string
      stage: ProjectStage
      progress: number
    }
  | {
      id: string
      at: string
      type: 'CROWD_DENSITY_CHANGED'
      districtId: string
      value: number
    }
  | {
      id: string
      at: string
      type: 'LOGISTICS_FLOW_CHANGED'
      districtId: string
      value: number
    }
  | {
      id: string
      at: string
      type: 'UTILITY_PRESSURE_CHANGED'
      districtId: string
      value: number
    }

export type GlobalToMapMessage = { type: 'MAP_SNAPSHOT'; payload: MapSnapshot }

export type MapToGlobalMessage =
  | { type: 'MAP_READY'; payload: { schemaVersion: typeof MAP_CONTRACT_VERSION } }
  | { type: 'MAP_ENTITY_SELECTED'; payload: { entityId: string } }

const projectStages = new Set<ProjectStage>([
  'proposal',
  'construction',
  'ramp',
  'operating',
  'stalled',
  'exited',
])

const projectArchetypes = new Set<ProjectArchetype>([
  'heavy-manufacturing',
  'energy-manufacturing',
  'rd-pilot',
])

const projectLifecycles = new Set<ProjectLifecycle>(['active', 'stalled', 'exited'])
const physicalAssetStatuses = new Set<PhysicalAssetStatus>(['planned', 'building', 'complete', 'paused', 'abandoned'])
const physicalAssetRoles = new Set<PhysicalAssetRole>(['main', 'support', 'warehouse', 'utility'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isPercentage = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= 100

const isNormalizedCoordinate = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= 1

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

export function isMapSnapshot(value: unknown): value is MapSnapshot {
  if (!isRecord(value) || value.schemaVersion !== MAP_CONTRACT_VERSION) return false
  if (!isNonEmptyString(value.simulationId) || !isNonEmptyString(value.simulationDate)) return false
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) return false
  if (!isRecord(value.city) || !Array.isArray(value.projects) || value.projects.length > 9) return false

  const city = value.city
  if (
    !isPercentage(city.employmentIndex) ||
    !isPercentage(city.logisticsIndex) ||
    !isPercentage(city.gridPressure) ||
    !isPercentage(city.fiscalPressure)
  ) {
    return false
  }

  const ids = new Set<string>()
  return value.projects.every((project) => {
    if (!isRecord(project) || !isRecord(project.position) || !isRecord(project.delta) || !isRecord(project.physicalAssets)) return false
    if (!isNonEmptyString(project.id) || ids.has(project.id)) return false
    ids.add(project.id)
    const ledger = project.physicalAssets
    if (
      !isFiniteNumber(ledger.developmentUnitCost) || ledger.developmentUnitCost <= 0 ||
      !isFiniteNumber(ledger.qualifiedCapital) || ledger.qualifiedCapital < 0 ||
      !isFiniteNumber(ledger.capitalRemainder) || ledger.capitalRemainder < 0 ||
      !Number.isInteger(ledger.overflowUnits) || (ledger.overflowUnits as number) < 0 ||
      !isFiniteNumber(ledger.constructionDelta) || ledger.constructionDelta < 0 ||
      !Array.isArray(ledger.assets) || ledger.assets.length > 4
    ) return false

    const assetIds = new Set<string>()
    const assetsValid = ledger.assets.every((asset) => {
      if (!isRecord(asset) || !isNonEmptyString(asset.id) || assetIds.has(asset.id)) return false
      assetIds.add(asset.id)
      return (
        typeof asset.role === 'string' && physicalAssetRoles.has(asset.role as PhysicalAssetRole) &&
        Number.isInteger(asset.slotIndex) && (asset.slotIndex as number) >= 0 && (asset.slotIndex as number) < 4 &&
        Number.isInteger(asset.currentLevel) && (asset.currentLevel as number) >= 0 && (asset.currentLevel as number) <= 3 &&
        Number.isInteger(asset.targetLevel) && (asset.targetLevel as number) >= 1 && (asset.targetLevel as number) <= 3 &&
        (asset.currentLevel as number) <= (asset.targetLevel as number) &&
        isPercentage(asset.workProgress) &&
        typeof asset.status === 'string' && physicalAssetStatuses.has(asset.status as PhysicalAssetStatus) &&
        isNonEmptyString(asset.createdStage) && isNonEmptyString(asset.decisionId)
      )
    })
    if (!assetsValid || new Set(ledger.assets.map((asset) => (asset as Record<string, unknown>).slotIndex)).size !== ledger.assets.length) return false

    return (
      isNonEmptyString(project.name) &&
      isNonEmptyString(project.industry) &&
      isNonEmptyString(project.districtId) &&
      typeof project.stage === 'string' &&
      projectStages.has(project.stage as ProjectStage) &&
      typeof project.archetype === 'string' &&
      projectArchetypes.has(project.archetype as ProjectArchetype) &&
      typeof project.lifecycle === 'string' &&
      projectLifecycles.has(project.lifecycle as ProjectLifecycle) &&
      isPercentage(project.progress) &&
      isPercentage(project.builtProgress) &&
      isPercentage(project.employment) &&
      isPercentage(project.logistics) &&
      isPercentage(project.risk) &&
      isFiniteNumber(project.delta.progress) &&
      isFiniteNumber(project.delta.employment) &&
      isFiniteNumber(project.delta.logistics) &&
      isNormalizedCoordinate(project.position.x) &&
      isNormalizedCoordinate(project.position.y)
    )
  })
}

export function isMapVisualEvent(value: unknown): value is MapVisualEvent {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.at)) return false
  if (!isNonEmptyString(value.type)) return false

  if (value.type === 'FACTORY_STAGE_CHANGED') {
    return (
      isNonEmptyString(value.entityId) &&
      typeof value.stage === 'string' &&
      projectStages.has(value.stage as ProjectStage) &&
      isPercentage(value.progress)
    )
  }

  if (
    value.type === 'CROWD_DENSITY_CHANGED' ||
    value.type === 'LOGISTICS_FLOW_CHANGED' ||
    value.type === 'UTILITY_PRESSURE_CHANGED'
  ) {
    return isNonEmptyString(value.districtId) && isPercentage(value.value)
  }

  return false
}

export function isGlobalToMapMessage(value: unknown): value is GlobalToMapMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  return value.type === 'MAP_SNAPSHOT' && isMapSnapshot(value.payload)
}

export function isMapToGlobalMessage(value: unknown): value is MapToGlobalMessage {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.payload)) return false

  if (value.type === 'MAP_READY') {
    return value.payload.schemaVersion === MAP_CONTRACT_VERSION
  }

  return value.type === 'MAP_ENTITY_SELECTED' && typeof value.payload.entityId === 'string'
}
