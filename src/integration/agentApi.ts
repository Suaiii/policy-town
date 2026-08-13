import { getEnterprise, stages } from '../game/scenario';
import type {
  AgentDepartmentReport,
  AgentFirmAction,
  AgentFirmRequest,
  AgentReview,
  EnterpriseId,
  SimulationState,
} from '../game/types';
import type { GraphSnapshot, SandboxEvent, SandboxEventInput } from '../../packages/events/src';

const BRIDGE_BASE = (import.meta.env.VITE_BRIDGE_URL as string | undefined) ?? 'http://localhost:5274';
const AGENT_TIMEOUT_MS = 220_000;

export type AgentHealth = {
  bridge: 'up' | 'down';
  agent?: {
    ready: boolean;
    stub: boolean;
    port: number;
  };
  error?: string;
};

export async function fetchAgentHealth(): Promise<AgentHealth> {
  try {
    const resp = await fetch(`${BRIDGE_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return { bridge: 'down', error: `http ${resp.status}` };
    return (await resp.json()) as AgentHealth;
  } catch {
    return { bridge: 'down', error: 'bridge 不可达' };
  }
}

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

export async function appendSandboxEvent(event: SandboxEventInput): Promise<boolean> {
  try {
    const resp = await fetch(`${BRIDGE_BASE}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return false;
  } catch {
    return false;
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('relationship-network:updated'));
    } catch {
      // Persistence already succeeded; a best-effort refresh must not trigger a duplicate submission.
    }
  }
  return true;
}

async function postAgent<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const resp = await fetch(`${BRIDGE_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

interface FirmRequestBody {
  firm: {
    id: string;
    alias: string;
    role: string;
    industry: string;
    background: string;
    product: string;
    technology: string;
    finance: string;
    execution: string;
    investment: string;
    cycle: string;
    evidenceStatus: string;
    metrics: SimulationState['enterprises'][number]['metrics'];
    profile: {
      request: number;
      requestedTools: string[];
    };
  };
  stage: { code: string; date: string; event: string };
  turn: string;
  city: { fiscal: number; industry: number; supplyChain: number; talent: number; infrastructure: number };
}

function firmRequestBody(state: SimulationState, id: EnterpriseId): FirmRequestBody {
  const profile = getEnterprise(id);
  const enterprise = state.enterprises.find((item) => item.id === id)!;
  const stage = {
    code: stageCode(state.stageIndex),
    date: stageDate(state.stageIndex),
    event: stageEvent(state.stageIndex),
  };
  return {
    firm: {
      id,
      alias: profile.alias,
      role: '决策负责人',
      industry: profile.industry,
      background: profile.background,
      product: profile.product,
      technology: profile.technology,
      finance: profile.finance,
      execution: profile.execution,
      investment: profile.investment,
      cycle: profile.cycle,
      evidenceStatus: profile.evidenceStatus,
      metrics: enterprise.metrics,
      profile: { request: profile.request, requestedTools: [...profile.requestedTools] },
    },
    stage,
    turn: stage.code,
    city: {
      fiscal: state.roundFiscalStart,
      industry: state.resources.industry,
      supplyChain: state.resources.supplyChain,
      talent: state.resources.talent,
      infrastructure: state.resources.infrastructure,
    },
  };
}

export async function fetchFirmRequests(state: SimulationState): Promise<Record<EnterpriseId, AgentFirmRequest> | null> {
  const results = await Promise.all(
    state.enterprises.map(async (enterprise) => {
      const id = enterprise.id;
      const resp = await postAgent<{ ok: boolean; request?: AgentFirmRequest }>('/api/agent/firm-request', firmRequestBody(state, id));
      if (!resp?.request) return [id, null] as const;
      return [id, { ...resp.request, source: 'llm' }] as const;
    }),
  );
  const out: Partial<Record<EnterpriseId, AgentFirmRequest>> = {};
  for (const [id, request] of results) {
    if (request) out[id] = request;
  }
  return Object.keys(out).length === state.enterprises.length ? (out as Record<EnterpriseId, AgentFirmRequest>) : null;
}

export async function fetchFirmResponses(state: SimulationState): Promise<Record<EnterpriseId, AgentFirmAction> | null> {
  const results = await Promise.all(
    state.enterprises.map(async (enterprise) => {
      const id = enterprise.id;
      const profile = getEnterprise(id);
      const base = firmRequestBody(state, id);
      const resp = await postAgent<{ ok: boolean; action?: { action: string; reason: string } }>('/api/agent/firm-response', {
        firm: base.firm,
        stage: base.stage,
        allocation: enterprise.allocation,
        tools: enterprise.supportTools,
        coverage: profile.request > 0 ? enterprise.allocation / profile.request : 0,
      });
      const action = resp?.action;
      if (!action) return [id, null] as const;
      return [id, { action: action.action as AgentFirmAction['action'], actionReason: action.reason }] as const;
    }),
  );
  const out: Partial<Record<EnterpriseId, AgentFirmAction>> = {};
  for (const [id, action] of results) {
    if (action) out[id] = action;
  }
  return Object.keys(out).length === state.enterprises.length ? (out as Record<EnterpriseId, AgentFirmAction>) : null;
}

export async function fetchGovReview(state: SimulationState): Promise<AgentReview | null> {
  const resp = await postAgent<{ ok: boolean; review?: AgentReview }>('/api/agent/gov-review', {
    city: '合肥',
    budget: state.roundFiscalStart,
    stage: { code: stageCode(state.stageIndex), date: stageDate(state.stageIndex), event: stageEvent(state.stageIndex) },
    firms: state.enterprises.map((enterprise) => {
      const profile = getEnterprise(enterprise.id);
      return {
        code: enterprise.code,
        request_amount: state.agentRequests?.[enterprise.id]?.amount ?? profile.request,
        profile: {
          alias: profile.alias,
          industry: profile.industry,
          investment: profile.investment,
          technology: profile.technology,
          finance: profile.finance,
          evidenceStatus: profile.evidenceStatus,
        },
      };
    }),
  });
  const review = resp?.review;
  if (!review) return null;
  const departments: AgentDepartmentReport[] = (review.departments ?? []).filter(
    (item): item is AgentDepartmentReport =>
      Boolean(item) && ['fiscal', 'industry', 'technology', 'market'].includes(item.dept),
  );
  return { ...review, departments, source: 'llm' };
}

function stageCode(index: number) {
  return stages[Math.min(index, stages.length - 1)].code;
}
function stageDate(index: number) {
  return stages[Math.min(index, stages.length - 1)].date;
}
function stageEvent(index: number) {
  return stages[Math.min(index, stages.length - 1)].event;
}
