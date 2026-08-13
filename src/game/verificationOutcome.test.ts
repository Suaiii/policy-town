import { describe, expect, it } from 'vitest';
import { getEnterprise } from './scenario';
import {
  enterApplications,
  finalizeNegotiation,
  initialState,
  openAllocation,
  openAnalysis,
  revealEvent,
  settleRound,
  startSimulation,
  submitDecision,
  toggleSupportTool,
  updateAllocation,
} from './simulation';
import type { EnterpriseId } from './types';
import { compilePlayerDecisionPackages, compileVerificationOutcome } from './verificationOutcome';

describe('compileVerificationOutcome', () => {
  it('produces bounded deterministic terms without UI-side arithmetic', () => {
    const ids: EnterpriseId[] = ['enterprise-a', 'enterprise-b', 'enterprise-c'];

    for (const id of ids) {
      const profile = getEnterprise(id);
      const question = profile.negotiation.verificationQuestions[0].question;
      const first = compileVerificationOutcome(id, question);
      const second = compileVerificationOutcome(id, question);

      expect(second).toEqual(first);
      expect(first.fiscalOffer).toBeGreaterThan(0);
      expect(first.fiscalOffer).toBeLessThanOrEqual(profile.request);
      expect(first.tools.length).toBeGreaterThan(0);
      expect(first.tools.every((tool) => profile.requestedTools.includes(tool))).toBe(true);
      expect(first.conditions).toHaveLength(3);
    }
  });

  it('forms two executable packages for the player without editable parameters', () => {
    const profile = getEnterprise('enterprise-a');
    const packages = compilePlayerDecisionPackages('enterprise-a', profile.negotiation.verificationQuestions[0].question);

    expect(packages.map((item) => item.id)).toEqual(['prudent', 'progressive']);
    expect(packages[1].fiscalOffer).toBeGreaterThanOrEqual(packages[0].fiscalOffer);
    expect(packages.every((item) => item.tools.includes('investment'))).toBe(true);
    expect(packages.every((item) => item.fiscalOffer >= Math.ceil(profile.request * .65))).toBe(true);
    expect(packages.every((item) => item.conditions.length > 0)).toBe(true);
  });

  it('turns a selected package into a settled round with a visible construction asset', () => {
    const profile = getEnterprise('enterprise-b');
    const selectedPackage = compilePlayerDecisionPackages(
      'enterprise-b',
      profile.negotiation.verificationQuestions[0].question,
    )[0];
    let state = openAllocation(openAnalysis(enterApplications(startSimulation(initialState))));
    state = updateAllocation(state, 'enterprise-b', selectedPackage.fiscalOffer);
    for (const tool of selectedPackage.tools) state = toggleSupportTool(state, 'enterprise-b', tool);
    state = finalizeNegotiation(state, 'enterprise-b', selectedPackage.conditions);
    state = settleRound(revealEvent(submitDecision(state)));

    const enterprise = state.enterprises.find((item) => item.id === 'enterprise-b')!;
    expect(state.phase).toBe('feedback');
    expect(enterprise.physicalAssets.assets).toHaveLength(1);
    expect(enterprise.physicalAssets.assets[0].status).toBe('building');
    expect(enterprise.physicalAssets.constructionDelta).toBeGreaterThan(0);
  });
});
