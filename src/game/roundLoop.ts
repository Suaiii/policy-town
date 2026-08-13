import type { Phase } from './types';

export type RoundLoopStep = 'assess' | 'decide' | 'resolve' | 'review';

export const roundLoopSteps: Array<{ id: RoundLoopStep; label: string; hint: string }> = [
  { id: 'assess', label: '研判', hint: '看局势、比项目、找关键问题' },
  { id: 'decide', label: '决策', hint: '核验企业并提交条件单' },
  { id: 'resolve', label: '结果', hint: '观察企业行动与历史冲击' },
  { id: 'review', label: '复盘', hint: '确认变化并进入下一轮' },
];

const phaseStep: Record<Phase, RoundLoopStep> = {
  setup: 'assess',
  briefing: 'assess',
  applications: 'assess',
  analysis: 'assess',
  allocation: 'decide',
  response: 'resolve',
  settlement: 'resolve',
  feedback: 'review',
  result: 'review',
};

export function getRoundLoopStep(phase: Phase): RoundLoopStep {
  return phaseStep[phase];
}

export function getRoundLoopStepIndex(phase: Phase): number {
  return roundLoopSteps.findIndex((step) => step.id === getRoundLoopStep(phase));
}
