import { describe, expect, it } from 'vitest';
import { APPLICATION_DOSSIERS, getComparisonRows } from './applicationReview';
import { createMockEventFeed } from './mockEventFeed';
import { getEnterprise, stages } from './scenario';
import { enterApplications, initialState, startSimulation } from './simulation';

describe('P03 adversarial information boundaries', () => {
  const applications = enterApplications(startSimulation(initialState, 20260814));

  it('provides comparable rows and explicit evidence gaps for every assigned enterprise', () => {
    for (const enterprise of applications.enterprises) {
      const dossier = APPLICATION_DOSSIERS[enterprise.id];
      expect(getComparisonRows(enterprise.id, 'overview')).toHaveLength(3);
      expect(getComparisonRows(enterprise.id, 'fiscal')).toHaveLength(3);
      expect(dossier.visibleSourceCount).toBeGreaterThan(0);
      expect(dossier.dataGaps.length).toBeGreaterThan(0);
      expect(dossier.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it('does not expose real-prototype reveal strings in P03 dossiers', () => {
    const serialized = JSON.stringify(APPLICATION_DOSSIERS);
    for (const enterprise of applications.enterprises) {
      expect(serialized).not.toContain(getEnterprise(enterprise.id).reveal);
    }
  });

  it('uses game dates and filters every broadcast within the active cutoff', () => {
    const cutoff = stages[applications.stageIndex].cutoff;
    const events = createMockEventFeed(applications);

    expect(events).toHaveLength(Math.min(6, applications.enterprises.length + 5));
    for (const event of events) {
      expect(event.logicalTime).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(event.availableAt <= cutoff).toBe(true);
      expect(event.cutoffDate).toBe(cutoff);
      expect(event.visibility).toBe('player_visible');
      expect(event.evidenceIds.length).toBeGreaterThan(0);
    }
  });
});
