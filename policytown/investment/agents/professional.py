"""四政府部门 Agent：财政 / 经信 / 科技 / 发改。

同一实现、四种配置；读 FrozenContext，写研判（方向修饰），永不改数值。
并行扇出：Agent 之间不互读输出（确定性前提），ThreadPoolExecutor 并发执行。
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable, List, Optional

from .base import BaseAgent
from ..fallback import deterministic
from ..core.context import slim_context

KINDS = ("fiscal", "economy", "sci_tech", "development")
_ROLE_NAMES = {"fiscal": "财政部门", "economy": "经信部门",
               "sci_tech": "科技部门", "development": "发改部门"}

MEMORANDUM_REQUIRED = ["agent", "department", "recommendation", "direction", "score",
                       "confidence", "core_claims", "red_lines", "acceptable_conditions",
                       "missing_info", "key_factors", "evidence_ids", "reasoning_summary"]
_REQUIRED = MEMORANDUM_REQUIRED
_RECOMMENDATIONS = ("support", "conditional_support", "hold", "oppose")
_CLAIM_TYPES = ("positive", "risk", "assumption")
_MISSING_SEVERITIES = ("high", "medium", "low")


def _memorandum_fixture() -> dict:
    """测试夹具：合法备忘录模板。"""
    return {
        "agent": "economy", "department": "经信部门", "company_id": "company_a",
        "recommendation": "conditional_support", "direction": "neutral",
        "score": 62, "confidence": 0.7,
        "core_claims": [{"claim_id": "EC-1", "claim_type": "positive",
                         "statement": "本地产业基础可承接", "evidence_ids": ["E1"]}],
        "red_lines": [{"redline_id": "EC-R1", "condition": "出资不超40%", "reason": "防锁定"}],
        "acceptable_conditions": [{"condition_id": "EC-C1", "condition": "分期拨付",
                                   "reason": "控节奏"}],
        "missing_info": [{"info_id": "EC-M1", "severity": "medium",
                          "description": "供应链测算缺失", "impact": "协同高估"}],
        "key_factors": [{"metric_id": "industrial_base", "effect": "positive"}],
        "evidence_ids": ["E1"], "reasoning_summary": "一句话理由",
    }


def validate_memorandum(out: dict) -> None:
    """初审备忘录深层校验（契约 department_memorandum.schema.json 的纯 Python 实现）。"""
    missing = [k for k in MEMORANDUM_REQUIRED if k not in out]
    if missing:
        raise ValueError("memorandum missing keys: %s" % missing)
    if out.get("recommendation") not in _RECOMMENDATIONS:
        raise ValueError("invalid recommendation: %r" % out.get("recommendation"))
    for claim in out.get("core_claims", []):
        if claim.get("claim_type") not in _CLAIM_TYPES:
            raise ValueError("invalid claim_type: %r" % claim)
        if not claim.get("statement"):
            raise ValueError("claim without statement")
    for rl in out.get("red_lines", []):
        if not rl.get("condition"):
            raise ValueError("red line without condition")
    for mi in out.get("missing_info", []):
        if mi.get("severity") not in _MISSING_SEVERITIES:
            raise ValueError("invalid missing_info severity: %r" % mi.get("severity"))


def make_professional_agents(llm_fn: Optional[Callable[[str], dict]] = None) -> List[BaseAgent]:
    return [BaseAgent(role=_ROLE_NAMES[k], required_keys=_REQUIRED, llm_fn=llm_fn)
            for k in KINDS]


def run_assessments(agents: List[BaseAgent], ctx: dict,
                    max_workers: int = 8) -> List[dict]:
    """并行扇出：每个 (agent, company) 是一份独立任务，互不读输出。"""
    tasks = []
    for agent, kind in zip(agents, KINDS):
        if kind == "fiscal":
            tasks.append((agent, kind, None))
        else:
            for company in ctx["companies"]:
                tasks.append((agent, kind, company))

    def _run(task):
        agent, kind, company = task
        cid = company["company_id"] if company else ""
        slim = slim_context(ctx, kind, cid)
        return agent.run(
            {"kind": kind, "ctx": slim},
            lambda k=kind, c=company: deterministic.professional_assessment(k, ctx, c))

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        return list(pool.map(_run, tasks))
