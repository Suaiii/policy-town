import { describe, expect, it } from 'vitest';
import { getRoundLoopStep, getRoundLoopStepIndex } from './roundLoop';

describe('round loop presentation', () => {
  it('compresses technical phases into a four-step player loop', () => {
    expect(getRoundLoopStep('briefing')).toBe('assess');
    expect(getRoundLoopStep('applications')).toBe('assess');
    expect(getRoundLoopStep('analysis')).toBe('assess');
    expect(getRoundLoopStep('allocation')).toBe('decide');
    expect(getRoundLoopStep('response')).toBe('resolve');
    expect(getRoundLoopStep('settlement')).toBe('resolve');
    expect(getRoundLoopStep('feedback')).toBe('review');
    expect(getRoundLoopStepIndex('feedback')).toBe(3);
  });
});
