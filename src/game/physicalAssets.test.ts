import { describe, expect, it } from 'vitest';
import {
  applyConstruction,
  confirmQualifiedInvestment,
  createPhysicalAssetLedger,
} from './physicalAssets';

describe('physical asset ledger', () => {
  it('accumulates capital and only plans an asset after crossing the configured cost', () => {
    let ledger = createPhysicalAssetLedger(40);
    ledger = confirmQualifiedInvestment(ledger, 18, 'd1', 'S1');
    expect(ledger.assets).toHaveLength(0);
    expect(ledger.capitalRemainder).toBe(18);
    ledger = confirmQualifiedInvestment(ledger, 22, 'd2', 'S1');
    expect(ledger.assets).toHaveLength(1);
    expect(ledger.assets[0].status).toBe('planned');
  });

  it('is idempotent for the same decision id', () => {
    const first = confirmQualifiedInvestment(createPhysicalAssetLedger(25), 100, 'same', 'S1');
    const second = confirmQualifiedInvestment(first, 100, 'same', 'S1');
    expect(second).toEqual(first);
  });

  it('fills four horizontal slots before increasing target levels', () => {
    const horizontal = confirmQualifiedInvestment(createPhysicalAssetLedger(10), 40, 'd1', 'S1');
    expect(horizontal.assets).toHaveLength(4);
    expect(horizontal.assets.map((asset) => asset.targetLevel)).toEqual([1, 1, 1, 1]);
    const vertical = confirmQualifiedInvestment(horizontal, 10, 'd2', 'S2');
    expect(vertical.assets).toHaveLength(4);
    expect(vertical.assets.map((asset) => asset.targetLevel)).toEqual([2, 1, 1, 1]);
  });

  it('caps geometry at twelve equivalent units and reports overflow', () => {
    const ledger = confirmQualifiedInvestment(createPhysicalAssetLedger(10), 150, 'd1', 'S1');
    expect(ledger.assets).toHaveLength(4);
    expect(ledger.assets.every((asset) => asset.targetLevel === 3)).toBe(true);
    expect(ledger.overflowUnits).toBe(3);
  });

  it('allocates construction horizontally before vertical work and preserves abandoned structures', () => {
    const planned = confirmQualifiedInvestment(createPhysicalAssetLedger(10), 50, 'd1', 'S1');
    const built = applyConstruction(planned, 420, 'active');
    expect(built.assets.map((asset) => asset.currentLevel)).toEqual([1, 1, 1, 1]);
    expect(built.assets[0].workProgress).toBe(20);
    const exited = applyConstruction(built, 50, 'exited');
    expect(exited.assets.every((asset) => asset.status === 'abandoned')).toBe(true);
    expect(exited.assets.map((asset) => asset.currentLevel)).toEqual([1, 1, 1, 1]);
  });
});
