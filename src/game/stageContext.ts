import type { SimulationState } from './types';

export type ContextMetricKey = 'industry' | 'supplyChain' | 'talent' | 'publicValue';

export type ContextEvidence = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  grade: 'A' | 'B' | 'SCENARIO';
  note: string;
};

export type StageContextSnapshot = {
  coreConflict: string;
  marketCycle: string;
  marketSignal: string;
  riskWarning: string;
  policies: Array<{ title: string; effectiveAt: string; evidenceId: string }>;
  metricNotes: Record<ContextMetricKey, { label: string; summary: string; evidenceId: string }>;
  evidence: ContextEvidence[];
};

const commonMetricLabels = {
  industry: '产业基础',
  supplyChain: '供应链强度',
  talent: '人才供给',
  publicValue: '组合公共价值',
} as const;

export const stageContexts: StageContextSnapshot[] = [
  {
    coreConflict: '在信贷收紧期锁定产业窗口，同时避免重资产项目透支未来财政。',
    marketCycle: '外需下行 · 逆周期窗口',
    marketSignal: '金融危机使设备与融资同时承压，但也形成逆周期议价机会。',
    riskWarning: '现金流和后续融资能力是首轮投资的共同未穿透项。',
    policies: [
      { title: '国家扩大内需与产业振兴方向已明确', effectiveAt: '2008-09', evidenceId: 'S1-POLICY-01' },
      { title: '合肥产业承接与基础设施配套机制已生效', effectiveAt: '2008-06', evidenceId: 'S1-POLICY-02' },
    ],
    metricNotes: {
      industry: { label: commonMetricLabels.industry, summary: '制造基础具备，新型显示与新能源产业链尚处起步期。', evidenceId: 'S1-CITY-01' },
      supplyChain: { label: commonMetricLabels.supplyChain, summary: '本地配套广度有限，核心设备与材料依赖外部。', evidenceId: 'S1-CITY-02' },
      talent: { label: commonMetricLabels.talent, summary: '高校科研人才存量可观，量产工程人才存在缺口。', evidenceId: 'S1-CITY-03' },
      publicValue: { label: commonMetricLabels.publicValue, summary: '就业与产业带动潜力较高，财政风险也将同步放大。', evidenceId: 'S1-CITY-04' },
    },
    evidence: [],
  },
  {
    coreConflict: '建设进度开始兑现，是继续追加还是转向补链与稳定现金流。',
    marketCycle: '需求回暖 · 扩产预期升温',
    marketSignal: '信贷和需求预期改善，抢先完成验证的项目获得窗口优势。',
    riskWarning: '追加投入会同时放大存量承诺和未来维护成本。',
    policies: [{ title: '重点产业调整振兴政策进入落地期', effectiveAt: '2009-02', evidenceId: 'S2-POLICY-01' }],
    metricNotes: {
      industry: { label: commonMetricLabels.industry, summary: '首批重点项目开始形成资产，产业底座加速增强。', evidenceId: 'S2-CITY-01' },
      supplyChain: { label: commonMetricLabels.supplyChain, summary: '上游配套开始聚集，核心环节仍有外部依赖。', evidenceId: 'S2-CITY-02' },
      talent: { label: commonMetricLabels.talent, summary: '项目建设拉动工程人才需求，供给紧张度上升。', evidenceId: 'S2-CITY-03' },
      publicValue: { label: commonMetricLabels.publicValue, summary: '产业带动效应初现，但投入集中度继续上升。', evidenceId: 'S2-CITY-04' },
    },
    evidence: [],
  },
  {
    coreConflict: '周期分化下识别暂时承压与机制性失效，决定止损、重组或继续投入。',
    marketCycle: '行业分化 · 资本偏好收紧',
    marketSignal: '高杠杆项目承压，技术验证和现金跑道成为分水岭。',
    riskWarning: '不能用过去的沉没成本代替对未来履约能力的判断。',
    policies: [{ title: '战略性新兴产业支持开始强调技术与绩效约束', effectiveAt: '2012-07', evidenceId: 'S3-POLICY-01' }],
    metricNotes: {
      industry: { label: commonMetricLabels.industry, summary: '产业底座已成形，不同赛道进入明显分化。', evidenceId: 'S3-CITY-01' },
      supplyChain: { label: commonMetricLabels.supplyChain, summary: '配套密度提高，关键环节仍受周期和外部供应影响。', evidenceId: 'S3-CITY-02' },
      talent: { label: commonMetricLabels.talent, summary: '人才结构改善，高端研发与量产人才仍紧缺。', evidenceId: 'S3-CITY-03' },
      publicValue: { label: commonMetricLabels.publicValue, summary: '组合效应增强，停滞项目开始拖累公共价值。', evidenceId: 'S3-CITY-04' },
    },
    evidence: [],
  },
  {
    coreConflict: '在短期财政回报与长期技术窗口之间重新平衡投资组合。',
    marketCycle: '政策窗口 · 长期资本形成',
    marketSignal: '国家产业政策改善战略项目融资条件，人才与供应链安全权重上升。',
    riskWarning: '长期项目不应以短期收益单一衡量，但仍需可执行的里程碑与退出规则。',
    policies: [{ title: '战略性新兴产业与产业基金政策窗口形成', effectiveAt: '2015-05', evidenceId: 'S4-POLICY-01' }],
    metricNotes: {
      industry: { label: commonMetricLabels.industry, summary: '多条产业路径并行，组合调度能力成为新约束。', evidenceId: 'S4-CITY-01' },
      supplyChain: { label: commonMetricLabels.supplyChain, summary: '产业链综合强度提高，核心环节安全性成为焦点。', evidenceId: 'S4-CITY-02' },
      talent: { label: commonMetricLabels.talent, summary: '人才集聚效应出现，前沿技术人才争夺加剧。', evidenceId: 'S4-CITY-03' },
      publicValue: { label: commonMetricLabels.publicValue, summary: '组合已具备路径反馈，资源向单一赛道集中的风险上升。', evidenceId: 'S4-CITY-04' },
    },
    evidence: [],
  },
];

