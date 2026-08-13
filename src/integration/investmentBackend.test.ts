import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectPolicyPackage, type BackendStage } from './investmentBackend';

const run: BackendStage = {
  run_id: 'hefei-test',
  stage_id: 'S1',
  cutoff_at: '2008-09-12',
  available_budget: 100,
  city_metrics: {},
  companies: [],
  completed_stages: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selectPolicyPackage', () => {
  it('submits a non-empty idempotency key when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ stage_id: 'S1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await selectPolicyPackage(run, 'company_a', 'proposal-a');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
