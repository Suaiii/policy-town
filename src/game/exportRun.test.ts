import { describe, expect, it } from 'vitest';
import { createDecisionReviewExport } from './exportRun';
import { initialState, startSimulation } from './simulation';

describe('decision review export', () => {
  it('exports only the public audit shape and never includes prompts or private enterprise state', () => {
    const output = createDecisionReviewExport(startSimulation(initialState, 20260813));
    const serialized = JSON.stringify(output);
    expect(output.schemaVersion).toBe('hefei-decision-review/1.0');
    expect(output.leakageAudit.privatePromptIncluded).toBe(false);
    expect(output.assignment).toEqual({ mode: 'seeded-random', seed: 20260813 });
    expect(serialized).not.toContain('prompt');
    expect(serialized).not.toContain('privateState');
  });
});
