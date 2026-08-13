"""盲推演：隐藏真实政府动作，由 LLM 政府决策 Agent 独立生成动作后与基线对账。

与 Historical Replay 的区别：Replay 给定真实动作只做对账；盲推演只提供
截止日前 Context，让四部门初审、质询、联席双方案与企业回应之后，由一个
政府决策 Agent 独立选择方案并形成动作，再与 `decision_baseline.yaml` 中的
真实政府动作比较。决策由 LLM 生成，确定性规则只作为模型失败时的 fallback。
"""

from __future__ import annotations

import json
import os
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from contracts.investment_simulation_v0_1 import (
    AutonomousGovernmentDecision,
    InvestmentActionType,
    NegotiationChoice,
    PlayerAction,
    StageId,
    StageInput,
    SupportFocus,
)
from .deliberation import DeliberationRound, OpenCodeGoDepartmentProvider

_DECISION_SYSTEM = (
    "你是合肥产业投资推演中的政府最终决策者（联席会议主席）。"
    "你只能依据四部门初审备忘录、部门质询、联席会议双方案和企业回应作出最终决定。"
    "只输出一个 JSON 对象，不要 Markdown，不要臆造证据或数字。"
    "proposal_id 必须等于 proposals 中的某一个；resolution 只能是 accept 或 reject。"
    "evidence_ids 只能来自 visible_evidence_ids。资本点数、状态变化和最终结算不由你决定。"
)

_DECISION_OUTPUT_FIELDS = ["proposal_id", "resolution", "reasoning", "evidence_ids"]


class BlindSimulationResult(BaseModel):
    """一次盲推演阶段的完整产物：决策 + 派生动作 + 与真实基线的对账。"""

    company_id: str
    case_id: str
    stage_id: StageId
    cutoff_at: str
    decision: AutonomousGovernmentDecision
    action: PlayerAction | None = None
    choice: NegotiationChoice
    action_matches_baseline: bool | None = None
    baseline_action: str | None = None


class GovernmentDecisionRuntime:
    """政府最终决策 Agent 的 LLM + 确定性 fallback 双轨适配器。"""

    def __init__(self, provider=None, *, use_api: bool | None = None) -> None:
        if provider is not None:
            self.provider = provider
        elif use_api is True or (use_api is None and os.getenv("INVESTMENT_AGENT_LLM", "").lower() in {"1", "true", "yes", "on"}):
            self.provider = OpenCodeGoDepartmentProvider()
        else:
            self.provider = None

    def resolve(
        self,
        deliberation: DeliberationRound,
        *,
        company_id: str,
        stage_id: StageId,
        cutoff_at: str,
        visible_evidence_ids: list[str],
    ) -> AutonomousGovernmentDecision:
        fallback = self._fallback(deliberation, company_id, stage_id)
        if self.provider is None:
            return fallback
        proposals = deliberation.meeting.proposals
        user = {
            "task": "在四部门初审与联席会议双方案基础上，独立作出最终政府决策。",
            "company_id": company_id,
            "stage_id": stage_id.value,
            "cutoff_at": cutoff_at,
            "department_memos": [
                {
                    "department": memo.department,
                    "recommendation": memo.recommendation,
                    "core_claim": memo.core_claim,
                    "most_important_risk": memo.most_important_risk,
                }
                for memo in deliberation.department_memos
            ],
            "meeting_consensus": deliberation.meeting.consensus,
            "unresolved_disagreements": deliberation.meeting.unresolved_disagreements,
            "minority_opinions": deliberation.meeting.minority_opinions,
            "proposals": [
                {
                    "proposal_id": proposal.proposal_id,
                    "label": proposal.label,
                    "recommendation": proposal.recommendation,
                    "capital_points": proposal.capital_points,
                    "conditions": proposal.conditions,
                    "rationale": proposal.rationale,
                    "supporting_departments": proposal.supporting_departments,
                    "dissenting_departments": proposal.dissenting_departments,
                }
                for proposal in proposals
            ],
            "enterprise_statement": deliberation.enterprise_disclosure.statement,
            "visible_evidence_ids": visible_evidence_ids,
            "output_fields": _DECISION_OUTPUT_FIELDS,
        }
        try:
            raw = self.provider.request_json(_DECISION_SYSTEM, user, max_tokens=800)
            if not isinstance(raw, dict):
                raise TypeError("decision provider must return a JSON object")
            proposal_id = raw.get("proposal_id")
            if proposal_id not in {proposal.proposal_id for proposal in proposals}:
                raise ValueError(f"model selected unknown proposal: {proposal_id}")
            resolution = raw.get("resolution", "accept")
            if resolution not in {"accept", "reject", "accept_counteroffer"}:
                raise ValueError(f"invalid resolution: {resolution}")
            evidence_ids = _normalize_ids(raw.get("evidence_ids"), visible_evidence_ids)
            return AutonomousGovernmentDecision(
                company_id=company_id,
                stage_id=stage_id,
                proposal_id=proposal_id,
                resolution=resolution,
                reasoning=str(raw.get("reasoning", "")),
                evidence_ids=evidence_ids,
                generation_mode="model",
                fallback_reason=None,
            )
        except (TimeoutError, OSError, TypeError, ValueError, json.JSONDecodeError, ValidationError) as exc:
            return fallback.model_copy(update={
                "generation_mode": "deterministic_fallback",
                "fallback_reason": f"{type(exc).__name__}: {exc}",
            })

    @staticmethod
    def _fallback(
        deliberation: DeliberationRound,
        company_id: str,
        stage_id: StageId,
    ) -> AutonomousGovernmentDecision:
        memos = deliberation.department_memos
        support = [memo.department for memo in memos if memo.recommendation in {"support", "conditional_support"}]
        if len(support) >= 2:
            proposal = next(
                proposal for proposal in deliberation.meeting.proposals
                if proposal.recommendation in {"support", "conditional_support"}
            )
            reasoning = f"四部门中 {len(support)} 个支持/有条件支持，采纳分期支持方案。"
        else:
            proposal = next(
                proposal for proposal in deliberation.meeting.proposals
                if proposal.recommendation == "defer"
            )
            reasoning = f"支持部门不足半数，采纳保留选项方案。"
        return AutonomousGovernmentDecision(
            company_id=company_id,
            stage_id=stage_id,
            proposal_id=proposal.proposal_id,
            resolution="accept",
            reasoning=reasoning,
            evidence_ids=list(dict.fromkeys(memo for memo in deliberation.meeting.evidence_ids)),
            generation_mode="deterministic_fallback",
            fallback_reason="模型不可用时的确定性兜底：多数部门支持则分期，否则保留选项。",
        )


def autonomous_action(
    decision: AutonomousGovernmentDecision,
    deliberation: DeliberationRound,
) -> tuple[PlayerAction | None, NegotiationChoice]:
    """把 Agent 选中的方案机械映射为引擎可结算的 PlayerAction + NegotiationChoice。

    决策（选哪个方案、接受还是拒绝）来自 Agent；这里只做词汇翻译，不做判断。
    reject 表示“本轮不投入政府资本”，映射为无动作，而非让企业退出。
    """
    proposals = {proposal.proposal_id: proposal for proposal in deliberation.meeting.proposals}
    proposal = proposals.get(decision.proposal_id)
    if proposal is None:
        raise ValueError(f"decision references unknown proposal: {decision.proposal_id}")
    choice = NegotiationChoice(
        company_id=decision.company_id,
        proposal_id=decision.proposal_id,
        resolution=decision.resolution,
    )
    if decision.resolution == "reject":
        return None, choice
    if proposal.recommendation in {"support", "conditional_support"}:
        action = PlayerAction(
            company_id=decision.company_id,
            action=InvestmentActionType.INVEST,
            capital_points=proposal.capital_points,
        )
    elif proposal.recommendation == "defer":
        action = PlayerAction(
            company_id=decision.company_id,
            action=InvestmentActionType.SUPPORT,
            capital_points=proposal.capital_points,
            support_focus=proposal.support_focus or SupportFocus.INFRASTRUCTURE,
        )
    else:
        return None, choice
    if decision.resolution == "accept_counteroffer":
        requested = deliberation.enterprise_response.requested_capital_points
        action = action.model_copy(update={"capital_points": max(proposal.capital_points, requested)})
    return action, choice


def run_blind_decision(
    engine,
    state,
    *,
    stage_id: StageId,
    seed: int,
    decision_runtime: GovernmentDecisionRuntime,
    company_id: str,
    context_mode: Literal["player", "audit", "replay"] = "player",
) -> BlindSimulationResult:
    """编排一次盲推演阶段：预览 → 决策 Agent → 派生动作 → 与基线对账。"""
    preview = engine.run_stage(
        state,
        StageInput(run_id=state.run_id, stage_id=stage_id, seed=seed, context_mode=context_mode),
    )
    deliberation = next(
        item for item in preview.deliberations if item.company_id == company_id
    )
    visible = (
        list(preview.frozen_context_audit.visible_evidence_ids)
        if preview.frozen_context_audit
        else []
    )
    decision = decision_runtime.resolve(
        deliberation,
        company_id=company_id,
        stage_id=stage_id,
        cutoff_at=preview.cutoff_at,
        visible_evidence_ids=visible,
    )
    action, choice = autonomous_action(decision, deliberation)

    case_id = engine.loader.raw_company_config(company_id).get("historical_case_id") or ""
    baseline = engine.replay_baselines.for_case(case_id) if case_id else None
    baseline_action = baseline.government_action.action if baseline else None
    action_match = (action is not None and action.action.value == baseline_action) if baseline_action else None

    return BlindSimulationResult(
        company_id=company_id,
        case_id=case_id,
        stage_id=stage_id,
        cutoff_at=preview.cutoff_at,
        decision=decision,
        action=action,
        choice=choice,
        action_matches_baseline=action_match,
        baseline_action=baseline_action,
    )


def _normalize_ids(values: object, allowed: list[str]) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise ValueError("evidence_ids must be a list")
    if not all(isinstance(item, str) for item in values):
        raise ValueError("evidence_ids must be strings")
    return [item for item in values if item in allowed]
