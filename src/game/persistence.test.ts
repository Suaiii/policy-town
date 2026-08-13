import { describe, expect, it } from 'vitest';
import { restoreSimulationState } from './persistence';
import { initialState, startSimulation } from './simulation';

describe('simulation save restoration', () => {
  it('falls back safely for malformed or unsupported saves', () => {
    expect(restoreSimulationState('{broken').phase).toBe('setup');
    expect(restoreSimulationState(JSON.stringify({ schemaVersion: 99 }))).toEqual(initialState);
  });

  it('migrates a legacy v1 save that predates the physical asset ledger', () => {
    const legacy = structuredClone(startSimulation(initialState)) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete legacy.facts;
    delete legacy.judgments;
    delete legacy.commitments;
    delete legacy.stageSnapshots;
    delete legacy.setupEnterpriseIds;
    for (const enterprise of legacy.enterprises as Array<Record<string, unknown>>) {
      delete enterprise.physicalAssets;
      delete enterprise.conditions;
      delete enterprise.negotiationFinalized;
    }

    const restored = restoreSimulationState(JSON.stringify(legacy));

    expect(restored.schemaVersion).toBe(2);
    expect(restored.phase).toBe('briefing');
    expect(restored.enterprises).toHaveLength(2);
    expect(restored.enterprises.every((enterprise) => enterprise.physicalAssets.assets.length === 0)).toBe(true);
    expect(restored.facts).toEqual([]);
  });

  it('preserves a valid current run', () => {
    const current = startSimulation(initialState, 20260813);
    expect(restoreSimulationState(JSON.stringify(current))).toEqual(current);
  });

  it('drops the third seat when restoring an old three-enterprise save', () => {
    const current = structuredClone(startSimulation(initialState));
    const thirdSeat = { ...structuredClone(current.enterprises[0]), id: 'enterprise-c', code: 'C' };
    const oldSave = {
      ...current,
      enterprises: [...current.enterprises, thirdSeat],
      setupEnterpriseIds: ['enterprise-a', 'enterprise-b', 'enterprise-c'],
      selectedEnterpriseId: 'enterprise-c',
    };

    const restored = restoreSimulationState(JSON.stringify(oldSave));

    expect(restored.enterprises.map((enterprise) => enterprise.id)).toEqual(['enterprise-a', 'enterprise-b']);
    expect(restored.setupEnterpriseIds).toEqual(['enterprise-a', 'enterprise-b']);
    expect(restored.selectedEnterpriseId).toBe('enterprise-a');
  });

  it('replaces a corrupt asset ledger before the map renderer can consume it', () => {
    const current = structuredClone(startSimulation(initialState));
    current.enterprises[0].physicalAssets.assets.push({
      id: 'corrupt',
      role: 'main',
      slotIndex: 9,
      currentLevel: 1,
      targetLevel: 1,
      workProgress: 0,
      status: 'complete',
      createdStage: 'S1',
      decisionId: 'corrupt',
    });

    const restored = restoreSimulationState(JSON.stringify(current));
    expect(restored.enterprises[0].physicalAssets.assets).toEqual([]);
  });
});
