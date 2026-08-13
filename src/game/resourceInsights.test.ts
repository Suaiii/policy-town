import { describe, expect, it } from 'vitest';
import { createResourceInsights } from './resourceInsights';
import { initialState } from './simulation';
import type { SimulationState, StageSnapshot } from './types';

describe('createResourceInsights', () => {
  it('marks a new run as an initial frozen value', () => {
    const insights = createResourceInsights(structuredClone(initialState));
    expect(insights.talent.previousValue).toBeNull();
    expect(insights.talent.changeLabel).toBe('初始冻结值');
  });

  it('explains fiscal recovery and previous-round city resource changes', () => {
    const snapshot: StageSnapshot = {
      stageCode: 'S1',
      decisionId: 'decision-s1',
      contextHash: 'context-s1',
      resources: { ...initialState.resources, fiscal: 60, supplyChain: 56, talent: 63, infrastructure: 63 },
      enterprises: initialState.enterprises.map((enterprise, index) => ({
        ...structuredClone(enterprise),
        lastSettlementDelta: { progress: index < 2 ? 10 : 2, employment: 0, logistics: 0 },
      })),
      facts: [],
      judgments: [],
      commitments: [],
    };
    const state: SimulationState = {
      ...structuredClone(initialState),
      phase: 'briefing',
      stageIndex: 1,
      roundFiscalStart: 98,
      resources: { ...snapshot.resources, fiscal: 98 },
      stageSnapshots: [snapshot],
    };

    const insights = createResourceInsights(state);
    expect(insights.capital.delta).toBe(38);
    expect(insights.supplyChain.delta).toBe(4);
    expect(insights.talent.delta).toBe(2);
    expect(insights.infrastructure.delta).toBe(-4);
    expect(insights.infrastructure.reason).toContain('2 个项目');
  });
});
