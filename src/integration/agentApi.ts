import type { GraphSnapshot, SandboxEvent } from '../../packages/events/src';

const BRIDGE_BASE = (import.meta.env.VITE_BRIDGE_URL as string | undefined) ?? 'http://localhost:5274';

export interface GraphResponse {
  ok: boolean;
  step: number;
  graph: GraphSnapshot;
}

export async function fetchGraph(step?: number): Promise<GraphResponse | null> {
  const query = step === undefined ? '' : `?step=${step}`;
  try {
    const resp = await fetch(`${BRIDGE_BASE}/api/graph${query}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    return (await resp.json()) as GraphResponse;
  } catch {
    return null;
  }
}

export async function fetchEvents(step?: number): Promise<SandboxEvent[] | null> {
  const query = step === undefined ? '' : `?step=${step}`;
  try {
    const resp = await fetch(`${BRIDGE_BASE}/api/events${query}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { ok: boolean; events?: SandboxEvent[] };
    return body.events ?? null;
  } catch {
    return null;
  }
}
