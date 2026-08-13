import type {
  PhysicalAssetLedger,
  PhysicalAssetRole,
  PhysicalAssetState,
} from './types';

const MAX_SLOTS = 4;
const MAX_LEVEL = 3;
const MAX_UNITS = MAX_SLOTS * MAX_LEVEL;

const roles: PhysicalAssetRole[] = ['main', 'support', 'warehouse', 'utility'];

export function createPhysicalAssetLedger(developmentUnitCost: number): PhysicalAssetLedger {
  return {
    developmentUnitCost,
    qualifiedCapital: 0,
    capitalRemainder: 0,
    overflowUnits: 0,
    constructionDelta: 0,
    processedDecisionIds: [],
    assets: [],
  };
}

function buildTargets(unitCount: number, stageCode: string, decisionId: string, previous: PhysicalAssetState[]) {
  const targetUnits = Math.min(MAX_UNITS, unitCount);
  const assets: PhysicalAssetState[] = Array.from({ length: Math.min(MAX_SLOTS, targetUnits) }, (_, slotIndex) => {
    const old = previous.find((asset) => asset.slotIndex === slotIndex);
    const targetLevel = Math.min(MAX_LEVEL, Math.ceil((targetUnits - slotIndex) / MAX_SLOTS));
    return old
      ? { ...old, targetLevel: Math.max(old.targetLevel, targetLevel) }
      : {
          id: `asset-${slotIndex + 1}`,
          role: roles[slotIndex],
          slotIndex,
          currentLevel: 0,
          targetLevel,
          workProgress: 0,
          status: 'planned' as const,
          createdStage: stageCode,
          decisionId,
        };
  });
  return assets;
}

export function confirmQualifiedInvestment(
  ledger: PhysicalAssetLedger,
  amount: number,
  decisionId: string,
  stageCode: string,
): PhysicalAssetLedger {
  if (amount <= 0 || ledger.processedDecisionIds.includes(decisionId)) return ledger;
  const qualifiedCapital = ledger.qualifiedCapital + amount;
  const unitCount = Math.floor(qualifiedCapital / ledger.developmentUnitCost);
  return {
    ...ledger,
    qualifiedCapital,
    capitalRemainder: qualifiedCapital % ledger.developmentUnitCost,
    overflowUnits: Math.max(0, unitCount - MAX_UNITS),
    processedDecisionIds: [...ledger.processedDecisionIds, decisionId],
    assets: buildTargets(unitCount, stageCode, decisionId, ledger.assets),
  };
}

function nextConstructionTarget(assets: PhysicalAssetState[]) {
  return assets
    .filter((asset) => asset.status !== 'abandoned' && (asset.currentLevel < asset.targetLevel || asset.workProgress > 0))
    .sort((a, b) => {
      const aLevel = a.currentLevel + 1;
      const bLevel = b.currentLevel + 1;
      return aLevel - bLevel || a.slotIndex - b.slotIndex;
    })[0];
}

export function applyConstruction(
  ledger: PhysicalAssetLedger,
  requestedDelta: number,
  lifecycle: 'active' | 'stalled' | 'exited',
): PhysicalAssetLedger {
  const constructionDelta = Math.max(0, Math.round(requestedDelta));
  let assets = ledger.assets.map((asset) => ({ ...asset }));

  if (lifecycle === 'exited') {
    return { ...ledger, constructionDelta: 0, assets: assets.map((asset) => ({ ...asset, status: 'abandoned' })) };
  }
  if (lifecycle === 'stalled') {
    return {
      ...ledger,
      constructionDelta: 0,
      assets: assets.map((asset) => asset.status === 'complete' ? asset : { ...asset, status: 'paused' }),
    };
  }

  assets = assets.map((asset) => asset.status === 'paused'
    ? { ...asset, status: asset.currentLevel === asset.targetLevel ? 'complete' : asset.currentLevel > 0 || asset.workProgress > 0 ? 'building' : 'planned' }
    : asset);
  let remaining = constructionDelta;
  while (remaining > 0) {
    const target = nextConstructionTarget(assets);
    if (!target) break;
    const required = 100 - target.workProgress;
    const applied = Math.min(required, remaining);
    target.workProgress += applied;
    remaining -= applied;
    if (target.workProgress >= 100) {
      target.currentLevel += 1;
      target.workProgress = 0;
    }
    target.status = target.currentLevel >= target.targetLevel ? 'complete' : 'building';
  }
  return { ...ledger, constructionDelta: constructionDelta - remaining, assets };
}

export function physicalCompletion(ledger: PhysicalAssetLedger) {
  if (!ledger.assets.length) return 0;
  const completed = ledger.assets.reduce((sum, asset) => sum + asset.currentLevel * 100 + asset.workProgress, 0);
  const target = ledger.assets.reduce((sum, asset) => sum + asset.targetLevel * 100, 0);
  return target > 0 ? Math.round((completed / target) * 100) : 0;
}