for (const [index, context] of stageContexts.entries()) {
  const stageCode = `S${index + 1}`;
  const cutoff = ['2008-09-30', '2011-12-31', '2014-12-31', '2016-12-31'][index];
  context.evidence = [
    ...Object.values(context.metricNotes).map((metric) => ({
      id: metric.evidenceId,
      title: `${metric.label}初始快照`,
      source: '合肥城市产业冻结 Context · 演示数据',
      publishedAt: cutoff,
      grade: 'SCENARIO' as const,
      note: `仅包含 ${stageCode} 信息截止日前可见材料。`,
    })),
    ...context.policies.map((policy) => ({
      id: policy.evidenceId,
      title: policy.title,
      source: '阶段政策事件库 · 演示索引',
      publishedAt: policy.effectiveAt,
      grade: 'B' as const,
      note: `政策生效日早于信息截止日 ${cutoff}。`,
    })),
  ];
}

export function getContextMetricValues(state: SimulationState): Record<ContextMetricKey, number> {
  return {
    industry: state.resources.industry,
    supplyChain: state.resources.supplyChain,
    talent: state.resources.talent,
    publicValue: state.resources.credibility,
  };
}

export function getFiscalContextSnapshot(state: SimulationState) {
  const isFirstEnteredStage = state.stageIndex === state.setupStartStage && state.stageSnapshots.length === 0;
  const previousBalance = isFirstEnteredStage ? 0 : Math.max(0, state.roundFiscalStart - 38);
  const stageAdded = isFirstEnteredStage ? state.roundFiscalStart : Math.min(38, state.roundFiscalStart);
  return {
    stageAdded,
    previousBalance,
    exitRecovery: 0,
    committedCapital: state.resources.committed,
    maintenanceCost: 0,
    finalAvailable: state.roundFiscalStart,
    snapshotId: `${state.runId}:${`S${state.stageIndex + 1}`}:fiscal-context`,
  };
}
