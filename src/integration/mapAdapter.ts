import {
  MAP_CONTRACT_VERSION,
  type MapSnapshot,
  type ProjectArchetype,
  type ProjectStage,
} from '../../packages/contracts/src';
import { getEnterprise, stages } from '../game/scenario';
import type { EnterpriseState, SimulationState } from '../game/types';

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function resolveStage(enterprise: EnterpriseState): ProjectStage {
  if (enterprise.lifecycle === 'exited') return 'exited';
  if (enterprise.lifecycle === 'stalled') return 'stalled';
  if (enterprise.builtProgress < 20) return 'proposal';
  if (enterprise.builtProgress < 65) return 'construction';
  if (enterprise.builtProgress < 90) return 'ramp';
  return 'operating';
}

export const ENTERPRISE_ARCHETYPES: Record<EnterpriseState['id'], ProjectArchetype> = {
  'enterprise-a': 'heavy-manufacturing',
  'enterprise-b': 'energy-manufacturing',
  'enterprise-c': 'rd-pilot',
};

export function simulationToMapSnapshot(state: SimulationState): MapSnapshot {
  const enterpriseCount = Math.max(1, state.enterprises.length);
  const averageEmployment = state.enterprises.reduce((sum, item) => sum + item.metrics.employment, 0) / enterpriseCount;
  const averageProgress = state.enterprises.reduce((sum, item) => sum + item.metrics.progress, 0) / enterpriseCount;

  return {
    schemaVersion: MAP_CONTRACT_VERSION,
    simulationId: 'hefei-industrial-competition-mvp',
    simulationDate: stages[state.stageIndex]?.date ?? stages.at(-1)?.date ?? '2009 · Q2',
    revision: state.settlementRevision,
    city: {
      employmentIndex: clamp(20 + averageEmployment * 0.8),
      logisticsIndex: clamp(averageProgress * 0.65 + state.resources.supplyChain * 0.35),
      gridPressure: clamp(100 - state.resources.infrastructure),
      fiscalPressure: clamp(100 - state.resources.fiscal),
    },
    projects: state.enterprises.map((enterprise) => {
      const profile = getEnterprise(enterprise.id);
      return {
        id: enterprise.id,
        name: `${enterprise.code}号匿名项目`,
        industry: profile.industry,
        districtId: profile.districtId,
        stage: resolveStage(enterprise),
        archetype: ENTERPRISE_ARCHETYPES[enterprise.id],
        lifecycle: enterprise.lifecycle,
        progress: clamp(enterprise.metrics.progress),
        builtProgress: clamp(enterprise.builtProgress),
        physicalAssets: {
          developmentUnitCost: enterprise.physicalAssets.developmentUnitCost,
          qualifiedCapital: enterprise.physicalAssets.qualifiedCapital,
          capitalRemainder: enterprise.physicalAssets.capitalRemainder,
          overflowUnits: enterprise.physicalAssets.overflowUnits,
          constructionDelta: enterprise.physicalAssets.constructionDelta,
          assets: enterprise.physicalAssets.assets.map((asset) => ({ ...asset })),
        },
        employment: clamp(enterprise.metrics.employment),
        logistics: clamp(enterprise.metrics.capacity * 0.6 + enterprise.metrics.orders * 0.4),
        risk: clamp(enterprise.metrics.risk),
        delta: enterprise.lastSettlementDelta,
        position: profile.position,
      };
    }),
  };
}
