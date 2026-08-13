import { describe, expect, it } from 'vitest';
import { APPLICATION_DOSSIERS } from './applicationReview';
import { JOINT_REVIEWS } from './jointReview';
import { enterprises, getEnterprise } from './scenario';

describe('P04 adversarial joint-review contract', () => {
  it('provides the complete 4.1—4.4 structure for every enterprise', () => {
    for (const enterprise of enterprises) {
      const review = JOINT_REVIEWS[enterprise.id];
      expect(review.consensus).toBeTruthy();
      expect(review.disagreement).toBeTruthy();
      expect(review.unresolved).toBeTruthy();
      expect(review.recommendation).toBeTruthy();
      expect(review.minorityOpinion).toBeTruthy();
      expect(Object.keys(review.departments)).toEqual(['fiscal', 'industry', 'technology', 'market']);
      expect(review.options).toHaveLength(2);
      expect(review.challenges.length).toBeGreaterThan(0);
      expect(review.verificationCandidates).toHaveLength(3);
    }
  });

  it('keeps every department claim traceable and confidence bounded', () => {
    for (const review of Object.values(JOINT_REVIEWS)) {
      for (const department of Object.values(review.departments)) {
        expect(department.confidence).toBeGreaterThanOrEqual(0);
        expect(department.confidence).toBeLessThanOrEqual(100);
        expect(department.evidenceIds.length).toBeGreaterThan(0);
        for (const evidenceId of department.evidenceIds) {
          expect(APPLICATION_DOSSIERS[review.enterpriseId].evidenceIds).toContain(evidenceId);
        }
        expect(department.assumption).toBeTruthy();
        expect(department.redLine).toBeTruthy();
        expect(department.acceptableCondition).toBeTruthy();
      }
    }
  });

  it('only offers verification questions defined for the selected enterprise', () => {
    for (const review of Object.values(JOINT_REVIEWS)) {
      const allowed = getEnterprise(review.enterpriseId).negotiation.verificationQuestions.map((item) => item.question);
      expect(review.verificationCandidates.map((candidate) => candidate.question)).toEqual(allowed);
      expect(new Set(review.verificationCandidates.map((candidate) => candidate.id)).size).toBe(review.verificationCandidates.length);
    }
  });

  it('does not leak real-prototype reveal strings into P04 data', () => {
    const serialized = JSON.stringify(JOINT_REVIEWS);
    for (const enterprise of enterprises) expect(serialized).not.toContain(enterprise.reveal);
  });
});
