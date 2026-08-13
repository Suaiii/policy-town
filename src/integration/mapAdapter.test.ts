import { describe, expect, it } from 'vitest';
import {
  enterApplications,
  initialState,
  openAllocation,
  openAnalysis,
  revealEvent,
  settleRound,
  submitDecision,
  toggleSupportTool,
  updateAllocation,
} from '../game/simulation';
import { simulationToMapSnapshot } from './mapAdapter';

describe('simulationToMapSnapshot', () => {
  it('publishes all competing projects as proposals before decisions', () => {
    const snapshot = simulationToMapSnapshot(initialState);

    expect(snapshot.schemaVersion).toBe('2.0');
    expect(snapshot.revision).toBe(0);
    expect(snapshot.projects).toHaveLength(3);
    expect(snapshot.projects.map((project) => project.stage)).toEqual(['proposal', 'proposal', 'proposal']);
    expect(snapshot.projects.map((project) => project.archetype)).toEqual([
      'heavy-manufacturing', 'energy-manufacturing', 'rd-pilot',
    ]);
  });

  it('maps settled enterprise and city feedback without adding map-side business rules', () => {
    let state = openAllocation(openAnalysis(enterApplications(initialState)));
    state = updateAllocation(state, 'enterprise-a', 42);
    state = toggleSupportTool(state, 'enterprise-a', 'investment');
    state = toggleSupportTool(state, 'enterprise-a', 'infrastructure');
    state = settleRound(revealEvent(submitDecision(state)));
    const snapshot = simulationToMapSnapshot(state);

    expect(snapshot.projects[0].stage).toBe('construction');
    expect(snapshot.revision).toBe(1);
    expect(snapshot.projects[0].builtProgress).toBe(snapshot.projects[0].progress);
    expect(snapshot.projects[0].delta.employment).toBe(12);
    expect(snapshot.projects[0].employment).toBeGreaterThan(12);
    expect(snapshot.city.fiscalPressure).toBe(42);
    expect(snapshot.city.logisticsIndex).toBeGreaterThan(0);
  });
});
