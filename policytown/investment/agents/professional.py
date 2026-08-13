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


def build_memorandum_prompt(payload: dict, role: str) -> str:
    import json as _json
    facts = _json.dumps(payload, ensure_ascii=False, default=str)
    example = {
        "agent": "economy", "department": "经信部门", "company_id": "company_a",
        "recommendation": "conditional_support", "direction": "neutral",
        "score": 62, "confidence": 0.7,
        "core_claims": [
            {"claim_id": "EC-1", "claim_type": "positive",
             "statement": "本地家电整机底盘可与显示面板形成协同",
             "evidence_ids": ["EVID-001"]}],
        "red_lines": [{"redline_id": "EC-R1",
                       "condition": "政府累计出资不超过项目总投入的 40%",
                       "reason": "防止财政过度锁定"}],
        "acceptable_conditions": [
            {"condition_id": "EC-C1", "condition": "按建设里程碑分期拨付",
             "reason": "以节点验证执行能力"}],
        "missing_info": [{"info_id": "EC-M1", "severity": "medium",
                          "description": "本地供应链承接能力尚无测算",
                          "impact": "协同收益可能高估"}],
        "key_factors": [{"metric_id": "industrial_base", "effect": "positive"}],
        "evidence_ids": ["EVID-001"],
        "reasoning_summary": "一句话理由",
    }
    return (
        "【角色与边界】你是%s。只能输出结构化部门初审备忘录 JSON 对象。\n"
        "禁止修改任何数值；禁止使用截止日之后的信息；禁止给出成功率；"
        "禁止编造 evidence_ids；禁止发明示例之外的其他字段或嵌套对象。\n"
        "【当前事实（只读，禁止修改）】%s\n"
        "【输出契约】只输出一个 JSON 对象，必须严格遵循以下结构（键、类型、"
        "嵌套层次完全一致；recommendation 只能是 support / conditional_support / "
        "hold / oppose；claim_type 只能是 positive / risk / assumption；"
        "missing_info.severity 只能是 high / medium / low）：\n%s"
        % (role, facts, _json.dumps(example, ensure_ascii=False, indent=1))
    )


class DepartmentAgent(BaseAgent):
    """四部门 Agent：固定备忘录输出契约 + 备忘录 Prompt。"""

    def __init__(self, role: str,
                 llm_fn: Optional[Callable[[str], dict]] = None) -> None:
        super().__init__(role=role, required_keys=_REQUIRED, llm_fn=llm_fn,
                         deep_validator=validate_memorandum)

    def build_prompt(self, payload: dict) -> str:
        return build_memorandum_prompt(payload, self.role)


def make_professional_agents(llm_fn: Optional[Callable[[str], dict]] = None) -> List[BaseAgent]:
    return [DepartmentAgent(role=_ROLE_NAMES[k], llm_fn=llm_fn) for k in KINDS]


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
