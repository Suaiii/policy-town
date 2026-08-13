import type { EnterpriseId } from './types';

export type RepresentativeGender = 'male' | 'female';

/** Stable left-to-right seating and identity order across every enterprise surface. */
export const ENTERPRISE_SEAT_ORDER: EnterpriseId[] = ['enterprise-a', 'enterprise-b', 'enterprise-c'];

export function enterpriseSeatIndex(id: EnterpriseId) {
  return ENTERPRISE_SEAT_ORDER.indexOf(id);
}

export function sortEnterpriseIdsBySeat(ids: EnterpriseId[]): EnterpriseId[] {
  return [...ids].sort((left, right) => enterpriseSeatIndex(left) - enterpriseSeatIndex(right));
}

export const ENTERPRISE_REPRESENTATIVE_CONFIG: Record<EnterpriseId, { gender: RepresentativeGender }> = {
  'enterprise-a': { gender: 'male' },
  'enterprise-b': { gender: 'female' },
  'enterprise-c': { gender: 'male' },
};
