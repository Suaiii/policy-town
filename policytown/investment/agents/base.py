"""BaseAgent — 所有 Agent 同一基类：prompt 三段式 + 轻量校验 + 重试 + fallback。

LLM 调用通过注入 llm_fn(prompt: str) -> dict 完成；为 None 时直接走 fallback。
校验是必需键的浅层检查（完整 JSON Schema 见 contracts/，前端/审计可用）。
"""
from __future__ import annotations

from typing import Callable, List, Optional


# 模型可能输出的同义动作/方向 → 契约枚举（修不了才拒绝）
_ACTION_SYNONYMS = {
    "delay": "wait", "pause": "wait", "hold": "wait", "maintain": "wait",
    "halt": "contract", "shrink": "contract", "reduce": "contract", "cut_cost": "contract",
    "expand_production": "expand", "expand_capacity": "expand", "increase_production": "expand",
    "raise_funds": "finance", "borrow": "finance",
    "get_orders": "seek_orders", "market_expansion": "seek_orders", "sell": "seek_orders",
    "leave": "relocate", "move": "relocate", "relocation": "relocate",
}
_DIRECTION_SYNONYMS = {
    "hold": "neutral", "maintain": "neutral", "stable": "neutral", "flat": "neutral",
    "supportive": "positive", "positive_outlook": "positive", "optimistic": "positive",
    "bearish": "negative", "pessimistic": "negative", "downgrade": "negative",
}
_COMPETITION_SYNONYMS = {
    "none": "wait", "hold": "wait", "no_action": "wait", "": "wait",
    "cut_price": "price_cut", "price_war": "price_cut",
}


class BaseAgent:
    def __init__(self, role: str, required_keys: List[str],
                 llm_fn: Optional[Callable[[str], dict]] = None,
                 max_retries: int = 1) -> None:
        self.role = role
        self.required_keys = required_keys
        self.llm_fn = llm_fn
        self.max_retries = max_retries

    def run(self, prompt_payload: dict, fallback_fn: Callable[[], dict]) -> dict:
        if self.llm_fn is None:
            return fallback_fn()
        prompt = self.build_prompt(prompt_payload)
        for _ in range(self.max_retries + 1):
            try:
                out = self._call(prompt)
                self.validate(out)
                return out
            except Exception:
                continue
        out = fallback_fn()
        out["confidence"] = 0.0
        return out

    def _call(self, prompt: str) -> dict:
        """带 validator 调用；外部 llm_fn 不接受该参数时退化为单参调用。"""
        try:
            return self.llm_fn(prompt, validator=self.validate)
        except TypeError:
            return self.llm_fn(prompt)

    def build_prompt(self, payload: dict) -> str:
        """三段式：角色与边界 / 当前事实 / 输出契约（含 one-shot 示例）。"""
        import json as _json
        facts = _json.dumps(payload, ensure_ascii=False, default=str)
        kind = payload.get("kind", "professional")
        example = {"agent": kind, "direction": "positive", "score": 68,
                   "confidence": 0.74,
                   "key_factors": [{"metric_id": "industrial_base", "effect": "positive"}],
                   "evidence_ids": ["EVID-001"], "reasoning_summary": "一句话理由"}
        return (
            "【角色与边界】你是%s。只能输出结构化判断 JSON 对象。\n"
            "禁止修改任何数值；禁止使用截止日之后的信息；禁止给出成功率；"
            "禁止编造 evidence_ids；禁止发明示例之外的其他字段或嵌套对象。\n"
            "【当前事实（只读，禁止修改）】%s\n"
            "【输出契约】只输出一个 JSON 对象，必须严格遵循以下结构（键、类型、"
            "嵌套层次完全一致）：\n%s"
            % (self.role, facts, _json.dumps(example, ensure_ascii=False, indent=1))
        )

    def validate(self, out: dict) -> None:
        missing = [k for k in self.required_keys if k not in out]
        if missing:
            raise ValueError("agent output missing keys: %s" % missing)
        # 值域校验：direction / action / competition_response 必须在契约枚举内，
        # 同义词就近归一化（模型可能受企业人设诱导输出非契约词）
        direction = out.get("direction")
        if direction is not None:
            direction = _DIRECTION_SYNONYMS.get(direction, direction)
            if direction not in ("positive", "neutral", "negative"):
                raise ValueError("invalid direction: %r" % direction)
            out["direction"] = direction
        action = out.get("action")
        if action is not None:
            action = _ACTION_SYNONYMS.get(action, action)
            if action not in (
                    "expand", "research", "finance", "seek_orders", "contract",
                    "relocate", "wait"):
                raise ValueError("invalid action: %r" % action)
            out["action"] = action
        comp_resp = out.get("competition_response")
        if comp_resp is not None:
            comp_resp = _COMPETITION_SYNONYMS.get(comp_resp, comp_resp)
            if comp_resp not in ("price_cut", "market_focus", "wait", "escalate_request"):
                raise ValueError("invalid competition_response: %r" % comp_resp)
            out["competition_response"] = comp_resp
        # key_factors 形状规范化：模型可能给字符串数组 → 包装为 {metric_id, effect}
        kf = out.get("key_factors")
        if isinstance(kf, list) and kf and not isinstance(kf[0], dict):
            out["key_factors"] = [{"metric_id": str(x), "effect": "neutral"} for x in kf]
