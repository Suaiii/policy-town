"""政企协商纯逻辑（文档 4.6 / P1.5 / P2）。

- classify_conditions：把会议纪要/条件单中的自由文本条件映射为结构化风险条件；
- build_sheets_from_plan：联席方案（meeting_minutes.proposals）→ 政府条件单草稿；
- update_beliefs_from_verification：核验回应按 bounded_evidence_blend_v1 更新判断账；
- validate_condition_sheet：条件单契约校验器。

纯确定性：同输入 → 同输出；协商层不修改任何数值，数值只由规则引擎结算。
"""
from __future__ import annotations

from typing import Dict, List

_SUPPORT_FOCUS = ("infrastructure", "talent", "supply_chain", "financing")
_RISK_ITEMS = ("tranches", "milestones", "audit", "exit_terms", "follow_on_cap", "fund_proof")

_REQUIRED_SHEET = ["sheet_id", "company_id", "capital_points",
                   "support_focus", "risk_conditions"]

_KEYWORDS = {
    "tranches": ("分期", "首期"),
    "milestones": ("里程碑", "节点", "放款"),
    "audit": ("审计", "资金证明", "同比例"),
    "exit_terms": ("退出", "暂停追加"),
    "follow_on_cap": ("追加", "上限"),
    "fund_proof": ("资金证明", "同比例出资"),
}


def classify_conditions(conditions: List[str]) -> List[str]:
    """自由文本条件 → 结构化风险条件（去重，按 _KEYWORDS 声明顺序稳定）。"""
    out: List[str] = []
    for cond in conditions:
        for key, kws in _KEYWORDS.items():
            if key not in out and any(k in cond for k in kws):
                out.append(key)
    return out


def validate_condition_sheet(sheet: dict) -> None:
    missing = [k for k in _REQUIRED_SHEET if k not in sheet]
    if missing:
        raise ValueError("condition sheet missing keys: %s" % missing)
    if sheet.get("support_focus") not in _SUPPORT_FOCUS:
        raise ValueError("invalid support_focus: %r" % sheet.get("support_focus"))
    if float(sheet.get("capital_points", 0)) < 0:
        raise ValueError("negative capital_points")
    for item in sheet.get("risk_conditions", []):
        if item not in _RISK_ITEMS:
            raise ValueError("invalid risk_condition: %r" % item)


def build_sheets_from_plan(minutes: dict, plan_id: str,
                           capital_map: Dict[str, float]) -> List[dict]:
    """联席方案（meeting_minutes.proposals）→ 政府条件单草稿（只读映射，不落状态）。

    条件文本经 classify_conditions 转结构化风险条件；资本点由玩家提供（capital_map）。
    """
    plan = next((p for p in minutes.get("proposals", []) if p["proposal_id"] == plan_id), None)
    if plan is None:
        raise ValueError("unknown proposal: %s" % plan_id)
    sheets: List[dict] = []
    for cid in sorted({c["company_id"] for c in plan.get("conditions", [])}):
        conds = [c["condition"] for c in plan.get("conditions", [])
                 if c["company_id"] == cid]
        sheets.append({
            "sheet_id": "CS-%s-%s" % (plan_id, cid),
            "company_id": cid,
            "capital_points": float(capital_map.get(cid, 0.0)),
            "support_focus": "infrastructure",
            "milestone_due": "",
            "risk_conditions": classify_conditions(conds),
        })
    return sheets


_VERIFY_SIGNAL = {"full_disclosure": 0.85, "range": 0.65, "partial_disclosure": 0.5,
                  "condition_offer": 0.45, "refusal": 0.25}


def update_beliefs_from_verification(agent, response: dict, stage_id: str) -> None:
    """企业回应核验问题后更新融资连续性判断（bounded_evidence_blend_v1）。"""
    signal = _VERIFY_SIGNAL.get(response.get("response_type"), 0.5)
    agent.memory.beliefs.update("financing_continuity", signal=signal,
                                signal_weight=0.35, stage_id=stage_id,
                                evidence_ids=[response.get("question_id", "VQ-?")])
