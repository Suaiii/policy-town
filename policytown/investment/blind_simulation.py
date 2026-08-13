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

from contracts.investment_simulation_v0_1 import StageId, StageInput

# 建议动作 → 引擎动作词汇的映射，用于与基线对账（支持/分期都对应“投资”）。
_RECOMMENDED_TO_ACTION = {
    "support": "invest",
    "staged": "invest",
    "defer": "defer",
    "reject": "exit",
}


class BlindSimulationResult(BaseModel):
    """一次盲推演阶段的完整产物：四部门立场 + 建议动作 + 与真实基线的对账。"""

    company_id: str
    case_id: str
    stage_id: StageId
    cutoff_at: str
    recommended_action: Literal["support", "staged", "defer", "reject"]
    recommendation_rationale: str
    department_recommendations: dict[str, str]
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
    """跑一次盲推演：预览（无玩家动作）→ 读联席建议动作 → 与基线对账。"""
    preview = engine.run_stage(
        state,
        StageInput(run_id=state.run_id, stage_id=stage_id, seed=seed, context_mode=context_mode),
    )
    deliberation = next(
        item for item in preview.deliberations if item.company_id == company_id
    )
    meeting = deliberation.meeting

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
        action_matches_baseline=action_match,
        baseline_action=baseline_action,
    )
