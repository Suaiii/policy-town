import { describe, expect, it } from 'vitest';
import {
  enterApplications,
  finalizeNegotiation,
  continueSimulation,
  initialState,
  startSimulation,
  openAllocation,
  openAnalysis,
  revealEvent,
  settleRound,
  submitDecision,
  toggleSupportTool,
  updateAllocation,
} from '../game/simulation';
import { stages } from '../game/scenario';
import { relationshipEventsForTransition } from './relationshipEvents';

describe('relationshipEventsForTransition', () => {
  const started = () => startSimulation(initialState);

  it('maps a funded decision and its revealed stage environment into relationship events', () => {
    const before = started();
    let after = openAllocation(openAnalysis(enterApplications(before)));
    after = updateAllocation(after, 'enterprise-a', 42);
    after = toggleSupportTool(after, 'enterprise-a', 'investment');
    after = finalizeNegotiation(after, 'enterprise-a', ['按建设里程碑分期拨付']);
    after = revealEvent(submitDecision(after));

    const events = relationshipEventsForTransition(before, after, '提交本轮决策');

    expect(events).toContainEqual(expect.objectContaining({
      type: 'invest',
      actor: 'gov',
      target: 'enterprise-a',
      at: stages[0].date,
      visibility: 'public',
      reveal_at: null,
      payload: expect.objectContaining({ amount: 42 }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'subsidize',
      actor: 'gov',
      target: 'enterprise-a',
      payload: expect.objectContaining({ tool: 'investment' }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'shock',
      actor: 'gov',
      target: 'enterprise-a',
      payload: expect.objectContaining({ label: '信贷与需求转弱' }),
    }));
  });

  it('returns no events for an unchanged transition', () => {
    expect(relationshipEventsForTransition(started(), started(), '重复同步')).toEqual([]);
  });

  it('records an action reason change even when the enterprise has no action', () => {
    const after = {
      ...started(),
      enterprises: started().enterprises.map((enterprise) =>
        enterprise.id === 'enterprise-a'
          ? { ...enterprise, actionReason: '企业重新评估本地落地条件。' }
          : enterprise,
      ),
    };

    expect(relationshipEventsForTransition(started(), after, '更新企业反馈')).toContainEqual(expect.objectContaining({
      type: 'shock',
      actor: 'gov',
      target: 'enterprise-a',
      payload: expect.objectContaining({ label: '企业行动说明更新：企业重新评估本地落地条件。' }),
    }));
  });

  it('revokes only a deselected support relationship', () => {
    let before = openAllocation(openAnalysis(enterApplications(started())));
    before = toggleSupportTool(before, 'enterprise-a', 'investment');
    const after = toggleSupportTool(before, 'enterprise-a', 'investment');

    expect(relationshipEventsForTransition(before, after, '撤销支持工具')).toContainEqual(expect.objectContaining({
      type: 'revoke',
      actor: 'gov',
      target: 'enterprise-a',
      payload: expect.objectContaining({ relationship_key: 'support:investment' }),
    }));
  });

  it('records a cleared production action with null action details', () => {
    let before = openAllocation(openAnalysis(enterApplications(started())));
    before = updateAllocation(before, 'enterprise-a', 42);
    before = toggleSupportTool(before, 'enterprise-a', 'investment');
    before = finalizeNegotiation(before, 'enterprise-a', ['按建设里程碑分期拨付']);
    before = settleRound(revealEvent(submitDecision(before)));
    const after = continueSimulation(before);

    expect(relationshipEventsForTransition(before, after, '进入下一阶段')).toContainEqual(expect.objectContaining({
      type: 'shock',
      actor: 'gov',
      target: 'enterprise-a',
      payload: expect.objectContaining({
        label: '企业行动已撤回',
        action: null,
        actionReason: null,
      }),
    }));
  });

  it.each([
    ['investment', 'subsidize', '股权投资支持'],
    ['infrastructure', 'approve', '基础设施配套审批'],
    ['talent', 'subsidize', '人才支持'],
    ['supplyChain', 'subsidize', '产业链协同支持'],
    ['financing', 'approve', '融资协调审批'],
  ] as const)('maps %s support to %s with the common stage envelope', (tool, type, label) => {
    const before = started();
    let after = openAllocation(openAnalysis(enterApplications(before)));
    after = { ...after, stageIndex: 1 };
    after = toggleSupportTool(after, 'enterprise-a', tool);

    expect(relationshipEventsForTransition(before, after, '配置支持')).toContainEqual(expect.objectContaining({
      type,
      actor: 'gov',
      target: 'enterprise-a',
      at: stages[1].date,
      visibility: 'public',
      reveal_at: null,
      payload: expect.objectContaining({ tool, label }),
    }));
  });

  it('labels the second-stage policy environment shock', () => {
    const before = started();
    let after = openAllocation(openAnalysis(enterApplications(before)));
    after = { ...after, stageIndex: 1 };
    after = updateAllocation(after, 'enterprise-a', 42);
    after = toggleSupportTool(after, 'enterprise-a', 'investment');
    after = finalizeNegotiation(after, 'enterprise-a', ['按建设里程碑分期拨付']);
    after = revealEvent(submitDecision(after));

    expect(relationshipEventsForTransition(before, after, '揭示环境')).toContainEqual(expect.objectContaining({
      type: 'shock',
      actor: 'gov',
      target: 'enterprise-a',
      at: stages[1].date,
      payload: expect.objectContaining({ label: '政策与需求预期回暖' }),
    }));
  });

  it('clones settlement deltas into a labeled shock', () => {
    const after = {
      ...started(),
      enterprises: started().enterprises.map((enterprise) =>
        enterprise.id === 'enterprise-a'
          ? { ...enterprise, lastSettlementDelta: { progress: 5, employment: -2, logistics: 3 } }
          : enterprise,
      ),
    };
    const event = relationshipEventsForTransition(started(), after, '结算完成').find(
      (candidate) => candidate.type === 'shock' && candidate.target === 'enterprise-a',
    )!;
    const delta = event.payload.settlementDelta as { progress: number; employment: number; logistics: number };

    expect(event.payload.label).toBe('结算变化：进度+5，就业-2，物流+3');
    delta.progress = 99;
    expect(after.enterprises[0].lastSettlementDelta.progress).toBe(5);
  });
});
