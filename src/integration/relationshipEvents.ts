import type { SandboxEventInput } from '../../packages/events/src';
import { stages } from '../game/scenario';
import type { EnterpriseState, RoundEvent, SimulationState, SupportTool } from '../game/types';

const supportEventType: Record<SupportTool, 'subsidize' | 'approve'> = {
  // Financial, talent, and supply-chain assistance are public industrial support;
  // infrastructure delivery and financing coordination are administrative approvals.
  investment: 'subsidize',
  infrastructure: 'approve',
  talent: 'subsidize',
  supplyChain: 'subsidize',
  financing: 'approve',
};

const supportLabels: Record<SupportTool, string> = {
  investment: '股权投资支持',
  infrastructure: '基础设施配套审批',
  talent: '人才支持',
  supplyChain: '产业链协同支持',
  financing: '融资协调审批',
};

function sameEvent(before?: RoundEvent, after?: RoundEvent): boolean {
  return before?.title === after?.title
    && before?.description === after?.description
    && before?.effects.join('\u0000') === after?.effects.join('\u0000');
}

function settlementChanged(before: EnterpriseState, after: EnterpriseState): boolean {
  return before.lastSettlementDelta.progress !== after.lastSettlementDelta.progress
    || before.lastSettlementDelta.employment !== after.lastSettlementDelta.employment
    || before.lastSettlementDelta.logistics !== after.lastSettlementDelta.logistics;
}

function environmentLabel(event: RoundEvent): string {
  if (event.title === stages[0].event) return '信贷与需求转弱';
  if (event.title === stages[1].event) return '政策与需求预期回暖';
  return `外部环境：${event.title}`;
}

/** Maps only observable sandbox state transitions; it has no UI or network dependencies. */
export function relationshipEventsForTransition(
  before: SimulationState,
  after: SimulationState,
  reason: string,
): SandboxEventInput[] {
  const at = stages[after.stageIndex]?.date ?? stages.at(-1)!.date;
  const events: SandboxEventInput[] = [];
  const envelope = (target: string) => ({
    actor: 'gov',
    target,
    at,
    visibility: 'public' as const,
    reveal_at: null,
  });
  const environmentEvent = after.event;
  const environmentChanged = environmentEvent !== undefined && !sameEvent(before.event, environmentEvent);

  for (const enterpriseAfter of after.enterprises) {
    const enterpriseBefore = before.enterprises.find((enterprise) => enterprise.id === enterpriseAfter.id);
    if (!enterpriseBefore) continue;

    if (enterpriseBefore.allocation !== enterpriseAfter.allocation) {
      events.push({
        ...envelope(enterpriseAfter.id),
        type: 'invest',
        payload: {
          amount: enterpriseAfter.allocation,
          delta: enterpriseAfter.allocation - enterpriseBefore.allocation,
          reason,
        },
      });
    }

    for (const tool of enterpriseAfter.supportTools) {
      if (enterpriseBefore.supportTools.includes(tool)) continue;
      events.push({
        ...envelope(enterpriseAfter.id),
        type: supportEventType[tool],
        payload: { tool, relationship_key: `support:${tool}`, label: supportLabels[tool], reason },
      });
    }

    for (const tool of enterpriseBefore.supportTools) {
      if (enterpriseAfter.supportTools.includes(tool)) continue;
      events.push({
        ...envelope(enterpriseAfter.id),
        type: 'revoke',
        payload: { relationship_key: `support:${tool}`, tool, label: `撤销${supportLabels[tool]}`, reason },
      });
    }

    if (enterpriseBefore.action !== enterpriseAfter.action || enterpriseBefore.actionReason !== enterpriseAfter.actionReason) {
      const label = enterpriseAfter.action
        ? `企业行动：${enterpriseAfter.action}`
        : enterpriseAfter.actionReason
          ? `企业行动说明更新：${enterpriseAfter.actionReason}`
          : '企业行动已撤回';
      events.push({
        ...envelope(enterpriseAfter.id),
        type: 'shock',
        payload: {
          label,
          action: enterpriseAfter.action ?? null,
          actionReason: enterpriseAfter.actionReason ?? null,
          reason,
        },
      });
    }

    if (environmentChanged) {
      events.push({
        ...envelope(enterpriseAfter.id),
        type: 'shock',
        payload: { label: environmentLabel(environmentEvent!), event: environmentEvent!.title, reason },
      });
    }

    if (settlementChanged(enterpriseBefore, enterpriseAfter)) {
      const delta = enterpriseAfter.lastSettlementDelta;
      events.push({
        ...envelope(enterpriseAfter.id),
        type: 'shock',
        payload: {
          label: `结算变化：进度${delta.progress >= 0 ? '+' : ''}${delta.progress}，就业${delta.employment >= 0 ? '+' : ''}${delta.employment}，物流${delta.logistics >= 0 ? '+' : ''}${delta.logistics}`,
          settlementDelta: { ...delta },
          reason,
        },
      });
    }
  }

  return events;
}
