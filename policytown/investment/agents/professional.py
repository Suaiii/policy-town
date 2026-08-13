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
from ..core.meeting import validate_challenge_response

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
    if out.get("agent") not in _ROLE_NAMES:
        raise ValueError("invalid agent: %r" % out.get("agent"))
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
        out = agent.run(
            {"kind": kind, "ctx": slim},
            lambda k=kind, c=company: deterministic.professional_assessment(k, ctx, c))
        # 身份以任务为准：LLM 可能回显 one-shot 示例里的其他部门
        out["agent"] = kind
        out["department"] = _ROLE_NAMES[kind]
        out["company_id"] = company["company_id"] if company else None
        return out

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        return list(pool.map(_run, tasks))


# ---------- P1：部门质询回应（LLM 可选 + 确定性 fallback） ----------

def build_challenge_prompt(payload: dict, role: str) -> str:
    import json as _json
    ch = payload["challenge"]
    facts = _json.dumps({"challenge": ch, "memo": payload["memo"]},
                        ensure_ascii=False, default=str)
    example = {
        "response_id": "RESP-01", "challenge_id": ch["challenge_id"],
        "stage_id": ch["stage_id"], "from": ch["to"], "to": ch["from"],
        "response_type": "soften",
        "statement": "部分接受质询：维持基本立场，但接受对方条件约束",
        "evidence_ids": ["EVID-001"], "confidence": 0.6,
    }
    return (
        "【角色与边界】你是%s。你是被质询部门，只能输出结构化质询回应 JSON 对象。\n"
        "你可以维持（maintain）、软化（soften）、改变（change）立场，"
        "或承认材料不足（concede_insufficient）；回应必须引用证据或明确声明缺失；"
        "禁止修改任何数值；禁止使用截止日之后的信息；禁止发明示例之外的其他字段。\n"
        "【当前事实（只读，禁止修改）】%s\n"
        "【输出契约】只输出一个 JSON 对象，必须严格遵循以下结构（response_type 只能是 "
        "maintain / soften / change / concede_insufficient）：\n%s"
        % (role, facts, _json.dumps(example, ensure_ascii=False, indent=1))
    )


class ChallengeResponderAgent(BaseAgent):
    """被质询部门 Agent：固定质询回应契约 + 质询 Prompt（只读，不改数值）。"""

    def __init__(self, role: str,
                 llm_fn: Optional[Callable[[str], dict]] = None) -> None:
        super().__init__(role=role, llm_fn=llm_fn,
                         required_keys=["response_id", "challenge_id", "stage_id",
                                        "from", "to", "response_type", "statement",
                                        "evidence_ids", "confidence"],
                         deep_validator=validate_challenge_response)

    def build_prompt(self, payload: dict) -> str:
        return build_challenge_prompt(payload, self.role)


def make_challenge_responders(llm_fn: Optional[Callable[[str], dict]] = None) -> dict:
    return {k: ChallengeResponderAgent(role=_ROLE_NAMES[k] + "（被质询回应）", llm_fn=llm_fn)
            for k in KINDS}


def run_challenge_responses(responders: dict, challenges: List[dict],
                            memoranda: List[dict], ctx: dict) -> List[dict]:
    """每个挑战触发一次定向质询回应：LLM 优先，超时/校验失败回退确定性规则。"""
    from ..core.meeting import find_memorandum

    def _respond(ch: dict) -> dict:
        memo = find_memorandum(memoranda, ch["to"], ch["company_id"]) or {}
        out = responders[ch["to"]].run(
            {"challenge": ch, "memo": memo},
            lambda: deterministic.challenge_response(ch, memo, ctx),
            validator=validate_challenge_response)
        # 身份以挑战为准：回应方 = 被质询方
        out["from"] = ch["to"]
        out["to"] = ch["from"]
        return out

    with ThreadPoolExecutor(max_workers=max(1, min(4, len(challenges)))) as pool:
        return list(pool.map(_respond, challenges))
