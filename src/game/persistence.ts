import { FIXED_ROUND_ENTERPRISE_IDS, initialState } from './simulation';
import { enterpriseSeatIndex, sortEnterpriseIdsBySeat } from './representatives';
import type {
  CameraMode,
  EnterpriseId,
  EnterpriseState,
  Phase,
  PhysicalAssetLedger,
  SimulationState,
} from './types';

const phases: Phase[] = ['setup', 'briefing', 'applications', 'analysis', 'allocation', 'response', 'settlement', 'feedback', 'result'];
const cameraModes: CameraMode[] = ['table', 'meeting', 'panorama'];
const enterpriseIds: EnterpriseId[] = ['enterprise-a', 'enterprise-b', 'enterprise-c'];

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function isPhysicalAssetLedger(value: unknown): value is PhysicalAssetLedger {
  if (!isObject(value)) return false;
  const roles = ['main', 'support', 'warehouse', 'utility'];
  const statuses = ['planned', 'building', 'complete', 'paused', 'abandoned'];
  return isFiniteNumber(value.developmentUnitCost)
    && value.developmentUnitCost > 0
    && isFiniteNumber(value.qualifiedCapital)
    && isFiniteNumber(value.capitalRemainder)
    && isFiniteNumber(value.overflowUnits)
    && isFiniteNumber(value.constructionDelta)
    && Array.isArray(value.processedDecisionIds)
    && value.processedDecisionIds.every((id) => typeof id === 'string')
    && Array.isArray(value.assets)
    && value.assets.every((asset) => isObject(asset)
      && typeof asset.id === 'string'
      && roles.includes(asset.role as string)
      && statuses.includes(asset.status as string)
      && isFiniteNumber(asset.slotIndex)
      && asset.slotIndex >= 0 && asset.slotIndex <= 3
      && isFiniteNumber(asset.currentLevel)
      && asset.currentLevel >= 0 && asset.currentLevel <= 3
      && isFiniteNumber(asset.targetLevel)
      && asset.targetLevel >= 1 && asset.targetLevel <= 3
      && asset.targetLevel >= asset.currentLevel
      && isFiniteNumber(asset.workProgress)
      && asset.workProgress >= 0 && asset.workProgress <= 100
      && typeof asset.createdStage === 'string'
      && typeof asset.decisionId === 'string');
}

function restoreEnterprise(value: unknown): EnterpriseState | null {
  if (!isObject(value) || !enterpriseIds.includes(value.id as EnterpriseId)) return null;
  const base = initialState.enterprises.find((enterprise) => enterprise.id === value.id);
  if (!base) return null;
  const savedMetrics = isObject(value.metrics) ? value.metrics : null;
  const savedDelta = isObject(value.lastSettlementDelta) ? value.lastSettlementDelta : null;
  const metrics = savedMetrics
    ? Object.fromEntries(Object.entries(base.metrics).map(([key, fallback]) => [key, isFiniteNumber(savedMetrics[key]) ? savedMetrics[key] : fallback]))
    : base.metrics;
  const lastSettlementDelta = savedDelta
    ? Object.fromEntries(Object.entries(base.lastSettlementDelta).map(([key, fallback]) => [key, isFiniteNumber(savedDelta[key]) ? savedDelta[key] : fallback]))
    : base.lastSettlementDelta;

  return {
    ...base,
    ...value,
    id: base.id,
    code: typeof value.code === 'string' ? value.code : base.code,
    allocation: isFiniteNumber(value.allocation) ? value.allocation : base.allocation,
    supportTools: Array.isArray(value.supportTools) ? value.supportTools as EnterpriseState['supportTools'] : base.supportTools,
    conditions: Array.isArray(value.conditions) ? value.conditions.filter((item): item is string => typeof item === 'string') : [],
    negotiationFinalized: value.negotiationFinalized === true,
    metrics: metrics as EnterpriseState['metrics'],
    builtProgress: isFiniteNumber(value.builtProgress) ? value.builtProgress : base.builtProgress,
    lifecycle: value.lifecycle === 'stalled' || value.lifecycle === 'exited' ? value.lifecycle : 'active',
    physicalAssets: isPhysicalAssetLedger(value.physicalAssets)
      ? { ...value.physicalAssets, developmentUnitCost: base.physicalAssets.developmentUnitCost }
      : structuredClone(base.physicalAssets),
    lastSettlementDelta: lastSettlementDelta as EnterpriseState['lastSettlementDelta'],
  };
}

