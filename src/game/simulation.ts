import { enterprises, stages } from './scenario';
import type {
  EnterpriseAction,
  EnterpriseId,
  EnterpriseMetrics,
  EnterpriseState,
  SimulationState,
  SupportTool,
} from './types';

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const initialEnterpriseMetrics: Record<EnterpriseId, EnterpriseMetrics> = {
  'enterprise-a': { cash: 42, debt: 46, progress: 8, technology: 62, capacity: 6, orders: 48, risk: 52, employment: 12 },
  'enterprise-b': { cash: 36, debt: 38, progress: 12, technology: 68, capacity: 4, orders: 34, risk: 61, employment: 8 },
  'enterprise-c': { cash: 28, debt: 24, progress: 18, technology: 74, capacity: 2, orders: 22, risk: 49, employment: 6 },
};

function createEnterprises(): EnterpriseState[] {
  return enterprises.map((enterprise) => ({
    id: enterprise.id,
    code: enterprise.code,
    allocation: 0,
    supportTools: [],
    metrics: { ...initialEnterpriseMetrics[enterprise.id] },
    builtProgress: initialEnterpriseMetrics[enterprise.id].progress,
    lifecycle: 'active',
    lastSettlementDelta: { progress: 0, employment: 0, logistics: 0 },
  }));
}

export const initialState: SimulationState = {
  phase: 'briefing',
  cameraMode: 'table',
  stageIndex: 0,
  selectedEnterpriseId: 'enterprise-a',
  enterprises: createEnterprises(),
  resources: {
    fiscal: 100,
    committed: 0,
    industry: 58,
    supplyChain: 52,
    talent: 61,
    infrastructure: 67,
    credibility: 78,
  },
  roundFiscalStart: 100,
  settlementRevision: 0,
};

export function enterApplications(state: SimulationState): SimulationState {
  if (state.phase !== 'briefing') return state;
  return { ...state, phase: 'applications', cameraMode: 'table' };
}

export function selectEnterprise(state: SimulationState, id: EnterpriseId): SimulationState {
  if (!state.enterprises.some((enterprise) => enterprise.id === id)) return state;
  return { ...state, selectedEnterpriseId: id };
}

export function enterEnterpriseMeeting(state: SimulationState, id: EnterpriseId): SimulationState {
  if (!state.enterprises.some((enterprise) => enterprise.id === id)) return state;
  return { ...state, selectedEnterpriseId: id, cameraMode: 'meeting' };
}

export function openAnalysis(state: SimulationState): SimulationState {
  if (state.phase !== 'applications') return state;
  return { ...state, phase: 'analysis', cameraMode: 'meeting' };
}

export function openAllocation(state: SimulationState): SimulationState {
  if (state.phase !== 'analysis') return state;
  return { ...state, phase: 'allocation', cameraMode: 'table' };
}

export function updateAllocation(state: SimulationState, id: EnterpriseId, requestedValue: number): SimulationState {
  if (state.phase !== 'allocation') return state;
  const current = state.enterprises.find((enterprise) => enterprise.id === id);
  if (!current) return state;
  const allocatedElsewhere = state.enterprises.reduce(
    (total, enterprise) => total + (enterprise.id === id ? 0 : enterprise.allocation),
    0,
  );
  const value = clamp(Math.min(requestedValue, state.roundFiscalStart - allocatedElsewhere));
  return {
    ...state,
    enterprises: state.enterprises.map((enterprise) =>
      enterprise.id === id ? { ...enterprise, allocation: value } : enterprise,
    ),
  };
}

export function toggleSupportTool(state: SimulationState, id: EnterpriseId, tool: SupportTool): SimulationState {
  if (state.phase !== 'allocation') return state;
  return {
    ...state,
    enterprises: state.enterprises.map((enterprise) => {
      if (enterprise.id !== id) return enterprise;
      const exists = enterprise.supportTools.includes(tool);
      if (!exists && enterprise.supportTools.length >= 3) return enterprise;
      return {
        ...enterprise,
        supportTools: exists
          ? enterprise.supportTools.filter((item) => item !== tool)
          : [...enterprise.supportTools, tool],
      };
    }),
  };
}

function chooseAction(enterprise: EnterpriseState): { action: EnterpriseAction; actionReason: string } {
  const request = enterprises.find((item) => item.id === enterprise.id)!.request;
  const coverage = enterprise.allocation / request;
  if (coverage >= 0.8 && enterprise.supportTools.length >= 2) {
    return { action: '扩建并研发', actionReason: '资金覆盖主要缺口，配套工具可以同时降低建设与组织风险。' };
  }
  if (coverage >= 0.45) {
    return { action: '延迟建设并融资', actionReason: '政府支持不足以全速建设，企业保留项目并寻找外部资金。' };
  }
  if (coverage > 0) {
    return { action: '小步研发并等待', actionReason: '资源只够维持核心团队与验证工作，暂不进入重资产扩张。' };
  }
  if (enterprise.metrics.cash < 32 || enterprise.metrics.risk > 58) {
    return { action: '收缩项目', actionReason: '没有获得地方支持，企业优先保护现金跑道并削减本地计划。' };
  }
  return { action: '迁往外地', actionReason: '企业仍具备行动能力，将比较其他城市的支持条件。' };
}

