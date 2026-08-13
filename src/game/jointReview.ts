import { APPLICATION_DOSSIERS } from './applicationReview';
import { agentReports, getEnterprise } from './scenario';
import type { EnterpriseId } from './types';

export type DepartmentKey = 'fiscal' | 'industry' | 'technology' | 'market';

export type DepartmentReview = {
  stance: string;
  claim: string;
  confidence: number;
  evidenceIds: string[];
  assumption: string;
  redLine: string;
  acceptableCondition: string;
};

export type ReviewChallenge = {
  id: string;
  from: DepartmentKey;
  to: DepartmentKey;
  claim: string;
  question: string;
  response: string;
  evidenceIds: string[];
  stanceBefore: string;
  stanceAfter: string;
  changed: boolean;
  changedBecause: string;
  addedCondition: string;
};

export type ReviewOption = {
  id: string;
  label: string;
  title: string;
  conditions: string[];
};

export type VerificationCandidate = {
  id: string;
  proposition: string;
  question: string;
  decisionImpact: string;
  status: '未验证' | '部分验证' | '存在矛盾';
};

export type JointReview = {
  enterpriseId: EnterpriseId;
  consensus: string;
  disagreement: string;
  unresolved: string;
  recommendation: string;
  minorityOpinion: string;
  departments: Record<DepartmentKey, DepartmentReview>;
  options: ReviewOption[];
  challenges: ReviewChallenge[];
  verificationCandidates: VerificationCandidate[];
};

const departmentKeys: DepartmentKey[] = ['fiscal', 'industry', 'technology', 'market'];

