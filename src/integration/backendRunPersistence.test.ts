import { describe, expect, it } from 'vitest';
import { readBackendRunId, writeBackendRunId } from './backendRunPersistence';

describe('backend run persistence', () => {
  it('round-trips the server run id used to resume a saved simulation', () => {
    const storage = new Map<string, string>();
    const localStorageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    writeBackendRunId(localStorageLike, 'hefei-cloud-run');

    expect(readBackendRunId(localStorageLike)).toBe('hefei-cloud-run');
  });

  it('does not invent a run id when an older local-only save has none', () => {
    expect(readBackendRunId({ getItem: () => null })).toBeNull();
  });
});