export function submitDecision(state: SimulationState): SimulationState {
  if (state.phase !== 'allocation') return state;
  const total = state.enterprises.reduce((sum, enterprise) => sum + enterprise.allocation, 0);
  const hasConfiguredSupport = state.enterprises.every(
    (enterprise) => enterprise.allocation === 0 || enterprise.supportTools.length > 0,
  );
  if (total <= 0 || total > state.roundFiscalStart || !hasConfiguredSupport) return state;
  return {
    ...state,
    phase: 'response',
    cameraMode: 'meeting',
    enterprises: state.enterprises.map((enterprise) => ({ ...enterprise, ...chooseAction(enterprise) })),
    resources: {
      ...state.resources,
      fiscal: clamp(state.resources.fiscal - total),
      committed: clamp(state.resources.committed + total),
    },
  };
}

export function revealEvent(state: SimulationState): SimulationState {
  if (state.phase !== 'response') return state;
  const firstRound = state.stageIndex === 0;
  return {
    ...state,
    phase: 'settlement',
    cameraMode: 'table',
    event: firstRound
      ? {
          title: stages[0].event,
          description: '面板价格与外部需求下行，银行风险偏好下降；设备采购成本出现逆周期议价窗口。',
          effects: ['融资难度上升', '短期订单承压', '重资产项目现金风险增加'],
        }
      : {
          title: stages[1].event,
          description: '产业振兴政策改善信贷与需求预期，率先完成建设和验证的企业获得窗口优势。',
          effects: ['融资环境改善', '制造需求回暖', '产业协同开始释放'],
        },
  };
}

function settleEnterprise(enterprise: EnterpriseState, stageIndex: number): EnterpriseState {
  const previousMetrics = { ...enterprise.metrics };
  const request = enterprises.find((item) => item.id === enterprise.id)!.request;
  const coverage = enterprise.allocation / request;
  const toolBonus = enterprise.supportTools.length * 2;
  const crisis = stageIndex === 0 ? 8 : -4;
  const expansion = enterprise.action === '扩建并研发';
  const waiting = enterprise.action === '小步研发并等待';
  const shrinking = enterprise.action === '收缩项目' || enterprise.action === '迁往外地';
  const progressDelta = expansion ? 18 + toolBonus : waiting ? 5 : shrinking ? -2 : 10;
  const techDelta = enterprise.supportTools.includes('talent') ? 9 : expansion ? 5 : 2;
  const orderDelta = stageIndex === 0 ? (expansion ? -3 : -6) : expansion ? 14 : 6;
  const cashDelta = Math.round(enterprise.allocation * 0.55 - (expansion ? 12 : waiting ? 4 : 7) - crisis * 0.45);
  const riskDelta = crisis - Math.round(coverage * 12) - toolBonus + (shrinking ? 5 : 0);

  const nextMetrics = {
    cash: clamp(enterprise.metrics.cash + cashDelta),
    debt: clamp(enterprise.metrics.debt + (enterprise.supportTools.includes('financing') ? 5 : expansion ? 9 : 1)),
    progress: clamp(enterprise.metrics.progress + progressDelta),
    technology: clamp(enterprise.metrics.technology + techDelta),
    capacity: clamp(enterprise.metrics.capacity + (expansion ? 13 : waiting ? 2 : 0)),
    orders: clamp(enterprise.metrics.orders + orderDelta),
    risk: clamp(enterprise.metrics.risk + riskDelta),
    employment: clamp(enterprise.metrics.employment + (expansion ? 12 : waiting ? 3 : -2)),
  };
  const previousLogistics = clamp(previousMetrics.capacity * 0.6 + previousMetrics.orders * 0.4);
  const nextLogistics = clamp(nextMetrics.capacity * 0.6 + nextMetrics.orders * 0.4);

  return {
    ...enterprise,
    previousMetrics,
    metrics: nextMetrics,
    builtProgress: Math.max(enterprise.builtProgress, nextMetrics.progress),
    lifecycle: enterprise.action === '迁往外地'
      ? 'exited'
      : enterprise.action === '收缩项目'
        ? 'stalled'
        : 'active',
    lastSettlementDelta: {
      progress: nextMetrics.progress - previousMetrics.progress,
      employment: nextMetrics.employment - previousMetrics.employment,
      logistics: nextLogistics - previousLogistics,
    },
  };
}

export function settleRound(state: SimulationState): SimulationState {
  if (state.phase !== 'settlement' || !state.event) return state;
  const enterprisesAfter = state.enterprises.map((enterprise) => settleEnterprise(enterprise, state.stageIndex));
  const activeGrowth = enterprisesAfter.filter(
    (enterprise) => (enterprise.metrics.progress - (enterprise.previousMetrics?.progress ?? 0)) >= 8,
  ).length;
  return {
    ...state,
    phase: 'feedback',
    cameraMode: 'table',
    settlementRevision: state.settlementRevision + 1,
    enterprises: enterprisesAfter,
    resources: {
      ...state.resources,
      industry: clamp(state.resources.industry + activeGrowth * 3),
      supplyChain: clamp(state.resources.supplyChain + activeGrowth * 2),
      talent: clamp(state.resources.talent + activeGrowth),
      infrastructure: clamp(state.resources.infrastructure - activeGrowth * 2),
    },
  };
}

export function continueSimulation(state: SimulationState): SimulationState {
  if (state.phase !== 'feedback') return state;
  if (state.stageIndex >= stages.length - 1) return { ...state, phase: 'result', cameraMode: 'table' };
  const recoveredFiscal = clamp(state.resources.fiscal + 38);
  return {
    ...state,
    phase: 'applications',
    cameraMode: 'table',
    stageIndex: state.stageIndex + 1,
    roundFiscalStart: recoveredFiscal,
    event: undefined,
    enterprises: state.enterprises.map((enterprise) => ({
      ...enterprise,
      allocation: 0,
      supportTools: [],
      action: undefined,
      actionReason: undefined,
      previousMetrics: undefined,
    })),
    resources: { ...state.resources, fiscal: recoveredFiscal },
  };
}
