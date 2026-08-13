import { stages } from './scenario';
import type { SimulationState } from './types';

export function createDecisionReviewExport(state: SimulationState) {
  return {
    schemaVersion: 'hefei-decision-review/1.0',
    exportedAt: new Date().toISOString(),
    runId: state.runId,
    assignment: {
      mode: 'seeded-random' as const,
      seed: state.setupRandomSeed,
    },
    selectedCases: [...state.setupEnterpriseIds],
    startStage: stages[state.setupStartStage].code,
    stageSnapshots: structuredClone(state.stageSnapshots),
    facts: structuredClone(state.facts),
    judgments: structuredClone(state.judgments),
    commitments: structuredClone(state.commitments),
    replay: {
      stagesCompleted: state.stageSnapshots.map((snapshot) => snapshot.stageCode),
      finalResources: { ...state.resources },
      scoringPolicy: ['direction', 'timing', 'mechanism', 'path-feedback'],
    },
    leakageAudit: {
      futureEvidenceCount: state.facts.filter((fact) => fact.visibility === 'unavailable').length,
      privatePromptIncluded: false,
      privateEnterpriseStateIncluded: false,
    },
  };
}