const enterpriseReviewCopy: Record<EnterpriseId, {
  consensus: string;
  disagreement: string;
  unresolved: string;
  recommendation: string;
  minorityOpinion: string;
  assumptions: Record<DepartmentKey, string>;
  redLines: Record<DepartmentKey, string>;
  acceptableConditions: Record<DepartmentKey, string>;
  confidence: Record<DepartmentKey, number>;
  optionA: string;
  optionB: string;
  challengeFrom: DepartmentKey;
  challengeTo: DepartmentKey;
  challengeQuestion: string;
  challengeResponse: string;
  stanceBefore: string;
  stanceAfter: string;
  changed: boolean;
  changedBecause: string;
  addedCondition: string;
  decisionImpacts: string[];
}> = {
  'enterprise-a': {
    consensus: '项目与合肥家电制造基础具有较强协同，具备逆周期进入价值。',
    disagreement: '财政追加暴露与新世代产线的量产兑现风险。',
    unresolved: '企业是否具备经过验证的建线、融资和持续扩代能力？',
    recommendation: '有条件支持：分期投入，并绑定融资与量产里程碑。',
    minorityOpinion: '科技部门认为新世代良率证据不足，不应以既有产线经验替代本项目验证。',
    assumptions: {
      fiscal: '后续设备融资不会全部转化为地方追加责任。',
      industry: '本地家电产业能承接面板产能并形成配套需求。',
      technology: '既有量产能力可以迁移，但新世代良率需重新验证。',
      market: '逆周期进入成本优势能够覆盖短期需求下行。',
    },
    redLines: {
      fiscal: '不得形成无上限追加承诺。',
      industry: '核心产线与配套必须在合肥落地。',
      technology: '量产里程碑未通过不得自动拨付后续资金。',
      market: '不得以未经核验的需求预测作为投入依据。',
    },
    acceptableConditions: {
      fiscal: '首期封顶并绑定企业资本金到位。',
      industry: '同步导入模组、物流和材料配套。',
      technology: '设备进场、试产和良率分段验收。',
      market: '以已落实订单和阶段产能利用率复核后续投入。',
    },
    confidence: { fiscal: 72, industry: 84, technology: 63, market: 58 },
    optionA: '分期支持并绑定资金、建设、良率和审计里程碑。',
    optionB: '暂缓资本承诺，仅保留厂务准备与融资核验窗口。',
    challengeFrom: 'fiscal',
    challengeTo: 'industry',
    challengeQuestion: '若企业自筹与设备融资未按期闭合，产业价值是否足以支持地方继续追加？',
    challengeResponse: '经信部门维持产业协同判断，但同意将支持改为分期，并取消自动追加。',
    stanceBefore: '建议尽快锁定项目',
    stanceAfter: '接受分期支持与追加上限',
    changed: true,
    changedBecause: '持续融资安排尚无直接证据，财政暴露边界无法确认。',
    addedCondition: '企业资本金先到位；未达里程碑暂停后续拨付。',
    decisionImpacts: ['决定首期投入是否设置硬上限', '决定后续拨付是否与良率挂钩', '决定是否保留退出与暂停条款'],
  },
  'enterprise-b': {
    consensus: '行业仍有增长空间，但项目对地方资金与外部融资依赖较强。',
    disagreement: '高景气扩产机会能否覆盖技术路线和母公司现金风险。',
    unresolved: '母公司能否持续提供运营资金、采购信用与技术人员？',
    recommendation: '暂缓承诺：先核验母公司现金与再融资能力。',
    minorityOpinion: '经信部门主张保留小额验证窗口，避免因财政谨慎完全失去产业进入机会。',
    assumptions: {
      fiscal: '补贴退坡后企业仍需要地方持续输血。',
      industry: '本地组件能力可以逐步带动上游材料补链。',
      technology: '中试结果尚不能证明规模化设备稳定性。',
      market: '行业增长与价格下降会同时发生。',
    },
    redLines: {
      fiscal: '母公司资金责任不清时不得承诺大额首期投入。',
      industry: '企业必须落实团队迁入和本地供应商导入。',
      technology: '连续稳定性记录缺失时不得认定量产成熟。',
      market: '不得用行业增速替代企业现金与订单核验。',
    },
    acceptableConditions: {
      fiscal: '母公司出具资金证明并同比例出资。',
      industry: '先以人才和供应链协同换取团队落地。',
      technology: '首线验证通过后再触发扩产资本。',
      market: '按已确认订单和价格压力测试决定投入节奏。',
    },
    confidence: { fiscal: 78, industry: 61, technology: 74, market: 67 },
    optionA: '仅开放小额验证资金，绑定母公司同比例出资与稳定性里程碑。',
    optionB: '暂缓资本投入，保留人才和供应链对接窗口。',
    challengeFrom: 'technology',
    challengeTo: 'industry',
    challengeQuestion: '没有规模化连续运行记录时，产业补链价值是否被高估？',
    challengeResponse: '经信部门承认量产证据缺口，同意先做验证线，不以规划产能作为支持依据。',
    stanceBefore: '建议抢占扩产窗口',
    stanceAfter: '仅支持验证线与团队落地',
    changed: true,
    changedBecause: '中试指标与规模化稳定性之间仍存在证据断点。',
    addedCondition: '稳定运行和母公司资金证明同时满足后才允许追加。',
    decisionImpacts: ['决定是否投入验证资金', '决定是否要求母公司同比例出资', '决定人才支持是否先于资本支持'],
  },
  'enterprise-c': {
    consensus: '项目具备战略补位价值，单次财政投入相对可控。',
    disagreement: '长期技术价值与客户验证、商业化周期之间的张力。',
    unresolved: '技术团队、知识产权路径和长期资本能否按阶段形成闭环？',
    recommendation: '分期支持：以客户验证和技术里程碑触发后续投入。',
    minorityOpinion: '发改部门认为订单释放周期过长，不宜把战略价值直接折算为近期公共回报。',
    assumptions: {
      fiscal: '较小首期投入不会演变为长期无条件续投。',
      industry: '本地客户共同验证能缩短商业化路径。',
      technology: '核心团队和知识产权具备持续实施基础。',
      market: '进口替代空间会逐步转化为订单。',
    },
    redLines: {
      fiscal: '长期研发不得形成无里程碑续投。',
      industry: '必须落实本地客户共同验证。',
      technology: '知识产权路径存在重大争议时暂停投入。',
      market: '不得以战略标签替代客户验证。',
    },
    acceptableConditions: {
      fiscal: '按样机、客户验证和工程化节点分期。',
      industry: '组织本地客户共同验证并保留供应链入口。',
      technology: '核心团队驻场并完成知识产权核验。',
      market: '用验证进度而非短期营收作为阶段口径。',
    },
    confidence: { fiscal: 69, industry: 73, technology: 77, market: 55 },
    optionA: '小额分期支持，绑定团队、知识产权和客户验证里程碑。',
    optionB: '只提供人才与客户协同，不承诺本轮资本投入。',
    challengeFrom: 'market',
    challengeTo: 'technology',
    challengeQuestion: '样机可用但客户未完成验证，技术判断为何足以支持财政投入？',
    challengeResponse: '科技部门维持技术价值判断，但接受以客户验证作为后续资本触发条件。',
    stanceBefore: '建议支持研发中心',
    stanceAfter: '支持首期研发，后续绑定客户验证',
    changed: true,
    changedBecause: '技术可行性不能替代商业验证，需将两类证据分开。',
    addedCondition: '客户共同验证未完成时不得进入重资产量产投入。',
    decisionImpacts: ['决定首期投入规模', '决定客户验证是否作为硬触发', '决定人才支持与资本投入的先后顺序'],
  },
};

