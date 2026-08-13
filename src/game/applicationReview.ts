import type { EnterpriseId, SupportTool } from './types';

export type ComparisonDimension = 'overview' | 'fiscal' | 'delivery' | 'evidence';

export type ApplicationDossier = {
  enterpriseId: EnterpriseId;
  market: string;
  capitalIntensity: '高' | '中' | '低';
  deliveryRisk: '高' | '中' | '低';
  evidenceQuality: '部分验证' | '未验证';
  visibleSourceCount: number;
  evidenceIds: string[];
  resourceBreakdown: Array<{ label: string; value: string }>;
  citySupport: SupportTool[];
  milestones: string[];
  knownFacts: Array<{ label: string; evidenceId: string }>;
  derivedIndicators: Array<{ label: string; value: string; basis: string }>;
  dataGaps: string[];
};

/**
 * P03 presentation data. Every item is deliberately marked as scenario material:
 * it is suitable for layout and rules testing, not a claim about a real company.
 */
export const APPLICATION_DOSSIERS: Record<EnterpriseId, ApplicationDossier> = {
  'enterprise-a': {
    enterpriseId: 'enterprise-a',
    market: '家电和商用显示需求承压，但逆周期设备采购存在议价窗口。',
    capitalIntensity: '高',
    deliveryRisk: '高',
    evidenceQuality: '部分验证',
    visibleSourceCount: 6,
    evidenceIds: ['S1-A-TECH-01', 'S1-A-FIN-01', 'S1-A-BUILD-01'],
    resourceBreakdown: [
      { label: '政府资本申请', value: '42 点' },
      { label: '设备与厂务', value: '重资产前置' },
      { label: '融资协调', value: '关键诉求' },
    ],
    citySupport: ['investment', 'infrastructure', 'financing'],
    milestones: ['资本金与设备订金闭合', '厂务条件交付', '设备进场与试产', '量产爬坡核验'],
    knownFacts: [
      { label: '企业具备既有量产项目经验', evidenceId: 'S1-A-TECH-01' },
      { label: '外部融资窗口正在收窄', evidenceId: 'S1-A-FIN-01' },
    ],
    derivedIndicators: [
      { label: '申请 / 财政池', value: '42%', basis: '规则派生 · 申请 42 / 本轮 100' },
      { label: '建设兑现压力', value: '高', basis: '规则派生 · 重资产＋24–30 个月周期' },
    ],
    dataGaps: ['新世代产线良率爬坡的同口径证据', '设备订金后的持续融资安排'],
  },
  'enterprise-b': {
    enterpriseId: 'enterprise-b',
    market: '行业增速较快，但技术路线、补贴和产品价格均处于高波动期。',
    capitalIntensity: '中',
    deliveryRisk: '高',
    evidenceQuality: '未验证',
    visibleSourceCount: 4,
    evidenceIds: ['S1-B-TECH-01', 'S1-B-FIN-01'],
    resourceBreakdown: [
      { label: '政府资本申请', value: '34 点' },
      { label: '量产线验证', value: '地方共担风险' },
      { label: '人才与补链', value: '关键诉求' },
    ],
    citySupport: ['investment', 'talent', 'supplyChain'],
    milestones: ['技术团队迁入', '首线设备稳定性验证', '规模化良率核验', '本地供应商导入'],
    knownFacts: [
      { label: '中试指标达到情景设定阈值', evidenceId: 'S1-B-TECH-01' },
      { label: '重资产交付履历有限', evidenceId: 'S1-B-FIN-01' },
    ],
    derivedIndicators: [
      { label: '申请 / 财政池', value: '34%', basis: '规则派生 · 申请 34 / 本轮 100' },
      { label: '融资依赖', value: '高', basis: '规则派生 · 现金储备＋补贴依赖' },
    ],
    dataGaps: ['母公司可用现金与受限资金口径', '规模化设备连续稳定性记录'],
  },
  'enterprise-c': {
    enterpriseId: 'enterprise-c',
    market: '国产工艺装备存在替代空间，但客户验证与订单释放周期较长。',
    capitalIntensity: '低',
    deliveryRisk: '中',
    evidenceQuality: '部分验证',
    visibleSourceCount: 5,
    evidenceIds: ['S1-C-IP-01', 'S1-C-CUSTOMER-01', 'S1-C-FIN-01'],
    resourceBreakdown: [
      { label: '政府资本申请', value: '26 点' },
      { label: '研发与试制', value: '分阶段投入' },
      { label: '客户共同验证', value: '关键诉求' },
    ],
    citySupport: ['talent', 'supplyChain', 'financing'],
    milestones: ['核心团队稳定', '样机客户共同验证', '知识产权路径闭合', '小批量工程化'],
    knownFacts: [
      { label: '样机已进入情景客户验证阶段', evidenceId: 'S1-C-CUSTOMER-01' },
      { label: '核心研发团队具备技术积累', evidenceId: 'S1-C-IP-01' },
    ],
    derivedIndicators: [
      { label: '申请 / 财政池', value: '26%', basis: '规则派生 · 申请 26 / 本轮 100' },
      { label: '商业化周期', value: '长', basis: '规则派生 · 客户验证＋30–36 个月周期' },
    ],
    dataGaps: ['客户验证主体与完整测试结果', '知识产权实施路径与长期资本闭环'],
  },
};

export const comparisonDimensionLabels: Record<ComparisonDimension, string> = {
  overview: '总览',
  fiscal: '财政',
  delivery: '交付',
  evidence: '证据',
};

export function getComparisonRows(id: EnterpriseId, dimension: ComparisonDimension) {
  const dossier = APPLICATION_DOSSIERS[id];
  if (dimension === 'fiscal') return [
    ['资本强度', dossier.capitalIntensity],
    ['财政占比', dossier.derivedIndicators[0].value],
    ['资源构成', dossier.resourceBreakdown[1].value],
  ] as const;
  if (dimension === 'delivery') return [
    ['交付风险', dossier.deliveryRisk],
    ['里程碑', `${dossier.milestones.length} 个`],
    ['建设路径', dossier.resourceBreakdown[1].value],
  ] as const;
  if (dimension === 'evidence') return [
    ['证据状态', dossier.evidenceQuality],
    ['可见来源', `${dossier.visibleSourceCount} 项`],
    ['数据缺口', `${dossier.dataGaps.length} 项`],
  ] as const;
  return [
    ['市场', dossier.market],
    ['资本强度', dossier.capitalIntensity],
    ['交付风险', dossier.deliveryRisk],
  ] as const;
}
