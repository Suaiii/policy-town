import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const tokens = read('../../public/design-system/glass-tokens.css');
const styles = read('../styles.css');
const app = read('../App.tsx');
const tableScene = read('../components/TableScene.tsx');
const pilotMarker = 'Main-sandbox hierarchy pilot';
const nextSectionMarker = 'Compact round loop';
const pilotStart = styles.indexOf(pilotMarker);
const pilotEnd = styles.indexOf(nextSectionMarker, pilotStart);
const pilotStyles = styles.slice(pilotStart, pilotEnd === -1 ? undefined : pilotEnd);

describe('main-sandbox design-system pilot', () => {
  it('keeps real information at 12px or above and reserves 11px for auxiliary roles', () => {
    expect(tokens).toContain('--pt-type-caption: 12px');
    expect(tokens).toContain('--pt-type-hint: 11px');
    expect(tokens).toContain('--pt-type-decorative: 11px');
    expect(tokens).toContain('--pt-tracking-decorative: .06em');
    expect(pilotStyles).not.toMatch(/font-size:\s*(?:[0-9](?:\.\d+)?|10(?:\.\d+)?)px/);
    expect(pilotStyles).not.toMatch(/Rajdhani|Georgia|Arial Narrow|ui-monospace/);
  });

  it('defines distinct notice, operation and outline-warning primitives', () => {
    expect(pilotStyles).toContain('.panel-heading-notice');
    expect(pilotStyles).toContain('.panel-heading-operation');
    expect(pilotStyles).toContain('.maw-glass-card.frame-tone-warning-outline');
    const warningRule = pilotStyles.match(/\.maw-glass-card\.frame-tone-warning-outline\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(warningRule).toContain('border: 1px solid var(--pt-color-danger-line)');
    expect(warningRule).not.toContain('gradient');
  });

  it('puts live broadcasts before secondary context and removes decorative header clutter', () => {
    expect(app).toContain('<PanelHeading variant="notice">阶段播报</PanelHeading>');
    expect(app).not.toContain('<PanelHeading index="01" kicker="EVENT INTELLIGENCE">阶段播报</PanelHeading>');
    expect(app.indexOf('event-feed-list')).toBeLessThan(app.indexOf('broadcast-context-anchor'));
  });

  it('keeps current-round resource evidence first and enterprise identity fields fixed', () => {
    expect(tableScene.indexOf('resource-hover-current')).toBeLessThan(tableScene.indexOf('{insight.definition}'));
    expect(tableScene).toContain('className="enterprise-code"');
    expect(tableScene).toContain('className="enterprise-industry"');
    expect(tableScene).toContain('className="enterprise-request"');
    expect(pilotStyles).toContain('.table-seat-plaque .enterprise-code');
    expect(pilotStyles).toContain('white-space: nowrap');
  });
});