function buildReview(enterpriseId: EnterpriseId): JointReview {
  const profile = getEnterprise(enterpriseId);
  const dossier = APPLICATION_DOSSIERS[enterpriseId];
  const copy = enterpriseReviewCopy[enterpriseId];
  const suffix = profile.code;
  const departments = Object.fromEntries(departmentKeys.map((key, index) => [key, {
    stance: agentReports[enterpriseId][key].stance,
    claim: agentReports[enterpriseId][key].text,
    confidence: copy.confidence[key],
    evidenceIds: [dossier.evidenceIds[index % dossier.evidenceIds.length]],
    assumption: copy.assumptions[key],
    redLine: copy.redLines[key],
    acceptableCondition: copy.acceptableConditions[key],
  }])) as Record<DepartmentKey, DepartmentReview>;

  return {
    enterpriseId,
    consensus: copy.consensus,
    disagreement: copy.disagreement,
    unresolved: copy.unresolved,
    recommendation: copy.recommendation,
    minorityOpinion: copy.minorityOpinion,
    departments,
    options: [
      { id: `JR-${suffix}-OPTION-A`, label: '方案 A · 风险约束', title: copy.optionA, conditions: ['分期投入', '里程碑触发', '保留暂停或退出权'] },
      { id: `JR-${suffix}-OPTION-B`, label: '方案 B · 保留财政', title: copy.optionB, conditions: ['不形成追加承诺', '保留核验窗口'] },
    ],
    challenges: [{
      id: `JR-${suffix}-CHALLENGE-01`,
      from: copy.challengeFrom,
      to: copy.challengeTo,
      claim: copy.disagreement,
      question: copy.challengeQuestion,
      response: copy.challengeResponse,
      evidenceIds: dossier.evidenceIds.slice(0, 2),
      stanceBefore: copy.stanceBefore,
      stanceAfter: copy.stanceAfter,
      changed: copy.changed,
      changedBecause: copy.changedBecause,
      addedCondition: copy.addedCondition,
    }],
    verificationCandidates: profile.negotiation.verificationQuestions.map((item, index) => ({
      id: `JR-${suffix}-QUESTION-0${index + 1}`,
      proposition: copy.unresolved,
      question: item.question,
      decisionImpact: copy.decisionImpacts[index],
      status: index === 0 && profile.negotiation.verificationStatus === '部分验证' ? '部分验证' : '未验证',
    })),
  };
}

export const JOINT_REVIEWS: Record<EnterpriseId, JointReview> = {
  'enterprise-a': buildReview('enterprise-a'),
  'enterprise-b': buildReview('enterprise-b'),
  'enterprise-c': buildReview('enterprise-c'),
};

export function getJointReview(id: EnterpriseId) {
  return JOINT_REVIEWS[id];
}
