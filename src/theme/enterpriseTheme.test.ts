import { describe, expect, it } from 'vitest';
import { randomEnterpriseIds } from '../game/simulation';
import { ENTERPRISE_THEME_CONFIG, getEnterpriseTheme } from './enterpriseTheme';

describe('enterprise theme configuration', () => {
  it('keeps a stable configured theme for every enterprise', () => {
    for (const id of Object.keys(ENTERPRISE_THEME_CONFIG) as Array<keyof typeof ENTERPRISE_THEME_CONFIG>) {
      expect(getEnterpriseTheme(id)).toBe(ENTERPRISE_THEME_CONFIG[id]);
      expect(getEnterpriseTheme(id).accent).toMatch(/^#/);
      expect(getEnterpriseTheme(id).primary).toMatch(/^#/);
    }
    expect(new Set(Object.values(ENTERPRISE_THEME_CONFIG).map((theme) => theme.accent)).size).toBe(3);
    expect(ENTERPRISE_THEME_CONFIG['enterprise-a'].accent).toBe('#b69ae3');
    expect(ENTERPRISE_THEME_CONFIG['enterprise-b'].accent).toBe('#e2b84f');
    expect(ENTERPRISE_THEME_CONFIG['enterprise-c'].accent).toBe('#69bde4');
  });

  it('does not bind theme identity to randomized assignment order', () => {
    const firstRun = randomEnterpriseIds(20260813);
    const secondRun = randomEnterpriseIds(20260814);

    for (const id of [...firstRun, ...secondRun]) {
      expect(getEnterpriseTheme(id)).toEqual(ENTERPRISE_THEME_CONFIG[id]);
    }
  });
});
