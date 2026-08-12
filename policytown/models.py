from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class Stage(str, Enum):
    ENVIRONMENT = "environment"
    DEPARTMENT_PROPOSALS = "department_proposals"
    CABINET_MEETING = "cabinet_meeting"
    FIRM_DECISIONS = "firm_decisions"
    WORKER_DECISIONS = "worker_decisions"
    SOCIAL_DIFFUSION = "social_diffusion"
    MARKET_SETTLEMENT = "market_settlement"
    METRICS_SETTLEMENT = "metrics_settlement"
    SNAPSHOT = "snapshot"


class ScenarioDefinition(BaseModel):
    id: str
    display_name: str
    description: str = ""
    data_dir: str
    status: Literal["ready", "planned"] = "ready"
    reference: bool = False
    policy_parameters: dict[str, Any] = Field(default_factory=dict)


class ScenarioManifest(BaseModel):
    version: str
    rounds: int = Field(8, ge=1)
    reference_scenario: str
    scenarios: list[ScenarioDefinition]


class RunRequest(BaseModel):
    scenario_id: str
    rounds: int | None = Field(None, ge=1)
    seed: int = 20260812
    mode: Literal["replay", "live"] = "replay"
    output_dir: str | None = None


class StageRecord(BaseModel):
    round: int
    stage: Stage
    provider: str
    payload: dict[str, Any] = Field(default_factory=dict)


class RunResult(BaseModel):
    run_id: str
    scenario_id: str
    mode: str
    seed: int
    snapshot_paths: list[str]
    records: list[StageRecord] = Field(default_factory=list)


class PolicyExtraction(BaseModel):
    layoff_threshold: int = 999
    compensation_multiple: str = "N+1"
    enforcement: float = Field(0.0, ge=0.0, le=1.0)
    skill_subsidy: float = Field(0.0, ge=0.0)
    hiring_subsidy: float = Field(0.0, ge=0.0)
    unmatched_clauses: list[str] = Field(default_factory=list)
    reasoning: str = ""


class DepartmentProposal(BaseModel):
    department: Literal["人社", "财政", "产业", "监管"]
    proposal: dict[str, Any]
    tradeoffs: list[str]
    worry: str
    reasoning: str


class RiskFinding(BaseModel):
    detector_id: str
    title: str
    severity: Literal["info", "warning", "critical"]
    summary: str
    evidence: dict[str, Any]
    confidence: Literal["L1", "L2", "L3"] = "L3"
    recommendation_id: str | None = None


class Recommendation(BaseModel):
    id: str
    title: str
    rationale: str
    parameter_patch: dict[str, Any]
    validation_metric: str
    target_scenario: str | None = None


class PolicyReport(BaseModel):
    scenario_id: str
    reference_scenario_id: str
    protected_groups: list[str]
    findings: list[RiskFinding]
    misleading_metrics: list[str]
    recommendations: list[Recommendation]
    limitations: list[str]
    comparison: dict[str, Any]


class FirmRealityRunRequest(BaseModel):
    output_dir: str = "data/run_firm_A_narrow"
    include_timeline: bool = True


class FirmRealityRunResult(BaseModel):
    status: Literal["pass", "fail"]
    comparison_path: str
    timeline_path: str | None = None
    report_path: str
    harness_path: str
    evidence_errors: list[str] = Field(default_factory=list)
    invariant_errors: list[str] = Field(default_factory=list)