/** Restores both legacy v1 saves and current saves without letting partial data crash map derivation. */
export function restoreSimulationState(raw: string | null): SimulationState {
  if (!raw) return structuredClone(initialState);
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) return structuredClone(initialState);
    const restoredEnterprises = Array.isArray(value.enterprises)
      ? value.enterprises.map(restoreEnterprise).filter((enterprise): enterprise is EnterpriseState => enterprise !== null)
      : [];
    const uniqueEnterprises = restoredEnterprises.filter((enterprise, index, list) => list.findIndex((item) => item.id === enterprise.id) === index);
    const selectedEnterprises = (uniqueEnterprises.length >= 2 ? uniqueEnterprises : structuredClone(initialState.enterprises))
      .sort((left, right) => enterpriseSeatIndex(left.id) - enterpriseSeatIndex(right.id));
    const stageIndex = isFiniteNumber(value.stageIndex) && value.stageIndex >= 0 && value.stageIndex <= 3 ? Math.trunc(value.stageIndex) : 0;
    const selectedEnterpriseId = selectedEnterprises.some((enterprise) => enterprise.id === value.selectedEnterpriseId)
      ? value.selectedEnterpriseId as EnterpriseId
      : selectedEnterprises[0].id;
    return {
      ...structuredClone(initialState),
      ...value,
      schemaVersion: 2,
      runId: typeof value.runId === 'string' ? value.runId : initialState.runId,
      setupRandomSeed: isFiniteNumber(value.setupRandomSeed) ? value.setupRandomSeed >>> 0 : 0,
      phase: phases.includes(value.phase as Phase) ? value.phase as Phase : 'setup',
      cameraMode: cameraModes.includes(value.cameraMode as CameraMode) ? value.cameraMode as CameraMode : 'table',
      stageIndex,
      setupStartStage: isFiniteNumber(value.setupStartStage) ? Math.max(0, Math.min(3, Math.trunc(value.setupStartStage))) : stageIndex,
      setupEnterpriseIds: [...FIXED_ROUND_ENTERPRISE_IDS],
      selectedEnterpriseId,
      enterprises: selectedEnterprises,
      resources: isObject(value.resources) ? { ...initialState.resources, ...value.resources } : structuredClone(initialState.resources),
      roundFiscalStart: isFiniteNumber(value.roundFiscalStart) ? value.roundFiscalStart : initialState.roundFiscalStart,
      settlementRevision: isFiniteNumber(value.settlementRevision) ? value.settlementRevision : 0,
      facts: Array.isArray(value.facts) ? value.facts as SimulationState['facts'] : [],
      judgments: Array.isArray(value.judgments) ? value.judgments as SimulationState['judgments'] : [],
      commitments: Array.isArray(value.commitments) ? value.commitments as SimulationState['commitments'] : [],
      stageSnapshots: Array.isArray(value.stageSnapshots) ? value.stageSnapshots as SimulationState['stageSnapshots'] : [],
    };
  } catch {
    return structuredClone(initialState);
  }
}

/**
 * A meeting camera needs a live deliberation payload, which is intentionally
 * not kept in local storage.  Resume on an actionable screen instead.
 */
export function restoreInteractiveSimulationState(raw: string | null): SimulationState {
  const restored = restoreSimulationState(raw);
  if (restored.cameraMode !== 'meeting') return restored;
  return { ...restored, phase: 'applications', cameraMode: 'table' };
}
