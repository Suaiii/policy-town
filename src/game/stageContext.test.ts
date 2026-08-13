import { describe, expect, it } from 'vitest';
import { getContextMetricValues, getFiscalContextSnapshot, stageContexts } from './stageContext';
import { continueSimulation, enterApplications, finalizeNegotiation, initialState, openAllocation, openAnalysis, revealEvent, settleRound, startSimulation, submitDecision, toggleSupportTool, updateAllocation } from './simulation';

describe('P02 stage Context', () => {
  it('provides the required frozen city metrics and cutoff-safe evidence for every stage', () => {
    expect(stageContexts).toHaveLength(4);
    for (const context of stageContexts) {
      expect(Object.keys(context.metricNotes)).toEqual(['industry', 'supplyChain', 'talent', 'publicValue']);
      expect(context.evidence.length).toBeGreaterThanOrEqual(5);
      expect(context.policies.every((policy) => context.evidence.some((evidence) => evidence.id === policy.evidenceId))).toBe(true);
    }
  });

  it('maps the initial snapshot directly from rule-engine state', () => {
    const state = startSimulation(initialState, 20260813);

    expect(getContextMetricValues(state)).toEqual({
      industry: state.resources.industry,
      supplyChain: state.resources.supplyChain,
      talent: state.resources.talent,
      publicValue: state.resources.credibility,
    });
    expect(getFiscalContextSnapshot(state)).toMatchObject({
      stageAdded: 100,
      previousBalance: 0,
      finalAvailable: state.roundFiscalStart,
    });
  });

  it('carries the recovered fiscal balance into the next P02 snapshot', () => {
    let state = openAllocation(openAnalysis(enterApplications(startSimulation(initialState))));
    state = updateAllocation(state, state.enterprises[0].id, 42);
    state = toggleSupportTool(state, state.enterprises[0].id, 'investment');
    state = finalizeNegotiation(state, state.enterprises[0].id, ['按里程碑分期拨付']);
    state = settleRound(revealEvent(submitDecision(state)));
    state = continueSimulation(state);

    const snapshot = getFiscalContextSnapshot(state);
    expect(state.phase).toBe('briefing');
    expect(snapshot.stageAdded + snapshot.previousBalance + snapshot.exitRecovery - snapshot.maintenanceCost).toBe(snapshot.finalAvailable);
  });
});
