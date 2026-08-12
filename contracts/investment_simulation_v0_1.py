"""合肥产业投资推演契约 v0.1。

本契约独立于就业政策 Snapshot v1.2。前端、Agent 与规则引擎只通过这里的
结构交换数据，避免两个产品域互相污染字段。
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


CONTRACT_VERSION = "0.2"


class StageId(str, Enum):
    S1 = "S1"
    S2 = "S2"
    S3 = "S3"
    S4 = "S4"


class InvestmentActionType(str, Enum):
    INVEST = "invest"
    SUPPORT = "support"
    FOLLOW_ON = "follow_on"
    RESTRUCTURE = "restructure"
    EXIT = "exit"


class SupportFocus(str, Enum):
    INFRASTRUCTURE = "infrastructure"
    TALENT = "talent"
    SUPPLY_CHAIN = "supply_chain"
    FINANCING = "financing"


class CompanyStatus(str, Enum):
    BUILDING = "building"
    RAMPING = "ramping"
    UNDER_PRESSURE = "under_pressure"
    STALLED = "stalled"
    EXITED = "exited"


class CompanyActionType(str, Enum):
    EXPAND = "expand"
    RESEARCH = "research"
    FINANCE = "finance"
    SEEK_ORDERS = "seek_orders"
    CONTRACT = "contract"
    RELOCATE = "relocate"
    WAIT = "wait"


class Direction(str, Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class ValueType(str, Enum):
    OBSERVED = "observed"
    DERIVED = "derived"
    ORDINAL = "ordinal"
    MISSING = "missing"


class PlayerAction(BaseModel):
    company_id: str
    action: InvestmentActionType
    capital_points: int = Field(0, ge=0, le=100)
    support_focus: SupportFocus | None = None

    @model_validator(mode="after")
    def validate_action_shape(self) -> "PlayerAction":
        if self.action == InvestmentActionType.SUPPORT and self.support_focus is None:
            raise ValueError("support action requires support_focus")
        if self.action == InvestmentActionType.EXIT and self.capital_points != 0:
            raise ValueError("exit action cannot spend capital_points")
        return self


class StageInput(BaseModel):
    run_id: str
    stage_id: StageId
    seed: int = 42
    actions: list[PlayerAction] = Field(default_factory=list)

    @model_validator(mode="after")
    def one_action_per_company(self) -> "StageInput":
        company_ids = [item.company_id for item in self.actions]
        if len(company_ids) != len(set(company_ids)):
            raise ValueError("each company can receive at most one player action per stage")
        return self


class FiscalBudgetAssumption(BaseModel):
    """真实可投资财力不足时使用的显式玩法参数。"""

    assumption_id: str
    new_fiscal_capacity: int = Field(ge=0)
    value_type: Literal["scenario_assumption"] = "scenario_assumption"
    data_attempt_status: Literal["not_started", "in_progress", "insufficient", "calibrated"]
    calibration_status: Literal["uncalibrated", "partially_calibrated", "calibrated"]
    fallback_reason: str
    missing_fields: list[str]
    data_gap_ids: list[str]
    attempted_source_ids: list[str] = Field(
        default_factory=list,
        description="已经尝试获取、但不足以校准玩法点数的数据来源",
    )
    replacement_key: str
    gameplay_rationale: str
    source_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def assumption_is_honest(self) -> "FiscalBudgetAssumption":
        if self.value_type == "scenario_assumption" and self.source_ids:
            raise ValueError("scenario_assumption cannot claim source_ids for its numeric value")
        if self.data_attempt_status == "insufficient" and not self.missing_fields:
            raise ValueError("insufficient data status requires explicit missing_fields")
        return self


class BudgetState(BaseModel):
    before: int = Field(ge=0, description="扣除历史承诺与维护成本后的本轮可用余额")
    spent: int = Field(ge=0, description="本轮玩家实际投入")
    after: int = Field(ge=0, description="本轮投入后的余额")
    opening_balance: int = Field(0, ge=0, description="上一阶段结转余额")
    new_fiscal_capacity: int = Field(0, ge=0, description="本阶段由显式场景假设注入的新增点数")
    stage_budget: int = Field(0, ge=0, description="兼容字段，等于 new_fiscal_capacity，不是重置后的总上限")
    gross_resources: int = Field(0, ge=0, description="期初结余 + 新增财力 + 退出回收")
    exits_and_returns: int = Field(0, ge=0)
    committed_capital: int = Field(0, ge=0)
    maintenance_cost: int = Field(0, ge=0)
    carry_out: int = Field(0, ge=0, description="结转到下一阶段的余额，等于 after")
    assumption: FiscalBudgetAssumption

    @model_validator(mode="after")
    def points_reconcile(self) -> "BudgetState":
        if self.stage_budget != self.new_fiscal_capacity:
            raise ValueError("stage_budget must equal new_fiscal_capacity")
        if self.gross_resources != self.opening_balance + self.new_fiscal_capacity + self.exits_and_returns:
            raise ValueError("gross fiscal resources do not reconcile")
        expected_before = max(0, self.gross_resources - self.committed_capital - self.maintenance_cost)
        if self.before != expected_before:
            raise ValueError("available fiscal balance does not reconcile")
        if self.before - self.spent != self.after:
            raise ValueError("budget does not reconcile")
        if self.carry_out != self.after:
            raise ValueError("carry_out must equal after")
        return self


class CityMetrics(BaseModel):
    industrial_base: int = Field(ge=0, le=100)
    talent_supply: int = Field(ge=0, le=100)
    infrastructure_capacity: int = Field(ge=0, le=100)
    supply_chain_strength: int = Field(ge=0, le=100)
    policy_support: int = Field(ge=0, le=100)
    market_cycle: int = Field(ge=-100, le=100)
    employment_index: int = Field(ge=0, le=100)
    portfolio_public_value: int = Field(ge=0, le=100)


class CompanyState(BaseModel):
    company_id: str
    display_name: str
    archetype: str
    status: CompanyStatus
    capital_request: int = Field(ge=0, le=100)
    financial_health: int = Field(ge=0, le=100)
    execution_ability: int = Field(ge=0, le=100)
    technology_readiness: int = Field(ge=0, le=100)
    customer_order_strength: int = Field(ge=0, le=100)
    capital_intensity: int = Field(ge=0, le=100)
    construction_progress: int = Field(ge=0, le=100)
    production_ramp: int = Field(ge=0, le=100)
    project_cashflow: int = Field(ge=-100, le=100)
    supply_pressure: int = Field(ge=0, le=100)
    cumulative_support: int = Field(0, ge=0)
    missed_windows: int = Field(0, ge=0)
    synergy_sources: list[str] = Field(default_factory=list)


class KeyFactor(BaseModel):
    metric_id: str
    effect: Direction


class AgentAssessment(BaseModel):
    agent: Literal["fiscal", "industry", "technology", "market"]
    company_id: str
    direction: Direction
    score: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    key_factors: list[KeyFactor]
    evidence_ids: list[str]
    reasoning_summary: str


class CompanyAction(BaseModel):
    company_id: str
    action: CompanyActionType
    capital_request_next_round: int = Field(ge=0, le=100)
    resource_allocation: dict[str, float]
    milestone_target: str
    risk_response: str
    evidence_ids: list[str]
    confidence: float = Field(ge=0, le=1)


class StateDelta(BaseModel):
    entity_id: str
    metric_id: str
    before: int
    delta: int
    after: int
    reason_code: str
    input_metric_ids: list[str]
    evidence_ids: list[str]

    @model_validator(mode="after")
    def delta_reconciles(self) -> "StateDelta":
        if self.before + self.delta != self.after:
            raise ValueError("state delta does not reconcile")
        if not self.reason_code or not self.input_metric_ids:
            raise ValueError("state delta must be traceable")
        return self


class HistoricalEvent(BaseModel):
    event_id: str
    description: str
    affected_archetypes: list[str]
    direction: Direction
    magnitude: int = Field(ge=0, le=100)
    evidence_ids: list[str]


class EvidenceRef(BaseModel):
    evidence_id: str
    title: str
    as_of: str
    value_type: ValueType
    source_id: str
    available_at_cutoff: bool
    quality: Literal["A", "B", "C", "D"]
    confidence: float = Field(ge=0, le=1)


class RawObservation(BaseModel):
    observation_id: str
    entity_id: str
    indicator_id: str
    domain: Literal["world", "industry", "company", "project", "government", "talent", "infrastructure"]
    value: float | str | bool
    unit: str | None = None
    effective_date: str
    information_available_date: str
    source_id: str | None = None
    source_title: str | None = None
    source_url: str | None = None
    source_archived_path: str | None = None
    source_sha256: str | None = None
    source_retrieved_at: str | None = None
    quality: Literal["A", "B", "C", "D"]
    verification_status: Literal["verified", "provisional", "needs_verification"]
    notes: str | None = None


class ContextDerivation(BaseModel):
    """将真实观测转换成可运行指标时留下的可复核记录。"""

    entity_id: str
    metric_id: str
    value: int = Field(ge=-100, le=100)
    value_type: Literal["derived", "ordinal"]
    formula: str
    evidence_ids: list[str]
    confidence: float = Field(ge=0, le=1)


class RealDataContext(BaseModel):
    cutoff_at: str
    observations: list[RawObservation] = Field(default_factory=list)
    policies: list[dict] = Field(default_factory=list)
    events: list[dict] = Field(default_factory=list)
    derivations: list[ContextDerivation] = Field(default_factory=list)
    missing_domains: list[str] = Field(default_factory=list)
    database_path: str


class StageAudit(BaseModel):
    stage_id: StageId
    cutoff_at: str
    company_actions: dict[str, str]
    company_statuses: dict[str, str]
    construction_progress: dict[str, int]
    financial_health: dict[str, int]
    supply_pressure: dict[str, int]
    city_metrics: CityMetrics
    evidence_backed_deltas: int = Field(ge=0)
    total_deltas: int = Field(ge=0)
    future_evidence_count: int = Field(ge=0)


class SimulationState(BaseModel):
    run_id: str
    current_stage: StageId | None = None
    next_stage: StageId | None = StageId.S1
    seed: int = 42
    treasury_balance: int = Field(0, ge=0, description="上一阶段结转、可用于本阶段的财政点数")
    city_metrics: CityMetrics
    companies: list[CompanyState] = Field(min_length=2, max_length=3)
    committed_capital: int = Field(0, ge=0)
    maintenance_cost: int = Field(0, ge=0)
    exits_and_returns: int = Field(0, ge=0)
    completed_stages: list[StageId] = Field(default_factory=list)
    stage_audits: list[StageAudit] = Field(default_factory=list)


class StageResult(BaseModel):
    contract_version: str = CONTRACT_VERSION
    stage_id: StageId
    cutoff_at: str
    budget: BudgetState
    city_metrics: CityMetrics
    companies: list[CompanyState]
    company_actions: list[CompanyAction]
    agent_assessments: list[AgentAssessment]
    state_deltas: list[StateDelta]
    events: list[HistoricalEvent]
    evidence_refs: list[EvidenceRef]
    real_data_context: RealDataContext | None = None
    next_candidates: list[str]
    next_state: SimulationState


class ReplayScores(BaseModel):
    direction_score: float = Field(ge=0, le=1)
    sequence_score: float = Field(ge=0, le=1)
    mechanism_score: float = Field(ge=0, le=1)
    path_feedback_score: float = Field(ge=0, le=1)
    leakage_audit_passed: bool
    calibrated_case_count: int = Field(ge=0)
    score_basis: dict[str, str]
    limitations: list[str] = Field(default_factory=list)


class FinalResult(BaseModel):
    contract_version: str = CONTRACT_VERSION
    run_id: str
    portfolio_result: dict[str, int | float | str]
    historical_replay: ReplayScores
    branch_points: list[str]
