from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .firm_reality import FirmIntent, FirmProfile, PolicyTools, RuleLedger, ScenarioSpec, default_intent, default_profile


BeliefId = Literal[
    "ai_strategy_urgency",
    "internal_transfer_can_absorb",
    "relocation_acceptance",
    "government_consultation_effect",
    "future_hiring_cost",
    "public_reputation_risk",
]


class Belief(BaseModel):
    belief_id: BeliefId
    value: float = Field(ge=0, le=1)
    prior: float = Field(ge=0, le=1)
    updated_at_round: int = Field(ge=0)
    evidence_refs: list[str] = Field(default_factory=list)
    update_rule: str


class BeliefStore(BaseModel):
    beliefs: dict[BeliefId, Belief]

    @classmethod
    def initial(cls) -> "BeliefStore":
        values = {
            "ai_strategy_urgency": .82,
            "internal_transfer_can_absorb": .55,
            "relocation_acceptance": .52,
            "government_consultation_effect": .25,
            "future_hiring_cost": .45,
            "public_reputation_risk": .48,
        }
        return cls(beliefs={key: Belief(belief_id=key, value=value, prior=value, updated_at_round=0, update_rule="initial_scenario_prior_v1") for key, value in values.items()})

    def update(self, belief_id: BeliefId, *, observed: float, round_no: int, evidence_ref: str, weight: float = .35) -> None:
        belief = self.beliefs[belief_id]
        belief.prior = belief.value
        belief.value = round(max(0, min(1, belief.value * (1 - weight) + observed * weight)), 4)
        belief.updated_at_round = round_no
        belief.evidence_refs = [*belief.evidence_refs, evidence_ref]
        belief.update_rule = "bounded_evidence_blend_v1"


class FirmRoundTrace(BaseModel):
    round: int
    event: str
    intent: FirmIntent
    settlement: dict
    belief_snapshot: dict[BeliefId, float]
    evidence_refs: list[str]


class FirmTimelineState(BaseModel):
    last_completed_round: int = Field(0, ge=0, le=4)
    belief_store: BeliefStore
    traces: list[FirmRoundTrace] = Field(default_factory=list)


class FirmTimelineEngine:
    """Pure state transition so a four-round run can pause and resume."""

    def __init__(self, profile: FirmProfile | None = None, intent: FirmIntent | None = None) -> None:
        self.profile = profile or default_profile()
        self.intent = intent or default_intent()
        self.ledger = RuleLedger()
        self.rounds = [
            ("announce_internal_mobility", ScenarioSpec("A1", True, False, False), PolicyTools()),
            ("observe_relocation_declines", ScenarioSpec("A1", True, False, False), PolicyTools()),
            ("add_relocation_support", ScenarioSpec("A2", True, True, False), PolicyTools(relocation_acceptance_lift=.18)),
            ("add_training_and_government_bridge", ScenarioSpec("A3", True, True, True), PolicyTools(training_match_lift=.12, relocation_acceptance_lift=.18, bridge_capacity=80, training_months=4, relocation_lead_months=2, bridge_start_month=3)),
        ]

    def initial_state(self) -> FirmTimelineState:
        return FirmTimelineState(belief_store=BeliefStore.initial())

    def advance(self, state: FirmTimelineState) -> FirmTimelineState:
        if state.last_completed_round >= len(self.rounds):
            raise ValueError("timeline already complete")
        round_no = state.last_completed_round + 1
        event, spec, tools = self.rounds[round_no - 1]
        result = self.ledger.settle(self.profile, spec, tools)
        if spec.id == "A3":
            result.workers_waiting_for_training = round(self.profile.internal_transfer_capacity * tools.training_match_lift)
            result.workers_without_savings_buffer = round(result.workers_waiting_for_training * .4)
            result.timing_gap_months = max(tools.training_months, tools.bridge_start_month) - min(tools.relocation_lead_months, tools.bridge_start_month)
        beliefs = state.belief_store.model_copy(deep=True)
        acceptance = result.internal_transfer_accepted / result.transfer_eligible if result.transfer_eligible else 0
        absorption = result.internal_transfer_accepted / result.affected_workers
        beliefs.update("relocation_acceptance", observed=acceptance, round_no=round_no, evidence_ref=f"episode:r{round_no}:{event}")
        beliefs.update("internal_transfer_can_absorb", observed=absorption, round_no=round_no, evidence_ref=f"rule:r{round_no}:internal_transfer_accepted")
        if spec.government_bridge:
            beliefs.update("government_consultation_effect", observed=result.government_bridged / result.affected_workers, round_no=round_no, evidence_ref=f"rule:r{round_no}:government_bridged")
        trace = FirmRoundTrace(
            round=round_no,
            event=event,
            intent=self.intent,
            settlement=result.model_dump(),
            belief_snapshot={key: value.value for key, value in beliefs.beliefs.items()},
            evidence_refs=[item.id for item in result.evidence_chain],
        )
        return FirmTimelineState(last_completed_round=round_no, belief_store=beliefs, traces=[*state.traces, trace])


def run_four_round_timeline(output: str | Path | None = None) -> list[FirmRoundTrace]:
    engine = FirmTimelineEngine()
    state = engine.initial_state()
    while state.last_completed_round < 4:
        state = engine.advance(state)
    traces = state.traces
    if output:
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps([x.model_dump() for x in traces], ensure_ascii=False, indent=2), encoding="utf-8")
    return traces
