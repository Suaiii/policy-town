"""HTTP boundary for the Hefei investment simulation.

The browser submits only a portfolio allocation.  Department deliberation,
enterprise intent, historical events and numeric settlement remain backend
responsibilities.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

from contracts.investment_simulation_v0_1 import (
    NegotiationChoice, PlayerAction, StageId, StageInput,
)
from policytown.investment import InvestmentEngine


ROOT = Path(__file__).resolve().parents[1]
RESULT_DIR = ROOT / "data" / "hefei_mvp_runs" / "stage_results"
RESULT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Hefei Investment Simulation API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5273", "http://localhost:5273"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_local_env() -> None:
    """Load ignored development credentials; deployment env still wins."""
    path = ROOT / ".env.local"
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in {"INVESTMENT_AGENT_LLM", "INVESTMENT_AGENT_REQUIRE_LLM"}:
            continue
        os.environ.setdefault(key, value.strip())


_load_local_env()

_ENGINE: InvestmentEngine | None = None


class CreateRunRequest(BaseModel):
    seed: int | None = None
    company_ids: list[str] | None = None


class Allocation(BaseModel):
    company_id: str
    capital_points: int = Field(ge=0, le=100)


class SettleStageRequest(BaseModel):
    stage_id: StageId
    allocations: list[Allocation]
    idempotency_key: str = Field(min_length=8, max_length=100)

    @model_validator(mode="after")
    def unique_companies(self) -> "SettleStageRequest":
        ids = [item.company_id for item in self.allocations]
        if len(ids) != len(set(ids)):
            raise ValueError("each company can appear only once")
        return self


class SelectProposalRequest(BaseModel):
    stage_id: StageId
    company_id: str
    proposal_id: str
    idempotency_key: str = Field(min_length=8, max_length=100)


class CompareProposalsRequest(BaseModel):
    stage_id: StageId
    company_id: str
    proposal_ids: list[str] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def two_distinct_proposals(self) -> "CompareProposalsRequest":
        if len(set(self.proposal_ids)) != 2:
            raise ValueError("comparison requires two distinct proposal_ids")
        return self


def _engine() -> InvestmentEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = InvestmentEngine(use_agent_api=bool(os.getenv("LLM_API_KEY")))
    return _ENGINE


def _result_path(run_id: str, stage_id: StageId) -> Path:
    return RESULT_DIR / f"{run_id}-{stage_id.value}.json"


def _stage_view(state, stage_id: StageId) -> dict:
    engine = _engine()
    assumption = engine.loader.budget_assumption(stage_id)
    available = max(
        0,
        state.treasury_balance
        + assumption.new_fiscal_capacity
        + state.exits_and_returns
        - state.committed_capital
        - state.maintenance_cost,
    )
    return {
        "run_id": state.run_id,
        "stage_id": stage_id.value,
        "cutoff_at": engine.loader.cutoff_at(stage_id),
        "available_budget": available,
        "budget_assumption": assumption.model_dump(mode="json"),
        "city_metrics": state.city_metrics.model_dump(mode="json"),
        "companies": [item.model_dump(mode="json") for item in state.companies],
        "completed_stages": [item.value for item in state.completed_stages],
    }


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    engine = _engine()
    return {
        "status": "ok",
        "engine": "investment-v0.2",
        "agent_provider": "opencode-go" if engine.department_runtime.provider is not None else "deterministic_fallback",
        "agent_required": os.getenv("INVESTMENT_AGENT_REQUIRE_LLM", "").lower() in {"1", "true", "yes", "on"},
    }


@app.post("/api/runs", status_code=201)
def create_run(request: CreateRunRequest) -> dict:
    seed = request.seed if request.seed is not None else 42
    selected = request.company_ids or ["company_a", "company_d"]
    if len(selected) != 2:
        raise HTTPException(status_code=422, detail="the frozen interaction requires exactly two companies")
    run_id = f"hefei-{uuid.uuid4().hex[:12]}"
    state = _engine().new_run(run_id, selected, seed=seed)
    return _stage_view(state, StageId.S1)


@app.get("/api/runs/{run_id}/stages/{stage_id}/companies/{company_id}/deliberation")
def preview_company_deliberation(run_id: str, stage_id: StageId, company_id: str) -> dict:
    engine = _engine()
    try:
        state = engine.resume_run(run_id)
        deliberation, budget = engine.preview_deliberation(state, stage_id, company_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    payload = deliberation.model_dump(mode="json")
    payload["available_budget"] = budget.before
    payload["model_runtime"] = {
        "provider": "opencode-go" if engine.department_runtime.provider is not None else "deterministic_fallback",
        "model": getattr(engine.department_runtime.provider, "model", "deterministic-fallback"),
        "all_departments_model_generated": all(
            memo.generation_mode == "model" for memo in deliberation.department_memos
        ),
        "enterprise_model_generated": bool(
            deliberation.enterprise_intent
            and deliberation.enterprise_intent.generation_mode == "model"
        ),
    }
    return payload


def _counterfactual_summary(result, company_id: str, proposal) -> dict:
    company = next(item for item in result.companies if item.company_id == company_id)
    relevant_deltas = [
        item for item in result.state_deltas
        if item.entity_id in {company_id, "city"}
    ]
    return {
        "proposal_id": proposal.proposal_id,
        "label": proposal.label,
        "capital_points": proposal.capital_points,
        "package_parameters": proposal.package_parameters.model_dump(mode="json"),
        "budget_after": result.budget.after,
        "company_action": next(
            item.action.value for item in result.company_actions if item.company_id == company_id
        ),
        "company_state": {
            "status": company.status.value,
            "construction_progress": company.construction_progress,
            "financial_health": company.financial_health,
            "technology_readiness": company.technology_readiness,
            "project_cashflow": company.project_cashflow,
        },
        "city_state": result.city_metrics.model_dump(mode="json"),
        "causal_deltas": [item.model_dump(mode="json") for item in relevant_deltas],
    }


def _compare_from_state(engine, state, stage_id, company_id, proposal_list) -> dict:
    branches = []
    for proposal in proposal_list:
        branch_state = state.model_copy(deep=True)
        result = engine.run_stage(
            branch_state,
            StageInput(
                    run_id=branch_state.run_id,
                    stage_id=stage_id,
                    seed=state.seed,
                    context_mode="player",
                    actions=[PlayerAction(
                        company_id=company_id,
                        action="invest",
                        capital_points=proposal.capital_points,
                    )],
                    negotiations=[NegotiationChoice(
                        company_id=company_id,
                        proposal_id=proposal.proposal_id,
                        resolution="accept",
                    )],
            ),
            persist=False,
        )
        branches.append(_counterfactual_summary(result, company_id, proposal))

    left, right = branches
    comparison_fields = (
        "construction_progress", "financial_health", "technology_readiness", "project_cashflow",
    )
    return {
        "experiment": "single-decision-policy-package-ablation-v1",
        "controlled_variables": [
            "initial_state", "company", "information_cutoff", "external_event", "seed", "rule_engine",
        ],
        "independent_variable": "proposal_id",
        "branches": branches,
        "difference_right_minus_left": {
            "budget_after": right["budget_after"] - left["budget_after"],
            "company_state": {
                field: right["company_state"][field] - left["company_state"][field]
                for field in comparison_fields
            },
        },
        "interpretation_boundary": (
            "该对照证明在同一模型内政策包会产生可追踪的差异；"
            "历史有效性仍由独立的历史路径复现结果支持。"
        ),
    }


def _historical_alignment(engine, company_id: str, proposal_list) -> dict | None:
    """Reveal the history-like branch only after the player has decided."""
    case_id = engine.loader.raw_company_config(company_id).get("historical_case_id")
    baseline = engine.replay_baselines.for_case(case_id) if case_id else None
    if baseline is None:
        return None
    components = set(baseline.government_action.components)
    has_milestone_conditions = any(
        item.category in {"company_setup", "construction", "production"}
        for item in baseline.conditions
    )

    def score(proposal) -> float:
        package = proposal.package_parameters
        weighted = 0.0
        weight = 0.0
        if "commit_registered_capital" in components:
            weighted += package.funding_points * .35
            weight += .35
        if "arrange_syndicated_loan" in components:
            weighted += package.financing_support * .25
            weight += .25
        if "provide_industrial_support" in components:
            weighted += ((package.land_support + package.energy_support) / 2) * .25
            weight += .25
        if has_milestone_conditions:
            weighted += package.milestone_strictness * .15
            weight += .15
        return round(weighted / weight, 3) if weight else 0.0

    scores = {proposal.proposal_id: score(proposal) for proposal in proposal_list}
    history_like = max(proposal_list, key=lambda item: scores[item.proposal_id])
    alternative = next(item for item in proposal_list if item.proposal_id != history_like.proposal_id)
    return {
        "baseline_id": baseline.baseline_id,
        "case_id": baseline.case_id,
        "revealed_after_decision": True,
        "history_like_proposal_id": history_like.proposal_id,
        "alternative_proposal_id": alternative.proposal_id,
        "mechanism_similarity_scores": scores,
        "comparison_basis": [
            "government capital commitment",
            "syndicated financing",
            "land/energy/infrastructure support",
            "implementation milestones",
        ],
        "limitation": "场景点数不与现实亿元作数值换算，仅比较政策机制组合。",
    }


@app.post("/api/runs/{run_id}/compare-proposals")
def compare_proposals(run_id: str, request: CompareProposalsRequest) -> dict:
    """Settle two packages against one frozen world without advancing the run."""
    engine = _engine()
    try:
        state = engine.resume_run(run_id)
        preview, _ = engine.preview_deliberation(
            state, request.stage_id, request.company_id,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    proposals = {item.proposal_id: item for item in preview.meeting.proposals}
    if not set(request.proposal_ids) <= set(proposals):
        raise HTTPException(status_code=422, detail="comparison proposal does not exist")
    try:
        return _compare_from_state(
            engine,
            state,
            request.stage_id,
            request.company_id,
            [proposals[item] for item in request.proposal_ids],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/runs/{run_id}/select-proposal")
def select_proposal(run_id: str, request: SelectProposalRequest) -> dict:
    path = _result_path(run_id, request.stage_id)
    if path.exists():
        saved = json.loads(path.read_text(encoding="utf-8"))
        if saved.get("idempotency_key") == request.idempotency_key:
            return saved["result"]
        raise HTTPException(status_code=409, detail="stage has already been settled")
    engine = _engine()
    try:
        state = engine.resume_run(run_id)
        preview, _ = engine.preview_deliberation(state, request.stage_id, request.company_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    proposal = next(
        (item for item in preview.meeting.proposals if item.proposal_id == request.proposal_id), None,
    )
    if proposal is None:
        raise HTTPException(status_code=422, detail="proposal does not exist in the compiled meeting result")
    try:
        result = engine.run_stage(state, StageInput(
            run_id=run_id,
            stage_id=request.stage_id,
            seed=state.seed,
            context_mode="player",
            actions=[PlayerAction(
                company_id=request.company_id,
                action="invest",
                capital_points=proposal.capital_points,
            )],
            negotiations=[NegotiationChoice(
                company_id=request.company_id,
                proposal_id=proposal.proposal_id,
                resolution="accept",
            )],
        ))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    payload = result.model_dump(mode="json")
    payload["settlement_trace"] = [
        {
            "step": "proposal_validation",
            "label": "政策包校验",
            "detail": "确认 proposal_id 来自本轮编译结果，且阶段、企业与运行状态一致。",
        },
        {
            "step": "budget_validation",
            "label": "财政与条件校验",
            "detail": f"核对可用财政、投入 {proposal.capital_points} 点、分期总额和必要约束。",
        },
        {
            "step": "enterprise_action",
            "label": "企业行动生成",
            "detail": "企业依据已选政策包、私有状态与 Memory 形成行动意图。",
        },
        {
            "step": "deterministic_settlement",
            "label": "确定性规则结算",
            "detail": "将政府行动、企业行动与本阶段外部事件写入规则引擎，生成状态变化和承诺账。",
        },
    ]
    payload["comparison_available_at"] = f"/api/runs/{run_id}/compare-proposals"
    path.write_text(json.dumps({
        "idempotency_key": request.idempotency_key, "result": payload,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict:
    try:
        state = _engine().resume_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if state.next_stage is None:
        return {"run_id": run_id, "completed": True, "state": state.model_dump(mode="json")}
    return _stage_view(state, state.next_stage)


@app.post("/api/runs/{run_id}/settle")
def settle_stage(run_id: str, request: SettleStageRequest) -> dict:
    path = _result_path(run_id, request.stage_id)
    if path.exists():
        saved = json.loads(path.read_text(encoding="utf-8"))
        if saved.get("idempotency_key") == request.idempotency_key:
            return saved["result"]
        raise HTTPException(status_code=409, detail="stage has already been settled")

    engine = _engine()
    try:
        state = engine.resume_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if state.next_stage != request.stage_id:
        raise HTTPException(status_code=409, detail=f"expected stage {state.next_stage}")

    active_ids = {item.company_id for item in state.companies if item.status.value != "exited"}
    submitted_ids = {item.company_id for item in request.allocations}
    if submitted_ids != active_ids:
        raise HTTPException(status_code=422, detail="allocations must include every active company")

    actions = [
        PlayerAction(company_id=item.company_id, action="invest", capital_points=item.capital_points)
        for item in request.allocations
        if item.capital_points > 0
    ]
    try:
        result = engine.run_stage(
            state,
            StageInput(
                run_id=run_id,
                stage_id=request.stage_id,
                seed=state.seed,
                context_mode="player",
                actions=actions,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    payload = result.model_dump(mode="json")
    path.write_text(
        json.dumps({"idempotency_key": request.idempotency_key, "result": payload}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload
