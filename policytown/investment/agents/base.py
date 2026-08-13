"""BaseAgent — 所有 Agent 同一基类：prompt 三段式 + 轻量校验 + 重试 + fallback。

LLM 调用通过注入 llm_fn(prompt: str, validator=...) -> dict 完成；为 None 时直接走 fallback。
校验分层：required_keys 浅层检查（BaseAgent.validate）+ 可选 deep_validator
（如 validate_memorandum / validate_verification_response）+ run() 时按契约临时注入的 validator。
"""
from __future__ import annotations

from typing import Callable, List, Optional


class BaseAgent:
    def __init__(self, role: str, required_keys: List[str],
                 llm_fn: Optional[Callable[[str], dict]] = None,
                 max_retries: int = 1,
                 deep_validator: Optional[Callable[[dict], None]] = None) -> None:
        self.role = role
        self.required_keys = required_keys
        self.llm_fn = llm_fn
        self.max_retries = max_retries
        self.deep_validator = deep_validator

    def run(self, prompt_payload: dict, fallback_fn: Callable[[], dict],
            validator: Optional[Callable[[dict], None]] = None) -> dict:
        """validator 优先于 self.validate 使用（多契约 Agent 按调用场景换校验器）。"""
        v = validator or self.validate
        if self.llm_fn is None:
            return fallback_fn()
        prompt = self.build_prompt(prompt_payload)
        for _ in range(self.max_retries + 1):
            try:
                out = self._call(prompt, v)
                v(out)
                return out
            except Exception:
                continue
        out = fallback_fn()
        out["confidence"] = 0.0
        return out

    def _call(self, prompt: str, validator: Optional[Callable[[dict], None]] = None) -> dict:
        """带 validator 调用；外部 llm_fn 不接受该参数时退化为单参调用。"""
        try:
            return self.llm_fn(prompt, validator=validator)
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
        # 值域校验：direction / action 必须在契约枚举内
        direction = out.get("direction")
        if direction is not None and direction not in ("positive", "neutral", "negative"):
            raise ValueError("invalid direction: %r" % direction)
        action = out.get("action")
        if action is not None and action not in (
                "expand", "research", "finance", "seek_orders", "contract",
                "relocate", "wait"):
            raise ValueError("invalid action: %r" % action)
        # key_factors 形状规范化：模型可能给字符串数组 → 包装为 {metric_id, effect}
        kf = out.get("key_factors")
        if isinstance(kf, list) and kf and not isinstance(kf[0], dict):
            out["key_factors"] = [{"metric_id": str(x), "effect": "neutral"} for x in kf]
        if self.deep_validator is not None:
            self.deep_validator(out)
