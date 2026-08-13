"""盲推演：隐藏真实政府动作，由四部门 Agent 依据截止日前信息自主聚合成“建议动作”，再与真实基线对账。

与 Historical Replay 的区别：Replay 给定真实动作只做对账；盲推演只提供截止日前
Context，四部门独立初审、定向质询、联席双方案之后，由会议秘书把已出现的判断
透明聚合成“建议动作”（support / staged / defer / reject），再与
`decision_baseline.yaml` 的真实动作比较。

“建议动作”是系统推荐，不是第五个部门拍板；玩家仍可从双方案中选择、修改或拒绝。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from contracts.investment_simulation_v0_1 import (
    InvestmentActionType,
    NegotiationChoice,
    PlayerAction,
    StageId,
    StageInput,
    SupportFocus,
)

# 建议动作 → 引擎动作词汇的映射，用于与基线对账（支持/分期都对应“投资”）。
_RECOMMENDED_TO_ACTION = {
    "support": "invest",
    "staged": "invest",
    "defer": "defer",
    "reject": "exit",
}


class BlindSimulationResult(BaseModel):
    """一次最小闭环：盲推建议、企业约束、规则结算与事后基线对账。"""

    company_id: str
    case_id: str
    stage_id: StageId
    cutoff_at: str
    recommended_action: Literal["support", "staged", "defer", "reject"]
    recommendation_rationale: str
    department_recommendations: dict[str, str]
    challenge_count: int
    enterprise_action: str | None = None
    proposal_id: str
    resolution: Literal["accept", "reject"]
    settled_action: str
    settled_capital_points: int
    budget_after: int
    settlement_reconciled: bool
    action_matches_baseline: bool | None = None
    baseline_action: str | None = None


def run_blind_decision(
    engine,
    state,
    *,
    stage_id: StageId,
    seed: int,
    company_id: str,
    context_mode: Literal["player", "audit", "replay"] = "player",
) -> BlindSimulationResult:
    """预览 → 四部门/企业建议 → 机械映射动作 → 规则结算 → 事后对账。"""
    preview = engine.run_stage(
        state,
        StageInput(run_id=state.run_id, stage_id=stage_id, seed=seed, context_mode=context_mode),
    )
    deliberation = next(
        item for item in preview.deliberations if item.company_id == company_id
    )
    meeting = deliberation.meeting

    if meeting.recommended_action in {"support", "staged"}:
        proposal = next(
            item for item in meeting.proposals
            if item.recommendation in {"support", "conditional_support"}
        )
        action = PlayerAction(
            company_id=company_id,
            action=InvestmentActionType.INVEST,
            capital_points=proposal.capital_points,
        )
        resolution = "accept"
    else:
        proposal = next(item for item in meeting.proposals if item.recommendation == "defer")
        resolution = "reject" if meeting.recommended_action == "reject" else "accept"
        action = None if resolution == "reject" else PlayerAction(
            company_id=company_id,
            action=InvestmentActionType.SUPPORT,
            capital_points=proposal.capital_points,
            support_focus=proposal.support_focus or SupportFocus.INFRASTRUCTURE,
        )

    choice = NegotiationChoice(
        company_id=company_id,
        proposal_id=proposal.proposal_id,
        resolution=resolution,
    )
    settled = engine.run_stage(
        state,
        StageInput(
            run_id=state.run_id,
            stage_id=stage_id,
            seed=seed,
            context_mode=context_mode,
            actions=[action] if action else [],
            negotiations=[choice],
        ),
    )
    settled_deliberation = next(
        item for item in settled.deliberations if item.company_id == company_id
    )
    amount_matches = (
        settled_deliberation.enterprise_response.agreed_capital_points
        == (action.capital_points if action else 0)
    )
    settlement_reconciled = (
        settled.budget.before == settled.budget.spent + settled.budget.after
        and amount_matches
    )

    # 真实动作只在建议与结算完成后读取，避免进入盲推输入。
    case_id = engine.loader.raw_company_config(company_id).get("historical_case_id") or ""
    baseline = engine.replay_baselines.for_case(case_id) if case_id else None
    baseline_action = baseline.government_action.action if baseline else None
    predicted_action = _RECOMMENDED_TO_ACTION.get(meeting.recommended_action)
    action_match = (predicted_action == baseline_action) if baseline_action else None

    return BlindSimulationResult(
        company_id=company_id,
        case_id=case_id,
        stage_id=stage_id,
        cutoff_at=preview.cutoff_at,
        recommended_action=meeting.recommended_action,
        recommendation_rationale=meeting.recommendation_rationale,
        department_recommendations={
            memo.department: memo.recommendation
            for memo in deliberation.department_memos
        },
        challenge_count=len(meeting.challenges),
        enterprise_action=(
            deliberation.enterprise_intent.action
            if deliberation.enterprise_intent is not None else None
        ),
        proposal_id=proposal.proposal_id,
        resolution=resolution,
        settled_action=action.action.value if action else "none",
        settled_capital_points=action.capital_points if action else 0,
        budget_after=settled.budget.after,
        settlement_reconciled=settlement_reconciled,
        action_matches_baseline=action_match,
        baseline_action=baseline_action,
    )
