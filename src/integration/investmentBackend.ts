const API_BASE = (import.meta.env.VITE_INVESTMENT_API_URL as string | undefined) ?? '';

export type BackendCompany = {
  company_id: string;
  display_name: string;
  archetype: string;
  capital_request: number;
  status: string;
  construction_progress: number;
  employment?: number;
};

export type BackendStage = {
  run_id: string;
  stage_id: 'S1' | 'S2' | 'S3' | 'S4';
  cutoff_at: string;
  available_budget: number;
  city_metrics: Record<string, number>;
  companies: BackendCompany[];
  completed_stages: string[];
};

export type DepartmentMemo = {
  department: 'finance' | 'industry_information' | 'science_technology' | 'development_reform';
  recommendation: 'support' | 'conditional_support' | 'defer' | 'oppose';
  key_page: string;
  independent_view: string;
  confidence: number;
  most_important_risk: string;
  generation_mode: 'model' | 'deterministic_fallback';
};

export type PolicyPackage = {
  proposal_id: string;
  label: string;
  capital_points: number;
  tranches: number[];
  conditions: string[];
  exit_condition?: string;
  rationale: string;
  compiler_version: string;
  package_parameters: Record<string, string | number>;
};

export type Deliberation = {
  company_id: string;
  department_memos: DepartmentMemo[];
  meeting: {
    consensus: string[];
    unresolved_disagreements: string[];
    critical_question: string;
    recommendation_rationale: string;
    proposals: PolicyPackage[];
  };
  verification_question: { question: string; critical_proposition: string };
  enterprise_disclosure: { response_type: string; statement: string };
  department_review_updates: Array<{
    department: string;
    recommendation_before: string;
    recommendation_after: string;
    reason: string;
    key_page: string;
    independent_view: string;
    confidence: number;
    generation_mode: 'model' | 'deterministic_fallback';
  }>;
  model_runtime: {
    provider: string;
    all_departments_model_generated: boolean;
    enterprise_model_generated: boolean;
  };
};

export type BackendResult = {
  stage_id: string;
  budget: { before: number; spent: number; after: number };
  city_metrics: Record<string, number>;
  companies: BackendCompany[];
  company_actions: Array<{ company_id: string; action: string; milestone_target: string; risk_response: string }>;
  events: Array<{ description: string }>;
  commitment_updates: Array<{ company_id: string; promise: string; condition: string; status: string }>;
  settlement_trace: Array<{ step: string; label: string; detail: string }>;
  comparison_available_at: string;
};

export type HistoricalReplay = {
  run_id: string;
  portfolio_result: Record<string, number | string>;
  historical_replay: {
    direction_score: number;
    sequence_score: number;
    mechanism_score: number;
    path_feedback_score: number;
    leakage_audit_passed: boolean;
    calibrated_case_count: number;
    decision_baselines: Array<{
      baseline_id: string;
      case_id: string;
      stage_id: string;
      baseline_completeness: number;
      action_match: boolean;
      timing_match: boolean;
      milestone_sequence_status: string;
      capital_match_status: string;
      condition_match_status: string;
      limitations: string[];
    }>;
    limitations: string[];
  };
  replay_evidence?: {
    mode: string;
    visible_evidence_ids: string[];
    decisions: Array<{
      evidence_id: string;
      title: string;
      decision: string;
      reason_code: string;
      source_id?: string;
    }>;
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `后端请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const createBackendRun = () => request<BackendStage>('/api/runs', {
  method: 'POST',
  body: JSON.stringify({ company_ids: ['company_a', 'company_d'] }),
});

export const fetchDeliberation = (run: BackendStage, companyId: string) =>
  request<Deliberation>(`/api/runs/${run.run_id}/stages/${run.stage_id}/companies/${companyId}/deliberation`);

export const selectPolicyPackage = (run: BackendStage, companyId: string, proposalId: string) =>
  request<BackendResult>(`/api/runs/${run.run_id}/select-proposal`, {
    method: 'POST',
    body: JSON.stringify({
      stage_id: run.stage_id,
      company_id: companyId,
      proposal_id: proposalId,
      idempotency_key: crypto.randomUUID(),
    }),
  });

export const resumeBackendRun = (runId: string) => request<BackendStage>(`/api/runs/${runId}`);

export const fetchHistoricalReplay = (runId: string) =>
  request<HistoricalReplay>(`/api/runs/${runId}/historical-replay`);
