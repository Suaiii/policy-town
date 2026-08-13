"""合肥产业投资推演契约 v0.1。

本契约独立于就业政策 Snapshot v1.2。前端、Agent 与规则引擎只通过这里的
结构交换数据，避免两个产品域互相污染字段。
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

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


class NegotiationChoice(BaseModel):
    """玩家在企业回应后作出的最终协商选择；PlayerAction 保存最终同意条款。"""

    company_id: str
    proposal_id: str | None = None
    resolution: Literal["accept", "accept_counteroffer", "reject"] = "accept"


class AutonomousGovernmentDecision(BaseModel):
    """盲推演中政府 Agent 独立作出的最终决策。

    与 Replay 对账相反：不读取真实政府动作，只在四部门初审、部门质询、
    联席会议双方案与企业回应的基础上，由 LLM 独立选择方案与接受/拒绝。
    """

    company_id: str
    stage_id: StageId
    proposal_id: str
    resolution: Literal["accept", "accept_counteroffer", "reject"] = "accept"
    reasoning: str
    evidence_ids: list[str] = Field(default_factory=list)
    generation_mode: Literal["model", "deterministic_fallback"] = "deterministic_fallback"
    fallback_reason: str | None = None


class StageInput(BaseModel):
    run_id: str
    stage_id: StageId
    seed: int = 42
    context_mode: Literal["player", "audit", "replay"] = "audit"
    actions: list[PlayerAction] = Field(default_factory=list)
    negotiations: list[NegotiationChoice] = Field(default_factory=list)

    @model_validator(mode="after")
    def one_action_per_company(self) -> "StageInput":
        company_ids = [item.company_id for item in self.actions]
        if len(company_ids) != len(set(company_ids)):
            raise ValueError("each company can receive at most one player action per stage")
        negotiation_ids = [item.company_id for item in self.negotiations]
        if len(negotiation_ids) != len(set(negotiation_ids)):
            raise ValueError("each company can receive at most one negotiation choice per stage")
        rejected = {item.company_id for item in self.negotiations if item.resolution == "reject"}
        if rejected & set(company_ids):
            raise ValueError("rejected negotiation cannot include a funded player action")
        action_points = {item.company_id: item.capital_points for item in self.actions}
        for item in self.negotiations:
            if item.resolution in {"accept", "accept_counteroffer"}:
                if not item.proposal_id:
                    raise ValueError("accepted negotiation requires proposal_id")
                if item.company_id not in action_points:
                    raise ValueError("accepted negotiation requires a matching player action")
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
    capacity_evidence: list[dict] = Field(
        default_factory=list,
        description=(
            "项目级真实资本承诺或实缴证据；用于约束/校准区间，不等同于"
            "可自由支配财政余额，也不自动生成 new_fiscal_capacity"
        ),
    )

    @model_validator(mode="after")
    def assumption_is_honest(self) -> "FiscalBudgetAssumption":
        if self.value_type == "scenario_assumption" and self.source_ids:
            raise ValueError("scenario_assumption cannot claim source_ids for its numeric value")
        if self.data_attempt_status == "insufficient" and not self.missing_fields:
            raise ValueError("insufficient data status requires explicit missing_fields")
        for item in self.capacity_evidence:
            if not item.get("observation_id") or not item.get("interpretation"):
                raise ValueError("capacity_evidence requires observation_id and interpretation")
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


class EnterprisePrivateState(BaseModel):
    """企业 Agent 的私有决策底色；政府 Context 不得携带这些字段。"""

    company_id: str
    profile_version: str
    identity: str
    strategic_objectives: list[str]
    financial_private_state: str
    technology_private_state: str
    customer_private_state: str
    risk_preference: Literal["conservative", "balanced", "aggressive"]
    expansion_inertia: float = Field(ge=0, le=1)
    disclosure_boundary: list[str]
    stage_context: dict[StageId, str] = Field(default_factory=dict)
    source_class: Literal["scenario_assumption"] = "scenario_assumption"


class EnterpriseAgentIntent(BaseModel):
    company_id: str
    stage_id: StageId | None = None
    action: Literal["disclose", "range", "refuse", "exchange_condition"]
    statement: str
    requested_changes: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    rationale: str
    generation_mode: Literal["model", "deterministic_fallback"] = "deterministic_fallback"
    fallback_reason: str | None = None


class RealityGraphRecord(BaseModel):
    record_id: str
    run_id: str
    stage_id: StageId
    entity_id: str
    record_type: Literal["fact", "event", "relationship", "commitment", "outcome"]
    subject: str
    predicate: str
    object_value: str
    visibility: Literal["government", "enterprise", "both", "replay"]
    status: Literal["observed", "derived", "simulated", "withheld"]
    evidence_ids: list[str] = Field(default_factory=list)
    available_at: str


class RealityGraph(BaseModel):
    graph_id: str
    run_id: str
    records: list[RealityGraphRecord] = Field(default_factory=list)
    latest_stage: StageId


class EnterpriseBeliefState(BaseModel):
    company_id: str
    run_id: str
    stage_id: StageId
    market_outlook: float = Field(ge=0, le=1)
    financing_continuity: float = Field(ge=0, le=1)
    delivery_feasibility: float = Field(ge=0, le=1)
    government_follow_through: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    update_reasons: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)


class EnterpriseMemoryState(BaseModel):
    """每个 run_id/企业独立的可变认知状态；不进入政府部门 Brief。"""

    memory_id: str
    run_id: str
    company_id: str
    profile_version: str
    current_stage: StageId
    private_state: EnterprisePrivateState
    beliefs: EnterpriseBeliefState
    intent_history: list[EnterpriseAgentIntent] = Field(default_factory=list)
    observed_commitment_ids: list[str] = Field(default_factory=list)
    graph_record_ids: list[str] = Field(default_factory=list)
    last_update_reason: str = "initialization"


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


DepartmentId = Literal[
    "finance",
    "industry_information",
    "science_technology",
    "development_reform",
]
Recommendation = Literal["support", "conditional_support", "defer", "oppose"]


class DepartmentMemo(BaseModel):
    memo_id: str
    department: DepartmentId
    company_id: str
    recommendation: Recommendation
    core_claim: str
    supporting_evidence_ids: list[str]
    opposing_evidence_ids: list[str] = Field(default_factory=list)
    assumptions: list[str]
    missing_information: list[str]
    red_lines: list[str]
    acceptable_conditions: list[str]
    confidence: float = Field(ge=0, le=1)
    most_important_risk: str
    input_hash: str
    generation_mode: Literal["model", "deterministic_fallback"] = "deterministic_fallback"
    fallback_reason: str | None = None

    @model_validator(mode="after")
    def claim_is_traceable(self) -> "DepartmentMemo":
        if not self.supporting_evidence_ids and not self.missing_information:
            raise ValueError("department memo needs evidence or an explicit information gap")
        return self


class DepartmentBrief(BaseModel):
    """政府四部门的冻结输入。

    部门只能读取 visible_evidence_ids 中的证据；工具仅提供只读查询，
    不能生成或修改财政点数、企业财务与建设进度。
    """

    brief_id: str
    run_id: str
    stage_id: StageId
    cutoff_at: str
    seed: int
    department: DepartmentId
    company_id: str
    context_hash: str
    visible_evidence_ids: list[str]
    department_kpis: list[str]
    red_lines: list[str]
    allowed_tools: list[
        Literal["read_frozen_context", "read_source_metadata", "read_missing_information"]
    ]
    missing_information: list[str]
    # Human-readable facts are copied from the frozen context for an external
    # model provider. They are advisory text only; all cited IDs remain checked
    # against visible_evidence_ids and the rule engine owns numeric settlement.
    visible_facts: list[str] = Field(default_factory=list)
    state_summary: str = ""


class DepartmentChallenge(BaseModel):
    challenge_id: str
    company_id: str
    from_department: DepartmentId
    to_department: DepartmentId
    topic: str
    disputed_claim: str
    question: str
    evidence_ids: list[str]
    response: str
    stance_before: Recommendation
    stance_after: Recommendation
    added_condition: str | None = None
    status: Literal["answered", "insufficient_evidence"]
    generation_mode: Literal["model", "deterministic_fallback"] = "deterministic_fallback"
    fallback_reason: str | None = None


class MeetingProposal(BaseModel):
    proposal_id: str
    company_id: str
    label: str
    recommendation: Recommendation
    capital_points: int = Field(ge=0, le=100)
    support_focus: SupportFocus | None = None
    tranches: list[int] = Field(default_factory=list)
    conditions: list[str]
    exit_condition: str | None = None
    rationale: str
    supporting_departments: list[DepartmentId]
    dissenting_departments: list[DepartmentId] = Field(default_factory=list)

    @model_validator(mode="after")
    def tranches_reconcile(self) -> "MeetingProposal":
        if self.tranches and sum(self.tranches) != self.capital_points:
            raise ValueError("proposal tranches must sum to capital_points")
        return self


class JointMeetingSummary(BaseModel):
    company_id: str
    consensus: list[str]
    unresolved_disagreements: list[str]
    critical_question: str
    challenges: list[DepartmentChallenge]
    proposals: list[MeetingProposal] = Field(min_length=2)
    minority_opinions: list[str]
    evidence_ids: list[str]


class EnterpriseResponse(BaseModel):
    company_id: str
    proposal_id: str | None = None
    response_type: Literal["accept", "counteroffer", "reject", "no_offer"]
    resolution: Literal["accepted", "accepted_as_modified", "rejected", "not_applicable"]
    requested_capital_points: int = Field(ge=0, le=100)
    agreed_capital_points: int = Field(0, ge=0, le=100)
    accepted_conditions: list[str]
    requested_changes: list[str]
    rationale: str
    evidence_ids: list[str]

    @model_validator(mode="after")
    def agreed_amount_matches_resolution(self) -> "EnterpriseResponse":
        if self.resolution in {"rejected", "not_applicable"} and self.agreed_capital_points:
            raise ValueError("unsettled enterprise response cannot have agreed capital")
        if self.resolution == "accepted_as_modified" and (
            self.agreed_capital_points != self.requested_capital_points
        ):
            raise ValueError("accepted counteroffer must use the requested capital amount")
        return self


class VerificationQuestionCard(BaseModel):
    question_id: str
    company_id: str
    critical_proposition: str
    question: str
    requested_fields: list[str]
    known_evidence_ids: list[str]
    missing_information: list[str]


class EnterpriseDisclosure(BaseModel):
    question_id: str
    company_id: str
    response_type: Literal["disclose", "range", "refuse", "exchange_condition"]
    statement: str
    disclosed_evidence_ids: list[str]
    missing_information: list[str]
    exchange_condition: str | None = None


class GovernmentConditionSheet(BaseModel):
    sheet_id: str
    company_id: str
    proposal_id: str
    action: InvestmentActionType
    capital_points: int = Field(ge=0, le=100)
    support_focus: SupportFocus | None = None
    tranches: list[int] = Field(default_factory=list)
    risk_conditions: list[str]
    exit_condition: str | None = None

    @model_validator(mode="after")
    def condition_sheet_reconciles(self) -> "GovernmentConditionSheet":
        if self.tranches and sum(self.tranches) != self.capital_points:
            raise ValueError("condition sheet tranches must sum to capital_points")
        return self


class EnterpriseCounteroffer(BaseModel):
    company_id: str
    proposal_id: str
    requested_capital_points: int = Field(ge=0, le=100)
    requested_changes: list[str]
    rationale: str


class NegotiationEvent(BaseModel):
    sequence: int = Field(ge=1)
    phase: Literal[
        "verification_question",
        "enterprise_disclosure",
        "government_condition",
        "enterprise_counteroffer",
        "final_commitment",
        "rule_settlement",
    ]
    actor: Literal["government", "company", "rule_engine"]
    summary: str
    evidence_ids: list[str] = Field(default_factory=list)


class DeliberationRound(BaseModel):
    company_id: str
    department_inputs: list[DepartmentBrief] = Field(min_length=4, max_length=4)
    department_memos: list[DepartmentMemo] = Field(min_length=4, max_length=4)
    meeting: JointMeetingSummary
    verification_question: VerificationQuestionCard
    enterprise_disclosure: EnterpriseDisclosure
    enterprise_intent: EnterpriseAgentIntent | None = None
    selected_proposal_id: str | None = None
    condition_sheet: GovernmentConditionSheet | None = None
    enterprise_counteroffer: EnterpriseCounteroffer | None = None
    enterprise_response: EnterpriseResponse
    negotiation_log: list[NegotiationEvent]

    @model_validator(mode="after")
    def deliberation_is_consistent(self) -> "DeliberationRound":
        expected_departments = {
            "finance",
            "industry_information",
            "science_technology",
            "development_reform",
        }
        brief_departments = {item.department for item in self.department_inputs}
        memo_departments = {item.department for item in self.department_memos}
        if brief_departments != expected_departments or memo_departments != expected_departments:
            raise ValueError("deliberation requires exactly four distinct government departments")
        if any(item.company_id != self.company_id for item in self.department_inputs):
            raise ValueError("department brief company must match deliberation company")
        if any(item.company_id != self.company_id for item in self.department_memos):
            raise ValueError("department memo company must match deliberation company")
        briefs = {item.department: item for item in self.department_inputs}
        for memo in self.department_memos:
            brief = briefs[memo.department]
            if memo.input_hash != brief.context_hash:
                raise ValueError("department memo must use its frozen brief context")
            if not set(memo.supporting_evidence_ids) <= set(brief.visible_evidence_ids):
                raise ValueError("department memo cites evidence outside its frozen brief")

        proposals = {item.proposal_id: item for item in self.meeting.proposals}
        if self.selected_proposal_id is None:
            if self.condition_sheet is not None or self.enterprise_counteroffer is not None:
                raise ValueError("unselected deliberation cannot contain negotiated terms")
        elif self.selected_proposal_id not in proposals:
            raise ValueError("selected proposal must belong to the joint meeting")
        if self.condition_sheet is not None:
            if self.condition_sheet.proposal_id != self.selected_proposal_id:
                raise ValueError("condition sheet must correspond to the selected proposal")
            if self.condition_sheet.company_id != self.company_id:
                raise ValueError("condition sheet company must match deliberation company")
            if (
                self.condition_sheet.capital_points
                != self.enterprise_response.agreed_capital_points
            ):
                raise ValueError("condition sheet must use the final agreed capital amount")
        if self.enterprise_counteroffer is not None:
            if self.enterprise_counteroffer.proposal_id != self.selected_proposal_id:
                raise ValueError("enterprise counteroffer must modify the selected proposal")
            if self.enterprise_counteroffer.company_id != self.company_id:
                raise ValueError("counteroffer company must match deliberation company")
        if self.enterprise_response.proposal_id != self.selected_proposal_id:
            raise ValueError("enterprise response must correspond to the selected proposal")
        if self.enterprise_response.resolution in {"accepted", "accepted_as_modified"}:
            if self.condition_sheet is None:
                raise ValueError("an agreement requires a final government condition sheet")
        elif self.condition_sheet is not None:
            raise ValueError("an unsettled negotiation cannot contain a final condition sheet")
        return self


class BeliefLedgerEntry(BaseModel):
    belief_id: str
    company_id: str
    belief_type: Literal[
        "market_outlook",
        "financing_continuity",
        "delivery_feasibility",
        "government_follow_through",
    ]
    value: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str]
    updated_at: StageId
    update_rule: str = "bounded_evidence_blend_v1"


class CommitmentLedgerEntry(BaseModel):
    commitment_id: str
    stage_id: StageId
    company_id: str
    party: Literal["government", "company"]
    promise: str
    due_stage: StageId | None = None
    condition: str
    status: Literal["pending", "fulfilled", "breached", "cancelled"] = "pending"
    evidence_ids: list[str]


class CommitmentFollowUp(BaseModel):
    follow_up_id: str
    commitment_id: str
    company_id: str
    due_stage: StageId
    party: Literal["government", "company"]
    promise: str
    status: Literal["fulfilled", "breached", "evidence_insufficient"]
    observed_value: int | None = None
    threshold: int | None = None
    explanation: str
    evidence_ids: list[str] = Field(default_factory=list)
    triggered_action: Literal[
        "release_next_tranche",
        "pause_follow_on",
        "restructure_or_exit_review",
        "request_evidence",
    ]


class TimelineEvent(BaseModel):
    sequence: int = Field(ge=1)
    stage_id: StageId
    cutoff_at: str
    event_type: Literal[
        "follow_up",
        "government_knowledge",
        "government_concern",
        "enterprise_response",
        "mutual_commitment",
        "stage_outcome",
    ]
    actor: Literal["system", "government", "company", "both", "rule_engine"]
    title: str
    summary: str
    company_id: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)


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


class EvidenceFilterDecision(BaseModel):
    evidence_id: str
    evidence_kind: Literal["observation", "policy", "event", "milestone"]
    title: str
    effective_date: str
    information_available_date: str | None = None
    cutoff_at: str
    decision: Literal["visible", "withheld"]
    reason_code: Literal[
        "available_at_cutoff",
        "published_after_cutoff",
        "missing_available_date",
        "withheld_outcome",
        "verification_incomplete",
    ]
    source_id: str | None = None


class FrozenContextAudit(BaseModel):
    stage_id: StageId
    cutoff_at: str
    mode: Literal["player", "audit", "replay"]
    visible_evidence_ids: list[str]
    decisions: list[EvidenceFilterDecision]
    context_hash: str


class StageAudit(BaseModel):
    stage_id: StageId
    cutoff_at: str
    player_actions: dict[str, str] = Field(default_factory=dict)
    company_actions: dict[str, str]
    company_statuses: dict[str, str]
    construction_progress: dict[str, int]
    financial_health: dict[str, int]
    supply_pressure: dict[str, int]
    city_metrics: CityMetrics
    evidence_backed_deltas: int = Field(ge=0)
    total_deltas: int = Field(ge=0)
    future_evidence_count: int = Field(ge=0)
    follow_ups: list[CommitmentFollowUp] = Field(default_factory=list)
    timeline_events: list[TimelineEvent] = Field(default_factory=list)


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
    belief_ledger: list[BeliefLedgerEntry] = Field(default_factory=list)
    commitment_ledger: list[CommitmentLedgerEntry] = Field(default_factory=list)
    reality_graph: RealityGraph
    enterprise_memories: list[EnterpriseMemoryState] = Field(default_factory=list)
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
    deliberations: list[DeliberationRound] = Field(default_factory=list)
    belief_updates: list[BeliefLedgerEntry] = Field(default_factory=list)
    commitment_updates: list[CommitmentLedgerEntry] = Field(default_factory=list)
    reality_graph_updates: list[RealityGraphRecord] = Field(default_factory=list)
    enterprise_memory_updates: list[EnterpriseMemoryState] = Field(default_factory=list)
    commitment_follow_ups: list[CommitmentFollowUp] = Field(default_factory=list)
    timeline_events: list[TimelineEvent] = Field(default_factory=list)
    state_deltas: list[StateDelta]
    events: list[HistoricalEvent]
    evidence_refs: list[EvidenceRef]
    real_data_context: RealDataContext | None = None
    frozen_context_audit: FrozenContextAudit | None = None
    model_runtime: dict[str, str] = Field(default_factory=dict)
    next_candidates: list[str]
    next_state: SimulationState


class BaselineFieldComparison(BaseModel):
    field: str
    status: Literal["match", "mismatch", "partial", "not_evaluable"]
    baseline_value: Any
    simulated_value: Any = None
    reason: str


class DecisionBaselineReconciliation(BaseModel):
    baseline_id: str
    case_id: str
    stage_id: StageId
    baseline_completeness: float = Field(ge=0, le=1)
    action_match: bool
    timing_match: bool
    milestone_sequence_status: Literal["match", "mismatch", "partial", "not_evaluable"]
    capital_match_status: Literal["match", "mismatch", "partial", "not_evaluable"]
    condition_match_status: Literal["match", "mismatch", "partial", "not_evaluable"]
    comparisons: list[BaselineFieldComparison]
    limitations: list[str] = Field(default_factory=list)


class OutcomeForecast(BaseModel):
    """一个历史案例的概率化结局预测：截止日前信念 → P(success)。"""

    case_id: str
    company_id: str
    cutoff_at: str
    p_success: float = Field(ge=0, le=1)
    predicted_direction: Literal["success", "failure"]
    ground_truth: Literal["success", "failure", "unknown"]
    evidence_ids: list[str] = Field(default_factory=list)
    signal_breakdown: dict[str, float] = Field(default_factory=dict)
    basis: str
    is_correct_direction: bool | None = None
    brier_contribution: float | None = None


class OutcomePredictionReport(BaseModel):
    """概率预测评估报告：Brier / log-loss / ECE / AUC / 方向命中率。

    用判断账（belief ledger）给出的 P(success) 对标 case_library 真实结局，
    衡量预测的校准质量与判别能力。案例数不足时指标仅具示意性。
    """

    brier_score: float | None = None
    log_loss: float | None = None
    expected_calibration_error: float | None = None
    roc_auc: float | None = None
    direction_accuracy: float | None = None
    calibrated_case_count: int = Field(0, ge=0)
    leakage_passed: bool = True
    score_basis: dict[str, str] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)
    forecasts: list[OutcomeForecast] = Field(default_factory=list)


class ReplayScores(BaseModel):
    direction_score: float = Field(ge=0, le=1)
    sequence_score: float = Field(ge=0, le=1)
    mechanism_score: float = Field(ge=0, le=1)
    path_feedback_score: float = Field(ge=0, le=1)
    leakage_audit_passed: bool
    calibrated_case_count: int = Field(ge=0)
    score_basis: dict[str, str]
    decision_baselines: list[DecisionBaselineReconciliation] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    prediction: OutcomePredictionReport | None = None


class FinalResult(BaseModel):
    contract_version: str = CONTRACT_VERSION
    run_id: str
    portfolio_result: dict[str, int | float | str]
    historical_replay: ReplayScores
    replay_evidence: FrozenContextAudit | None = None
    branch_points: list[str]
    story_timeline: list[TimelineEvent] = Field(default_factory=list)
