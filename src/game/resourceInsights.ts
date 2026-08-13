import { stages } from './scenario';
import { initialState } from './simulation';
import type { CityResources, SimulationState } from './types';

export type TableResourceKey = 'capital' | 'infrastructure' | 'talent' | 'supplyChain';

export type ResourceInsight = {
  key: TableResourceKey;
  label: string;
  value: number;
  previousValue: number | null;
  delta: number | null;
  changeLabel: string;
  definition: string;
  metric: string;
  drivers: string;
  reason: string;
};

const resourceFields: Record<TableResourceKey, keyof CityResources> = {
  capital: 'fiscal',
  infrastructure: 'infrastructure',
  talent: 'talent',
  supplyChain: 'supplyChain',
};

const definitions: Record<TableResourceKey, Omit<ResourceInsight, 'key' | 'value' | 'previousValue' | 'delta' | 'changeLabel' | 'reason'>> = {
  capital: {
    label: '资本',
    definition: '政府当前可用于产业项目支持的财政政策空间，不等同于社会总资本。',
    metric: '0–100 点；越高表示本阶段可调度的财政空间越充足。',
    drivers: '政府项目投入会降低；进入新阶段的财政恢复与未使用额度回补会提高。',
  },
  infrastructure: {
    label: '基建',
    definition: '城市承接新增项目所需的厂务、供电、用地、物流与公共配套余度。',
    metric: '0–100 点；越高表示城市仍能承载更多建设与投产压力。',
    drivers: '有效建设推进会占用余度；基础设施配套投入、项目暂停或退出可缓解压力。',
  },
  talent: {
    label: '人才',
    definition: '本地可支撑研发、工程建设和规模量产的复合型人才供给能力。',
    metric: '0–100 点；衡量人才数量、结构与项目需求的综合匹配程度。',
    drivers: '项目落地、人才支持和团队集聚会提高；人才竞争、项目扩张过快会形成压力。',
  },
  supplyChain: {
    label: '产业链',
    definition: '本地供应商覆盖、上下游配套密度及关键环节协同能力。',
    metric: '0–100 点；越高表示项目可在本地获得更完整、更稳定的产业配套。',
    drivers: '有效项目建设和产业链招商会提高；企业迁出、关键供应受阻会削弱。',
  },
};

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function latestGrowthCount(state: SimulationState) {
  const latest = state.stageSnapshots.at(-1);
  return latest?.enterprises.filter((enterprise) => enterprise.lastSettlementDelta.progress >= 8).length ?? 0;
}

function previousNonFiscalValue(state: SimulationState, key: Exclude<TableResourceKey, 'capital'>) {
  const field = resourceFields[key];
  const latest = state.stageSnapshots.at(-1);
  if (!latest) return null;
  const prior = state.stageSnapshots.at(-2)?.resources ?? initialState.resources;
  return prior[field];
}

function capitalComparison(state: SimulationState) {
  if (state.resources.fiscal !== state.roundFiscalStart) return state.roundFiscalStart;
  const latest = state.stageSnapshots.at(-1);
  if (latest && latest.resources.fiscal !== state.resources.fiscal) return latest.resources.fiscal;
  return null;
}

function reasonFor(state: SimulationState, key: TableResourceKey, delta: number | null) {
  const stage = stages[state.stageIndex];
  if (delta === null) return `${stage.code} 当前为阶段初始冻结值，尚无可比较的上一轮结算快照。`;

  if (key === 'capital') {
    const allocation = state.enterprises.reduce((total, enterprise) => total + enterprise.allocation, 0);
    if (allocation > 0 && state.resources.fiscal < state.roundFiscalStart) {
      const supported = state.enterprises.filter((enterprise) => enterprise.allocation > 0).length;
      return `本轮政府向 ${supported} 个项目形成 ${allocation} 点投入，财政可用空间相应减少。`;
    }
    if (delta > 0) return `进入 ${stage.code} 后按阶段规则恢复财政空间 ${signed(delta)} 点。`;
    if (delta < 0) return `上一轮政府投入与已形成承诺使财政空间变化 ${signed(delta)} 点。`;
    return '本轮尚未形成新的财政投入或额度恢复。';
  }

  const growthCount = latestGrowthCount(state);
  if (growthCount === 0 || delta === 0) return '上一轮没有项目达到“有效建设推进”阈值，该指标保持不变。';
  if (key === 'infrastructure') return `上一轮 ${growthCount} 个项目形成有效建设推进，新增建设占用城市配套余度 ${Math.abs(delta)} 点。`;
  if (key === 'talent') return `上一轮 ${growthCount} 个项目形成有效建设推进，项目与团队集聚使人才供给指标 ${signed(delta)} 点。`;
  return `上一轮 ${growthCount} 个项目形成有效建设推进，上下游配套进入使产业链指标 ${signed(delta)} 点。`;
}

export function createResourceInsights(state: SimulationState): Record<TableResourceKey, ResourceInsight> {
  return (Object.keys(resourceFields) as TableResourceKey[]).reduce((result, key) => {
    const field = resourceFields[key];
    const value = state.resources[field];
    const previousValue = key === 'capital'
      ? capitalComparison(state)
      : previousNonFiscalValue(state, key);
    const delta = previousValue === null ? null : value - previousValue;
    result[key] = {
      key,
      ...definitions[key],
      value,
      previousValue,
      delta,
      changeLabel: delta === null ? '初始冻结值' : `较上轮 ${signed(delta)}`,
      reason: reasonFor(state, key, delta),
    };
    return result;
  }, {} as Record<TableResourceKey, ResourceInsight>);
}
