"""企业 Agent — 每家入局企业一个实例，是主线的引擎。

铁律：每轮强制输出一个合法动作，即使政府没给钱（契约 6.4）。
"""
from __future__ import annotations

from typing import Callable, Dict, Optional

from .base import BaseAgent
from ..memory import EnterpriseMemory
from ..core.private_state import CompanyPrivateState
from ..fallback import deterministic
from ..core.context import slim_context

_REQUIRED = ["company_id", "action", "capital_request_next_round", "resource_allocation",
             "milestone_target", "risk_response", "competition_response",
             "evidence_ids", "confidence"]

_VERIFY_REQUIRED = ["company_id", "question_id", "response_type", "statement",
                    "evidence_ids", "confidence"]
_VERIFY_TYPES = ("full_disclosure", "partial_disclosure", "range",
                 "refusal", "condition_offer")

_COUNTER_REQUIRED = ["proposal_id", "company_id", "summary", "accepts",
                     "requests", "rejects", "alternative"]
_COUNTER_ITEMS = ("capital_points", "support_focus", "milestone_due",
                  "risk_conditions", "exit_clause", "tranches")


def validate_counter_proposal(out: dict) -> None:
    missing = [k for k in _COUNTER_REQUIRED if k not in out]
    if missing:
        raise ValueError("counter proposal missing keys: %s" % missing)
    for r in out.get("requests", []):
        if r.get("key") not in _COUNTER_ITEMS:
            raise ValueError("invalid request key: %r" % r.get("key"))
    for item in out.get("rejects", []):
        if item not in _COUNTER_ITEMS:
            raise ValueError("invalid reject item: %r" % item)
    for a in out.get("accepts", []):
        if a.get("item") not in _COUNTER_ITEMS:
            raise ValueError("invalid accept item: %r" % a.get("item"))


def validate_verification_response(out: dict) -> None:
    missing = [k for k in _VERIFY_REQUIRED if k not in out]
    if missing:
        raise ValueError("verification response missing keys: %s" % missing)
    if out["response_type"] not in _VERIFY_TYPES:
        raise ValueError("invalid response_type: %r" % out["response_type"])
    for k, r in out.get("ranges", {}).items():
        if not (isinstance(r, list) and len(r) == 2 and r[0] <= r[1]):
            raise ValueError("invalid range for %r: %r" % (k, r))


class CompanyAgent(BaseAgent):
    def __init__(self, company_id: str,
                 enterprise: Optional[dict] = None,
                 llm_fn: Optional[Callable[[str], dict]] = None) -> None:
        super().__init__(role="企业 Agent(%s)" % company_id,
                         required_keys=_REQUIRED, llm_fn=llm_fn)
        self.company_id = company_id
        # 企业档案（enterprise_agents.json 中的单条）：system_prompt 为第一阶段
        # 唯一输入；stage_contexts 随阶段推进注入（enter_stage 及之前不注入）。
        self.enterprise = enterprise
        self.private_state: Optional[CompanyPrivateState] = None
        self.memory = EnterpriseMemory(risk_preference=float(
            (enterprise or {}).get("decision_baseline", {}).get("risk_preference", 0.5)))
        self._counter_made: Dict[str, bool] = {}

    def plan(self, company_view: dict, ctx: dict, funded_points: float,
             stage_id: str = "S1") -> dict:
        slim = slim_context(ctx, "company_plan", company_view["company_id"])
        payload = {"company": company_view, "funded_points": funded_points,
                   "ctx": slim, "stage_id": stage_id}
        if self.enterprise:
            cutoff = ctx.get("cutoff_at", "9999-12-31")
            items = self.enterprise.get("stage_contexts", {}).get(stage_id, [])
            # 二次过滤：注入项不得晚于本阶段截止日（防御性，数据层已保证）
            items = [c for c in items if c.get("as_of", "9999-12-31") <= cutoff]
            payload["enterprise_identity"] = self.enterprise["system_prompt"]
            payload["injected_stage_context"] = items
            payload["decision_baseline"] = self.enterprise.get("decision_baseline", {})
            payload["memory"] = self.memory.to_dict()
            if self.private_state is not None:
                payload["private_state"] = self.private_state.to_dict()
        return self.run(
            payload,
            lambda: deterministic.company_plan(company_view, ctx, funded_points))

    def respond_to_verification(self, question: dict, company_view: dict, ctx: dict) -> dict:
        """企业按私有状态与利益目标作策略性回应关键核验问题（只表达意图，不改数值）。"""
        slim = slim_context(ctx, "company_plan", company_view["company_id"])
        payload = {"question": question, "company": company_view, "ctx": slim,
                   "private_state": self.private_state.to_dict()
                   if self.private_state is not None else None,
                   "memory": self.memory.to_dict()}
        return self.run(
            payload,
            lambda: deterministic.verification_response(company_view, self.private_state,
                                                        question, ctx),
            validator=validate_verification_response)

    def make_counter_proposal(self, conditions: dict, company_view: dict,
                              ctx: dict, stage_id: str):
        """一次性反提案：同一阶段只允许一次（文档 4.6）。"""
        if self._counter_made.get(stage_id):
            return None
        self._counter_made[stage_id] = True
        slim = slim_context(ctx, "company_plan", company_view["company_id"])
        payload = {"conditions": conditions, "company": company_view, "ctx": slim,
                   "private_state": self.private_state.to_dict()
                   if self.private_state is not None else None,
                   "memory": self.memory.to_dict()}
        return self.run(
            payload,
            lambda: deterministic.counter_proposal(company_view, self.private_state,
                                                   conditions, stage_id),
            validator=validate_counter_proposal)

    def build_prompt(self, payload: dict) -> str:
        if not self.enterprise:
            return super().build_prompt(payload)
        import json as _json
        facts = _json.dumps(payload, ensure_ascii=False, default=str)
        example = {
            "company_id": "company_a", "action": "expand",
            "capital_request_next_round": 35.0,
            "resource_allocation": {"construction": 0.45, "research": 0.30,
                                    "market": 0.10, "cash_buffer": 0.15},
            "milestone_target": "pilot_production", "risk_response": "delay_expansion",
            "competition_response": "price_cut", "message_to_government": None,
            "evidence_ids": ["EVID-001"], "confidence": 0.7,
        }
        return (
            "【角色与边界】%s\n"
            "你是本企业的决策代表，基于企业身份与注入信息做出经营动作，"
            "站在企业自身立场最大化长期存续与项目成功。\n"
            "禁止修改任何数值；禁止使用截止日之后的信息；禁止给出成功率；"
            "禁止编造 evidence_ids；禁止发明示例之外的其他字段或嵌套对象。\n"
            "【当前事实（只读，禁止修改）】%s\n"
            "【输出契约】只输出一个 JSON 对象，必须严格遵循以下结构（键、类型、"
            "嵌套层次完全一致，resource_allocation 四个数之和为 1）：\n%s"
            % (payload["enterprise_identity"], facts,
               _json.dumps(example, ensure_ascii=False, indent=1))
        )
