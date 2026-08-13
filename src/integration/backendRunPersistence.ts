type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const BACKEND_RUN_KEY = 'hefei-backend-run-id-v1';

export function readBackendRunId(storage: Pick<StorageLike, 'getItem'>): string | null {
  const value = storage.getItem(BACKEND_RUN_KEY);
  return value && /^hefei-[a-z0-9-]+$/i.test(value) ? value : null;
}

export function writeBackendRunId(storage: Pick<StorageLike, 'setItem'>, runId: string): void {
  storage.setItem(BACKEND_RUN_KEY, runId);
}

export function clearBackendRunId(storage: Pick<StorageLike, 'removeItem'>): void {
  storage.removeItem(BACKEND_RUN_KEY);
}
