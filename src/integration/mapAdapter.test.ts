import { describe, expect, it } from 'vitest';
import {
  enterApplications,
  finalizeNegotiation,
  initialState,
  openAllocation,
  openAnalysis,
  revealEvent,
  settleRound,
  submitDecision,
  startSimulation,
  toggleSupportTool,
  updateAllocation,
} from '../game/simulation';
import { simulationToMapSnapshot } from './mapAdapter';

describe('simulationToMapSnapshot', () => {
  it('publishes all competing projects as proposals before decisions', () => {
    const snapshot = simulationToMapSnapshot(startSimulation(initialState));

    expect(snapshot.schemaVersion).toBe('3.0');
    expect(snapshot.revision).toBe(0);
    expect(snapshot.projects).toHaveLength(2);
    expect(snapshot.projects.map((project) => project.stage)).toEqual(['proposal', 'proposal']);
    expect(snapshot.projects.map((project) => project.archetype)).toEqual([
      'heavy-manufacturing', 'energy-manufacturing',
    ]);
  });

  it('maps settled enterprise and city feedback without adding map-side business rules', () => {
    let state = openAllocation(openAnalysis(enterApplications(startSimulation(initialState))));
    state = updateAllocation(state, 'enterprise-a', 42);
    state = toggleSupportTool(state, 'enterprise-a', 'investment');
    state = toggleSupportTool(state, 'enterprise-a', 'infrastructure');
    state = finalizeNegotiation(state, 'enterprise-a', ['按建设里程碑分期拨付']);
    state = settleRound(revealEvent(submitDecision(state)));
    const snapshot = simulationToMapSnapshot(state);

    expect(snapshot.projects[0].stage).toBe('construction');
    expect(snapshot.revision).toBe(1);
    expect(snapshot.projects[0].builtProgress).toBeGreaterThan(0);
    expect(snapshot.projects[0].physicalAssets.assets).toHaveLength(1);
    expect(snapshot.projects[0].physicalAssets.assets[0].status).toBe('building');
    expect(snapshot.projects[0].delta.employment).toBe(12);
    expect(snapshot.projects[0].employment).toBeGreaterThan(12);
    expect(snapshot.city.fiscalPressure).toBe(42);
    expect(snapshot.city.logisticsIndex).toBeGreaterThan(0);
  });
});
