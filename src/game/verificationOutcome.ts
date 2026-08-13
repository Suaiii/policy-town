import { getJointReview } from './jointReview';
import { getEnterprise } from './scenario';
import type { EnterpriseId, SupportTool } from './types';

export type VerificationOutcome = {
  fiscalOffer: number;
  tools: SupportTool[];
  conditions: string[];
  supportLevel: '审慎保留' | '小额验证' | '有条件支持';
};

export type PlayerDecisionPackage = VerificationOutcome & {
  id: 'prudent' | 'progressive';
  label: string;
  title: string;
  description: string;
};

function uniqueConditions(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index).slice(0, 3);
}

/**
 * Deterministic bridge for the current local demo. The UI only renders this result.
 * Replace this function with the policy-package HTTP response when the compiler service is connected.
 */
export function compileVerificationOutcome(enterpriseId: EnterpriseId, verificationQuestion: string): VerificationOutcome {
  const profile = getEnterprise(enterpriseId);
  const review = getJointReview(enterpriseId);
  const response = profile.negotiation.verificationQuestions.find((item) => item.question === verificationQuestion)
    ?? profile.negotiation.verificationQuestions[0];
  const responseRatio: Record<string, number> = {
    '完整披露': .82,
    '部分披露': .7,
    '给出区间': .68,
    '交换条件': .74,
    '拒绝披露': .5,
  };
  const recommendationRatio = review.recommendation.includes('暂缓') ? .5 : .74;
  const ratio = Math.min(responseRatio[response.responseType] ?? recommendationRatio, recommendationRatio);

  return {
    // Every executable package clears the first-phase construction threshold.
    fiscalOffer: Math.max(Math.ceil(profile.request * .7), Math.round(profile.request * ratio)),
    tools: profile.requestedTools.slice(0, 2),
    conditions: uniqueConditions([
      review.departments.fiscal.acceptableCondition,
      review.challenges[0].addedCondition,
      review.departments.technology.acceptableCondition,
    ]),
    supportLevel: response.responseType === '拒绝披露'
      ? '审慎保留'
      : review.recommendation.includes('暂缓')
        ? '小额验证'
        : '有条件支持',
  };
}

/** Two executable player choices derived from the same verified facts. */
export function compilePlayerDecisionPackages(enterpriseId: EnterpriseId, verificationQuestion: string): PlayerDecisionPackage[] {
  const profile = getEnterprise(enterpriseId);
  const review = getJointReview(enterpriseId);
  const base = compileVerificationOutcome(enterpriseId, verificationQuestion);
  const progressiveOffer = Math.max(base.fiscalOffer, Math.round(profile.request * .82));

  return [
    {
      ...base,
      id: 'prudent',
      label: '稳健方案',
      title: '分期投入，先验证再追加',
      description: '首期投入较低，保留暂停权，以资本金、建设和技术里程碑控制风险。',
    },
    {
      ...base,
      id: 'progressive',
      label: '进取方案',
      title: '提高首期强度，完整配置落地条件',
      description: '更快锁定项目窗口，同时用更严格的里程碑和退出条件约束后续投入。',
      fiscalOffer: Math.min(profile.request, progressiveOffer),
      tools: profile.requestedTools.slice(0, 3),
      conditions: Array.from(new Set([
        ...base.conditions,
        review.departments.industry.acceptableCondition,
      ])).slice(0, 3),
      supportLevel: '有条件支持',
    },
  ];
}
