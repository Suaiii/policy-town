from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


Confidence = Literal["L1", "L2", "L3"]
Provenance = Literal["public_fact", "mechanism", "scenario_assumption", "rule_result"]


class EvidenceRef(BaseModel):
    id: str
    provenance: Provenance
    confidence: Confidence


class FirmIntent(BaseModel):
    model_config = {"extra": "forbid"}
    strategy_priority: Literal["ai_reorganization"] = "ai_reorganization"
    layoff_direction: Literal["reduce", "maintain", "expand"] = "maintain"
    internal_transfer_direction: Literal["reduce", "maintain", "expand"] = "expand"
    relocation_direction: Literal["none", "offer"] = "offer"
    outsource_direction: Literal["reduce", "moderate", "expand"] = "moderate"
    magnitude: Literal["small", "moderate", "large"] = "moderate"
    reasoning_summary: str
    worry: str


class FirmProfile(BaseModel):
    firm_id: Literal["A"] = "A"
    archetype: Literal["platform_product_company"] = "platform_product_company"
    calibration_case: str
    affected_workers: int = Field(1200, ge=1)
    ai_transition_pressure: float = Field(.8, ge=0, le=1)
    internal_transfer_capacity: int = Field(0, ge=0)
    skill_match_rate: float = Field(.45, ge=0, le=1)
    relocation_acceptance: float = Field(.55, ge=0, le=1)
    outsource_capacity: int = Field(0, ge=0)
    relocation_support: bool = False
    government_bridge_capacity: int = Field(0, ge=0)


class PolicyTools(BaseModel):
    training_match_lift: float = Field(0, ge=0, le=1)
    relocation_acceptance_lift: float = Field(0, ge=0, le=1)
    bridge_capacity: int = Field(0, ge=0)
    training_months: int = Field(0, ge=0)
    relocation_lead_months: int = Field(0, ge=0)
    bridge_start_month: int = Field(0, ge=0)


class FirmSettlement(BaseModel):
    scenario_id: Literal["A0", "A1", "A2", "A3"]
    affected_workers: int
    transfer_eligible: int
    internal_transfer_accepted: int
    relocation_declined: int
    channel_outsource: int
    government_bridged: int
    layoff_formal: int
    net_unemployment: int
    workers_waiting_for_training: int = 0
    workers_without_savings_buffer: int = 0
    timing_gap_months: int = 0
    evidence_chain: list[EvidenceRef]

    @model_validator(mode="after")
    def totals_reconcile(self) -> "FirmSettlement":
        settled = self.internal_transfer_accepted + self.channel_outsource + self.government_bridged + self.layoff_formal
        if settled != self.affected_workers:
            raise ValueError(f"settlement does not reconcile: {settled} != {self.affected_workers}")
        if self.net_unemployment != self.layoff_formal:
            raise ValueError("net_unemployment must equal layoff_formal in the narrow scenario")
        return self


class DecisionTrace(BaseModel):
    profile: FirmProfile
    intent: FirmIntent
    tools: PolicyTools
    settlement: FirmSettlement
    limitations: list[str]


@dataclass(frozen=True)
class ScenarioSpec:
    id: Literal["A0", "A1", "A2", "A3"]
    transfer_offered: bool
    relocation_support: bool
    government_bridge: bool


SCENARIOS = (
    ScenarioSpec("A0", False, False, False),
    ScenarioSpec("A1", True, False, False),
    ScenarioSpec("A2", True, True, False),
    ScenarioSpec("A3", True, True, True),
)


class RuleLedger:
    """The only component allowed to turn firm intent into headcounts."""

    def settle(self, profile: FirmProfile, spec: ScenarioSpec, tools: PolicyTools | None = None) -> FirmSettlement:
        tools = tools or PolicyTools()
        total = profile.affected_workers
        capacity = min(profile.internal_transfer_capacity, total) if spec.transfer_offered else 0
        match_rate = min(1.0, profile.skill_match_rate + tools.training_match_lift)
        eligible = round(capacity * match_rate)
        relocation_rate = profile.relocation_acceptance
        if spec.relocation_support:
            relocation_rate = min(1.0, relocation_rate + tools.relocation_acceptance_lift)
        accepted = round(eligible * relocation_rate)
        relocation_declined = eligible - accepted
        remaining = total - accepted
        outsourced = min(profile.outsource_capacity, remaining)
        remaining -= outsourced
        bridged = min(profile.government_bridge_capacity + tools.bridge_capacity, remaining) if spec.government_bridge else 0
        formal = remaining - bridged
        return FirmSettlement(
            scenario_id=spec.id,
            affected_workers=total,
            transfer_eligible=eligible,
            internal_transfer_accepted=accepted,
            relocation_declined=relocation_declined,
            channel_outsource=outsourced,
            government_bridged=bridged,
            layoff_formal=formal,
            net_unemployment=formal,
            evidence_chain=[
                EvidenceRef(id="fact:internal_mobility_offer", provenance="public_fact", confidence="L2"),
                EvidenceRef(id="mechanism:internal_mobility_buffer", provenance="mechanism", confidence="L2"),
                EvidenceRef(id=f"assumption:{spec.id}", provenance="scenario_assumption", confidence="L3"),
                EvidenceRef(id=f"rule:firm_settlement_v1:{spec.id}", provenance="rule_result", confidence="L3"),
            ],
        )


def default_profile() -> FirmProfile:
    return FirmProfile(
        calibration_case="tencent_docs_2026_regional_adjustment",
        affected_workers=1200,
        internal_transfer_capacity=700,
        skill_match_rate=.46,
        relocation_acceptance=.52,
        outsource_capacity=180,
        government_bridge_capacity=160,
    )


def default_intent() -> FirmIntent:
    return FirmIntent(
        reasoning_summary="AI 产品协同目标保持不变，先以内部转岗吸收，再处理无法匹配或无法迁移的岗位。",
        worry="传统技能与 AI 岗位不匹配，且跨城迁移会降低内部转岗接受率。",
    )


def run_comparison(output: str | Path | None = None) -> list[DecisionTrace]:
    profile, intent, ledger = default_profile(), default_intent(), RuleLedger()
    traces = []
    for spec in SCENARIOS:
        tools = PolicyTools(
            training_match_lift=.12 if spec.id == "A3" else 0,
            relocation_acceptance_lift=.18 if spec.relocation_support else 0,
            bridge_capacity=80 if spec.government_bridge else 0,
            training_months=4 if spec.id == "A3" else 0,
            relocation_lead_months=2 if spec.relocation_support else 0,
            bridge_start_month=3 if spec.government_bridge else 0,
        )
        settlement = ledger.settle(profile, spec, tools)
        if spec.id == "A3":
            settlement.workers_waiting_for_training = round(profile.internal_transfer_capacity * tools.training_match_lift)
            settlement.workers_without_savings_buffer = round(settlement.workers_waiting_for_training * .4)
            settlement.timing_gap_months = max(tools.training_months, tools.bridge_start_month) - min(tools.relocation_lead_months, tools.bridge_start_month)
        traces.append(DecisionTrace(
            profile=profile,
            intent=intent,
            tools=tools,
            settlement=settlement,
            limitations=["公开案例仅校准机制，不复原真实企业人数。", "所有人数和比例均为 scenario_assumption 或 rule_result。"],
        ))
    if output:
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps([x.model_dump() for x in traces], ensure_ascii=False, indent=2), encoding="utf-8")
    return traces
