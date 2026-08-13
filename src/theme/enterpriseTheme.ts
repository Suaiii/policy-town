import type { CSSProperties } from 'react';
import { PROJECT_VISUAL_PALETTES } from '../../packages/map-visuals/src/MapProjectLayer';
import type { EnterpriseId } from '../game/types';
import { ENTERPRISE_ARCHETYPES } from '../integration/mapAdapter';

export type EnterpriseTheme = {
  accent: string;
  primary: string;
};

export const ENTERPRISE_THEME_CONFIG = Object.fromEntries(
  (Object.keys(ENTERPRISE_ARCHETYPES) as EnterpriseId[]).map((id) => {
    const palette = PROJECT_VISUAL_PALETTES[ENTERPRISE_ARCHETYPES[id]];
    return [id, { accent: palette.accent, primary: palette.primary }];
  }),
) as Record<EnterpriseId, EnterpriseTheme>;

export function getEnterpriseTheme(id: EnterpriseId): EnterpriseTheme {
  return ENTERPRISE_THEME_CONFIG[id];
}

export function enterpriseThemeStyle(id: EnterpriseId): CSSProperties {
  const theme = getEnterpriseTheme(id);
  return {
    '--enterprise-accent': theme.accent,
    '--enterprise-primary': theme.primary,
  } as CSSProperties;
}
