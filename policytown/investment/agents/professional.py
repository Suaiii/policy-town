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
_REQUIRED = ["agent", "department", "recommendation", "direction", "score", "confidence",
             "core_claims", "red_lines", "acceptable_conditions", "missing_info",
             "key_factors", "evidence_ids", "reasoning_summary"]
_ROLE_NAMES = {"fiscal": "财政部门", "economy": "经信部门",
               "sci_tech": "科技部门", "development": "发改部门"}


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
