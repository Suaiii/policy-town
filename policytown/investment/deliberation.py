"""S1-first structured Agent deliberation.

The communication protocol supports real OpenCode Go calls for independent
memos and targeted challenges. Deterministic policies remain an explicit,
traceable fallback; an LLM never settles numeric outcomes.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from collections.abc import Callable

from pydantic import ValidationError

from contracts.investment_simulation_v0_1 import (
    BeliefLedgerEntry,
    CommitmentLedgerEntry,
    DepartmentBrief,
    DepartmentChallenge,
    DeliberationRound,
    DepartmentMemo,
    DepartmentMemoryState,
    EnterpriseAgentIntent,
    EnterpriseBeliefState,
    EnterpriseMemoryState,
    EnterprisePrivateState,
    EnterpriseResponse,
    EnterpriseCounteroffer,
    EnterpriseDisclosure,
    GovernmentConditionSheet,
    JointMeetingSummary,
    MeetingProposal,
    NegotiationEvent,
    NegotiationChoice,
    Recommendation,
    StageId,
    SupportFocus,
    VerificationQuestionCard,
)


DEPARTMENTS = (
    "finance",
    "industry_information",
    "science_technology",
    "development_reform",
)

DEPARTMENT_CONTRACT = {
    "finance": {
        "kpis": ["本期可用财政余量", "跨阶段追加暴露", "投入退出可回收性"],
        "red_lines": ["不得一次性承诺超过本轮可用余额", "未提供资金证明不释放下一笔资金"],
    },
    "industry_information": {
        "kpis": ["项目落地速度", "本地供应链协同", "人才与基础设施承载"],
        "red_lines": ["不得把规划产能直接视为已形成产业能力"],
    },
    "science_technology": {
        "kpis": ["技术成熟度", "量产与良率里程碑", "关键设备和知识产权路径"],
        "red_lines": ["未完成技术里程碑不得自动追加"],
    },
    "development_reform": {
        "kpis": ["产业方向与政策窗口", "市场周期", "长期城市布局"],
        "red_lines": ["不能仅凭政策方向替代市场需求证据"],
    },
}

CRITICAL_PROPOSITIONS = {
    "company_a": "企业是否具备已验证的建线、融资和持续扩代能力？",
    "company_d": "母公司能否在价格下降与高负债下持续提供运营资金、采购信用和技术人员？",
    "company_b": "技术团队、知识产权路径和长期资本能否按阶段形成闭环？",
}

ENTERPRISE_RESPONSE_RULES = {
    "conservative": {"response_type": "range", "statement": "企业仅披露可由公开证据支撑的区间，并要求先补齐核验材料。"},
    "balanced": {"response_type": "disclose", "statement": "企业披露可验证的阶段信息，同时保留内部财务与客户边界。"},
    "aggressive": {"response_type": "exchange_condition", "statement": "企业愿意接受分期与审计，但要求以融资连续性或配套条件换取扩张空间。"},
}


class OpenCodeGoDepartmentProvider:
    """OpenAI-compatible provider for real department deliberation calls."""

    def __init__(
        self,
        *,
        endpoint: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ) -> None:
        configured = endpoint or os.getenv("LLM_API_URL") or "https://opencode.ai/zen/go/v1"
        configured = configured.rstrip("/")
        if configured.endswith("/chat/completions"):
            self.endpoint = configured
        else:
            self.endpoint = configured.removesuffix("/v1") + "/v1/chat/completions"
        self.api_key = api_key or os.getenv("LLM_API_KEY")
        self.model = model or os.getenv("LLM_MODEL", "deepseek-v4-flash")
        self.timeout = timeout or float(os.getenv("INVESTMENT_AGENT_TIMEOUT", "15"))
        if not self.api_key:
            raise ValueError("LLM_API_KEY is required for OpenCode Go provider")

    def __call__(self, brief: DepartmentBrief) -> dict:
        is_challenge = "interaction=" in brief.state_summary
        system = (
            "你是合肥产业投资推演中的政府部门 Agent。"
            "只输出一个 JSON 对象，不要 Markdown，不要臆造证据或数字。"
            "所有 evidence_ids 只能来自 visible_facts。"
            "资本点数、状态变化和最终结算不由你决定。"
        )
        output_fields = (
            [
                "topic", "disputed_claim", "question", "evidence_ids", "response",
                "stance_after", "added_condition", "status",
            ]
            if is_challenge
            else [
                "recommendation", "core_claim", "supporting_evidence_ids",
                "opposing_evidence_ids", "assumptions", "missing_information",
                "red_lines", "acceptable_conditions", "confidence",
                "most_important_risk",
            ]
        )
        task = (
            "根据 state_summary 中的 interaction 完成一次部门间定向质询。status 只能是 answered 或 insufficient_evidence；stance_after 只能是 support、conditional_support、defer、oppose。"
            if is_challenge
            else "完成本部门独立初审，recommendation 只能是 support、conditional_support、defer、oppose。"
        )
        user = {
            "task": task + " 仅引用 visible_facts 中的 evidence_id。",
            "department": brief.department,
            "company_id": brief.company_id,
            "stage_id": brief.stage_id.value,
            "cutoff_at": brief.cutoff_at,
            "kpis": brief.department_kpis,
            "red_lines": brief.red_lines,
            "missing_information": brief.missing_information,
            "visible_facts": brief.visible_facts,
            "state_summary": brief.state_summary,
            "output_fields": output_fields,
        }
        return self.request_json(system, user)

    def request_json(self, system: str, user: dict, *, max_tokens: int = 1600) -> dict:
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps({
                "model": self.model,
                "thinking": {"type": "disabled"},
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
                ],
            }).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "OpenCode/1.0",
            },
            method="POST",
        )
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")[:500]
                last_error = OSError(f"OpenCode Go HTTP {exc.code}: {detail}")
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                last_error = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
        else:
            raise OSError(f"OpenCode Go request failed after 3 attempts: {last_error}") from last_error
        choices = payload.get("choices") or []
        content = choices[0].get("message", {}).get("content") if choices else None
        if not content:
            raise ValueError("OpenCode Go returned no assistant content")
        if isinstance(content, list):
            content = "".join(item.get("text", "") for item in content if isinstance(item, dict))
        return json.loads(content)


class DepartmentAgentRuntime:
    """可选模型适配器；任何超时、断网或 Schema 错误都返回确定性备忘录。"""

    def __init__(
        self,
        provider: Callable[[DepartmentBrief], dict | str] | None = None,
        *,
        use_api: bool | None = None,
        require_model: bool | None = None,
    ) -> None:
        if provider is not None:
            self.provider = provider
        elif use_api is True or (use_api is None and os.getenv("INVESTMENT_AGENT_LLM", "").lower() in {"1", "true", "yes", "on"}):
            self.provider = OpenCodeGoDepartmentProvider()
        else:
            self.provider = None
        self.require_model = (
            require_model
            if require_model is not None
            else os.getenv("INVESTMENT_AGENT_REQUIRE_LLM", "").lower() in {"1", "true", "yes", "on"}
        )
        self.memo_cache: dict[tuple[str, str, str], DepartmentMemo] = {}
        self.challenge_cache: dict[tuple[str, str, str, str], DepartmentChallenge] = {}

    def resolve(self, brief: DepartmentBrief, fallback: DepartmentMemo) -> DepartmentMemo:
        if self.provider is None:
            return fallback
        cache_key = (brief.context_hash, brief.company_id, brief.department)
        if cache_key in self.memo_cache:
            return self.memo_cache[cache_key]
        try:
            raw = self.provider(brief)
            payload = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(payload, dict):
                raise TypeError("department provider must return a JSON object")
            memo = DepartmentMemo.model_validate({
                **payload,
                "memo_id": fallback.memo_id,
                "department": brief.department,
                "company_id": brief.company_id,
                "input_hash": brief.context_hash,
                "generation_mode": "model",
                "fallback_reason": None,
                "assumptions": self._normalize_list(payload.get("assumptions")),
                "missing_information": self._normalize_list(payload.get("missing_information")),
                "red_lines": self._normalize_list(payload.get("red_lines")),
                "acceptable_conditions": self._normalize_list(payload.get("acceptable_conditions")),
            })
            memo = memo.model_copy(update={
                "supporting_evidence_ids": self._normalize_evidence_ids(
                    memo.supporting_evidence_ids, brief.visible_evidence_ids,
                ),
                "opposing_evidence_ids": self._normalize_evidence_ids(
                    memo.opposing_evidence_ids, brief.visible_evidence_ids,
                ),
            })
            if not set(memo.supporting_evidence_ids + memo.opposing_evidence_ids) <= set(brief.visible_evidence_ids):
                raise ValueError("model cited evidence outside frozen context")
            self.memo_cache[cache_key] = memo
            return memo
        except (TimeoutError, OSError, TypeError, ValueError, json.JSONDecodeError, ValidationError) as exc:
            if self.require_model:
                raise RuntimeError(
                    f"required model call failed for {brief.company_id}/{brief.department}: {exc}"
                ) from exc
            memo = fallback.model_copy(update={
                "generation_mode": "deterministic_fallback",
                "fallback_reason": f"{type(exc).__name__}: {exc}",
            })
            self.memo_cache[cache_key] = memo
            return memo

    @staticmethod
    def _normalize_evidence_ids(values: list[str], allowed: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            if value in allowed:
                normalized.append(value)
                continue
            matches = [
                evidence_id for evidence_id in allowed
                if evidence_id in value
                or evidence_id.split(":", 1)[-1] == value
                or evidence_id.split(":", 1)[-1] in value
                or value in evidence_id.split(":", 1)[-1]
            ]
            if len(matches) != 1:
                raise ValueError(f"model cited unknown evidence: {value}")
            normalized.append(matches[0])
        return list(dict.fromkeys(normalized))

    @staticmethod
    def _normalize_list(value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        if isinstance(value, list) and all(isinstance(item, str) for item in value):
            return value
        raise ValueError("model list field must be a string or list of strings")

    @staticmethod
    def _normalize_enterprise_action(value: object) -> str:
        mapping = {
            "proceed": "exchange_condition",
            "continue_support": "exchange_condition",
            "conditional_accept": "exchange_condition",
            "accept": "disclose",
            "disclose_range": "range",
            "decline": "refuse",
            "refuse": "refuse",
            "exchange": "exchange_condition",
            "request_partial_funding": "exchange_condition",
            "respond": "disclose",
            "negotiate": "exchange_condition",
            "provide_range": "range",
            "proceed_with_caveats": "exchange_condition",
            "affirm_with_support": "exchange_condition",
            "affirm_with_qualification": "exchange_condition",
            "qualified_accept": "exchange_condition",
        }
        if not isinstance(value, str):
            raise ValueError("enterprise action must be a string")
        return mapping.get(value, value)

    def challenge(
        self,
        *,
        sender: DepartmentMemo,
        receiver: DepartmentMemo,
        fallback: DepartmentChallenge,
        brief: DepartmentBrief,
    ) -> DepartmentChallenge:
        if self.provider is None:
            return fallback
        cache_key = (
            brief.context_hash,
            fallback.company_id,
            sender.department,
            receiver.department,
        )
        if cache_key in self.challenge_cache:
            return self.challenge_cache[cache_key]
        challenge_brief = brief.model_copy(update={
            "department": sender.department,
            "state_summary": (
                brief.state_summary
                + f"; interaction=请以{sender.department}身份质询{receiver.department}; "
                + f"receiver_claim={receiver.core_claim}; receiver_risk={receiver.most_important_risk}; "
                + f"output_override=返回 DepartmentChallenge JSON，字段为 topic, disputed_claim, question, evidence_ids, response, stance_before, stance_after, added_condition, status"
            ),
        })
        try:
            raw = self.provider(challenge_brief)
            payload = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(payload, dict):
                raise TypeError("challenge provider must return a JSON object")
            challenge = DepartmentChallenge.model_validate({
                **payload,
                "challenge_id": fallback.challenge_id,
                "company_id": fallback.company_id,
                "from_department": sender.department,
                "to_department": receiver.department,
                "stance_before": receiver.recommendation,
                "generation_mode": "model",
                "fallback_reason": None,
            })
            challenge = challenge.model_copy(update={
                "evidence_ids": self._normalize_evidence_ids(
                    challenge.evidence_ids, brief.visible_evidence_ids,
                ),
            })
            if not set(challenge.evidence_ids) <= set(brief.visible_evidence_ids):
                raise ValueError("model challenge cited evidence outside frozen context")
            self.challenge_cache[cache_key] = challenge
            return challenge
        except (TimeoutError, OSError, TypeError, ValueError, json.JSONDecodeError, ValidationError) as exc:
            if self.require_model:
                raise RuntimeError(
                    f"required challenge call failed for {fallback.company_id}/{sender.department}->{receiver.department}: {exc}"
                ) from exc
            challenge = fallback.model_copy(update={
                "generation_mode": "deterministic_fallback",
                "fallback_reason": f"{type(exc).__name__}: {exc}",
            })
            self.challenge_cache[cache_key] = challenge
            return challenge


class EnterpriseAgentRuntime:
    """企业私有状态驱动的单回合回应；模型只生成意图，不结算数值。"""

    def __init__(self, provider=None, *, use_api: bool | None = None) -> None:
        if provider is not None:
            self.provider = provider
        elif use_api is True or (use_api is None and os.getenv("INVESTMENT_AGENT_LLM", "").lower() in {"1", "true", "yes", "on"}):
            self.provider = OpenCodeGoDepartmentProvider()
        else:
            self.provider = None

    def resolve(
        self,
        private_state: EnterprisePrivateState,
        question: VerificationQuestionCard,
        evidence_ids: list[str],
        memory: EnterpriseMemoryState | None = None,
    ) -> EnterpriseAgentIntent:
        rule = ENTERPRISE_RESPONSE_RULES[private_state.risk_preference]
        stage_key = question.question_id.split("-", 1)[0] if question.question_id else "S1"
        beliefs = memory.beliefs if memory is not None else None
        action = rule["response_type"]
        requested_changes: list[str] = []
        if beliefs is not None:
            if beliefs.financing_continuity < 0.35:
                action = "range"
                requested_changes.append("先确认融资连续性，再谈扩产节奏")
            elif beliefs.market_outlook < 0.30:
                action = "exchange_condition"
                requested_changes.append("以分期拨付和客户订单换取资金窗口")
            elif beliefs.delivery_feasibility < 0.40:
                action = "range"
                requested_changes.append("以技术/建设里程碑换取下一笔资金")
            elif beliefs.government_follow_through < 0.40:
                action = "exchange_condition"
                requested_changes.append("将政府承诺写入可执行的分期条款")
        if private_state.risk_preference == "aggressive" and not requested_changes:
            requested_changes.append("以里程碑和审计换取连续融资")
        fallback = EnterpriseAgentIntent(
            company_id=private_state.company_id,
            stage_id=question.question_id.split("-", 1)[0] if question.question_id else None,
            action=action,
            statement=(
                rule["statement"]
                + " "
                + private_state.stage_context.get(stage_key, "")
            ),
            requested_changes=requested_changes,
            evidence_ids=evidence_ids[-6:],
            rationale=(
                f"企业风险偏好={private_state.risk_preference}，扩张惯性={private_state.expansion_inertia:.2f}；"
                f"披露边界={';'.join(private_state.disclosure_boundary)}；"
                f"上一阶段企业判断={memory.beliefs.model_dump_json() if memory else '初始判断'}"
            ),
        )
        if self.provider is None:
            return fallback
        try:
            if isinstance(self.provider, OpenCodeGoDepartmentProvider):
                payload = self.provider.request_json(
                    "你是企业 Agent，只输出 JSON，不要泄露政府内部判断，不要编造证据或数字。",
                    {
                        "task": "根据企业私有状态对政府核验问题做一次受约束回应。",
                        "company_id": private_state.company_id,
                        "question": question.question,
                        "critical_proposition": question.critical_proposition,
                        "private_state": private_state.model_dump(mode="json"),
                        "visible_evidence_ids": evidence_ids,
                        "output_fields": ["action", "statement", "requested_changes", "evidence_ids", "rationale"],
                    },
                    max_tokens=1000,
                )
            else:
                try:
                    payload = self.provider(
                        private_state=private_state,
                        question=question,
                        evidence_ids=evidence_ids,
                    )
                except TypeError:
                    return fallback
            if isinstance(payload, str):
                payload = json.loads(payload)
            return EnterpriseAgentIntent.model_validate({
                **payload,
                "action": DepartmentAgentRuntime._normalize_enterprise_action(payload.get("action")),
                "company_id": private_state.company_id,
                "requested_changes": DepartmentAgentRuntime._normalize_list(payload.get("requested_changes")),
                "evidence_ids": DepartmentAgentRuntime._normalize_evidence_ids(
                    payload.get("evidence_ids", []), evidence_ids,
                ),
                "generation_mode": "model",
                "fallback_reason": None,
            })
        except (TimeoutError, OSError, TypeError, ValueError, json.JSONDecodeError, ValidationError) as exc:
            return fallback.model_copy(update={
                "fallback_reason": f"{type(exc).__name__}: {exc}",
            })


def build_enterprise_memory(
    *,
    private_state: EnterprisePrivateState,
    run_id: str,
    stage_id: StageId,
    company,
    city,
    previous: EnterpriseMemoryState | None,
    intent: EnterpriseAgentIntent,
    evidence_ids: list[str],
    follow_up_statuses: list[str] | None = None,
) -> EnterpriseMemoryState:
    """Update one enterprise's private cognition without exposing it to government Context."""
    current = EnterpriseBeliefState(
        company_id=company.company_id,
        run_id=run_id,
        stage_id=stage_id,
        market_outlook=max(0.0, min(1.0, (city.market_cycle + 100) / 200)),
        financing_continuity=max(0.0, min(1.0, (company.financial_health + company.project_cashflow + 100) / 200)),
        delivery_feasibility=max(0.0, min(1.0, (company.execution_ability + company.technology_readiness + company.production_ramp) / 300)),
        government_follow_through=(
            1.0 if not follow_up_statuses or "fulfilled" in follow_up_statuses
            else 0.35 if "evidence_insufficient" in follow_up_statuses
            else 0.1
        ),
        confidence=0.55 if not previous else min(0.95, previous.beliefs.confidence + 0.05),
        update_reasons=[
            f"{stage_id.value}当前状态更新",
            f"企业意图={intent.action}",
            *([f"承诺随访={','.join(follow_up_statuses)}"] if follow_up_statuses else []),
        ],
        evidence_ids=sorted(evidence_ids)[-8:],
    )
    if previous is not None:
        old = previous.beliefs
        current = current.model_copy(update={
            field: round(getattr(old, field) * 0.65 + getattr(current, field) * 0.35, 4)
            for field in (
                "market_outlook", "financing_continuity", "delivery_feasibility",
                "government_follow_through",
            )
        })
    history = [*(previous.intent_history if previous else []), intent][-8:]
    return EnterpriseMemoryState(
        memory_id=f"{run_id}:{company.company_id}",
        run_id=run_id,
        company_id=company.company_id,
        profile_version=private_state.profile_version,
        current_stage=stage_id,
        private_state=private_state,
        beliefs=current,
        intent_history=history,
        observed_commitment_ids=list(previous.observed_commitment_ids if previous else []),
        graph_record_ids=list(previous.graph_record_ids if previous else []),
        last_update_reason=";".join(current.update_reasons),
    )
def build_department_memory(
    *,
    run_id: str,
    stage_id: StageId,
    department: str,
    company_id: str,
    memo: DepartmentMemo,
    previous: DepartmentMemoryState | None,
) -> DepartmentMemoryState:
    """更新单个部门的私有记忆（跨阶段立场、置信度与关键关切）。

    因信息差，该记忆只由本部门的职责、KPI 与红线形成，不直接与其他部门共享；
    部门之间仅通过质询传递结论。立场历史保留最近 8 轮。
    """
    history = [*(previous.stance_history if previous else []), memo.recommendation][-8:]
    return DepartmentMemoryState(
        memory_id=f"{run_id}:{company_id}:{department}",
        run_id=run_id,
        department=department,
        company_id=company_id,
        current_stage=stage_id,
        stance_history=history,
        confidence=0.5 if not previous else min(0.9, previous.confidence + 0.05),
        key_concerns=list(dict.fromkeys([memo.most_important_risk, *memo.red_lines[:2]])),
        evidence_ids=sorted(memo.supporting_evidence_ids),
        update_rule="stance_tracking_v1",
    )


def _recommendation(score: int, *, cautious: bool = False) -> Recommendation:
    if score >= 72 and not cautious:
        return "support"
    if score >= 52:
        return "conditional_support"
    if score >= 35:
        return "defer"
    return "oppose"


def _next_stage(stage_id: StageId) -> StageId | None:
    order = (StageId.S1, StageId.S2, StageId.S3, StageId.S4)
    index = order.index(stage_id) + 1
    return order[index] if index < len(order) else None


def _evidence(company_id: str, department: str, context_builder, context, extra: list[str]) -> list[str]:
    agent = {
        "finance": "fiscal",
        "industry_information": "industry",
        "science_technology": "technology",
        "development_reform": "market",
    }[department]
    ids = context_builder.evidence_ids(company_id, agent, context)
    return list(dict.fromkeys([*ids[-8:], *extra]))


def _memo(
    company, city, budget, department: str, context_builder, context,
    stage_id: StageId, extra: list[str], input_hash: str,
) -> DepartmentMemo:
    if department == "finance":
        score = (budget.before * 2 + 100 - company.capital_intensity + company.financial_health) // 4
        recommendation = _recommendation(score, cautious=True)
        claim = "项目具备资本吸引力，但财政可用余额与后续暴露需要分期控制。"
        assumptions = ["场景点数仅为玩法参数，不能代表全市可自由支配财政余额。"]
        missing = ["项目实际政府出资与提款流水", "后续追加上限与退出回收安排"]
        red_lines = ["不得一次性承诺超过本轮可用余额", "未提供资金证明前不释放下一笔资金"]
        conditions = ["分期拨付", "企业同比例出资", "季度资金使用审计"]
        risk = "资本金承诺可能转化为跨阶段追加和或有负债。"
        metric = "capital_intensity"
    elif department == "industry_information":
        score = (city.industrial_base + city.supply_chain_strength + city.infrastructure_capacity + company.execution_ability) // 4
        recommendation = _recommendation(score)
        claim = "项目与本地产业底座和供应链存在协同，但落地速度取决于执行能力。"
        assumptions = ["本地配套能在建设期内形成。"]
        missing = ["关键设备、材料和客户的本地化落实清单"]
        red_lines = ["不得把规划产能直接视为已形成产业能力"]
        conditions = ["明确本地配套里程碑", "优先采购和人才引进清单"]
        risk = "项目规模很大但本地承载能力可能滞后。"
        metric = "supply_chain_strength"
    elif department == "science_technology":
        score = (company.technology_readiness + company.execution_ability + company.production_ramp) // 3
        recommendation = _recommendation(score, cautious=company.technology_readiness < 65)
        claim = "技术路线具备推进可能，但量产、良率和设备验证仍是关键门槛。"
        assumptions = ["技术团队能够按阶段完成验证。"]
        missing = ["量产良率、关键设备验证和知识产权边界"]
        red_lines = ["未完成技术里程碑不得自动追加"]
        conditions = ["技术里程碑", "第三方测试或验收", "失败即暂停追加"]
        risk = "技术可行性尚未等同于按期量产。"
        metric = "technology_readiness"
    else:
        score = (city.market_cycle + 100 + city.policy_support + company.customer_order_strength) // 4
        recommendation = _recommendation(score)
        claim = "项目符合长期产业方向，但市场周期和产能竞争决定进入时点。"
        assumptions = ["需求窗口不会在建设期内快速逆转。"]
        missing = ["锁定客户、产品价格和竞争产能的可核验材料"]
        red_lines = ["不能仅凭政策方向替代市场需求证据"]
        conditions = ["锁定客户后再扩产", "动态复核市场价格和产能"]
        risk = "政策窗口与商业回报之间存在时间错配。"
        metric = "market_cycle"
    evidence_ids = _evidence(company.company_id, department, context_builder, context, extra)
    return DepartmentMemo(
        memo_id=f"{stage_id.value}-{company.company_id}-{department}",
        department=department,
        company_id=company.company_id,
        recommendation=recommendation,
        core_claim=claim,
        supporting_evidence_ids=evidence_ids,
        opposing_evidence_ids=[],
        assumptions=assumptions,
        missing_information=missing,
        red_lines=red_lines,
        acceptable_conditions=conditions,
        confidence=0.68 if recommendation in {"support", "conditional_support"} else 0.62,
        most_important_risk=risk,
        input_hash=input_hash,
        generation_mode="deterministic_fallback",
        fallback_reason="MVP 使用可复现的确定性研判；模型超时、断网或 Schema 失败时同样走此路径。",
    )


def _brief(
    run_id: str,
    seed: int,
    cutoff_at: str,
    context_hash: str,
    company_id: str,
    department: str,
    evidence_ids: list[str],
    missing_information: list[str],
    stage_id: StageId,
    visible_facts: list[str] | None = None,
    state_summary: str = "",
) -> DepartmentBrief:
    contract = DEPARTMENT_CONTRACT[department]
    return DepartmentBrief(
        brief_id=f"{run_id}-{stage_id.value}-{company_id}-{department}",
        run_id=run_id,
        stage_id=stage_id,
        cutoff_at=cutoff_at,
        seed=seed,
        department=department,
        company_id=company_id,
        context_hash=context_hash,
        visible_evidence_ids=evidence_ids,
        department_kpis=contract["kpis"],
        red_lines=contract["red_lines"],
        allowed_tools=["read_frozen_context", "read_source_metadata", "read_missing_information"],
        missing_information=missing_information,
        visible_facts=visible_facts or [],
        state_summary=state_summary,
    )


def _challenge(company_id: str, sender: DepartmentMemo, receiver: DepartmentMemo, evidence_ids: list[str], idx: int) -> DepartmentChallenge:
    topic = "后续财政暴露" if sender.department == "finance" else "项目兑现条件"
    question = (
        "请说明在不增加未披露财政承诺的情况下，哪些里程碑可以触发下一笔资金？"
        if sender.department == "finance"
        else "请说明你的积极判断需要哪条可核验的项目或市场证据支撑？"
    )
    after = receiver.recommendation
    if receiver.recommendation == "support":
        after = "conditional_support"
    response = "接受质询：保留项目价值判断，并补充分期、里程碑或信息披露条件。"
    return DepartmentChallenge(
        challenge_id=f"challenge-{company_id}-{idx}",
        company_id=company_id,
        from_department=sender.department,
        to_department=receiver.department,
        topic=topic,
        disputed_claim=receiver.core_claim,
        question=question,
        evidence_ids=evidence_ids,
        response=response,
        stance_before=receiver.recommendation,
        stance_after=after,
        added_condition="分期拨付并以里程碑验收" if after != receiver.recommendation else None,
        status="answered" if evidence_ids else "insufficient_evidence",
    )


def _recommend_action(memos: list[DepartmentMemo]) -> tuple[str, str]:
    """会议秘书把四部门判断透明聚合为“建议动作”；不做额外偏好判断。

    这是对已出现判断的整理（support / staged / defer / reject），
    对应联席摘要里的“建议动作”。它不替玩家拍板，玩家仍可从双方案中选择。
    """
    counts = {"support": 0, "conditional_support": 0, "defer": 0, "oppose": 0}
    for memo in memos:
        counts[memo.recommendation] += 1
    favorable = counts["support"] + counts["conditional_support"]
    unfavorable = counts["defer"] + counts["oppose"]
    if counts["oppose"] >= 2:
        return "reject", f"至少两个部门反对（oppose={counts['oppose']}），建议拒绝。"
    if unfavorable >= 3:
        return "defer", f"多数部门倾向暂缓（defer+oppose={unfavorable}），建议暂缓。"
    if favorable >= 3:
        return "support", f"多数部门支持（support+conditional_support={favorable}），建议支持。"
    return "staged", (
        f"部门立场分歧（支持{favorable} vs 暂缓/反对{unfavorable}），"
        "建议分期并附加里程碑、审计与同比例出资条件。"
    )


def deliberate(
    company,
    city,
    budget,
    context_builder,
    context,
    stage_id: StageId,
    event_evidence: list[str],
    run_id: str,
    seed: int,
    cutoff_at: str,
    context_hash: str,
    choice: NegotiationChoice | None = None,
    department_runtime: DepartmentAgentRuntime | None = None,
    enterprise_private_state: EnterprisePrivateState | None = None,
    enterprise_runtime: EnterpriseAgentRuntime | None = None,
    enterprise_memory: EnterpriseMemoryState | None = None,
    previous_department_memories: list[DepartmentMemoryState] | None = None,
):
    fallback_memos = [
        _memo(
            company, city, budget, department, context_builder, context,
            stage_id, event_evidence, context_hash,
        )
        for department in DEPARTMENTS
    ]
    visible_by_id = {
        f"observation:{item.observation_id}": item
        for item in getattr(context, "observations", [])
    }
    policy_by_id = {
        f"policy:{item.get('policy_id')}": item
        for item in getattr(context, "policies", [])
    }
    event_by_id = {
        f"event:{item.get('event_id')}": item
        for item in getattr(context, "events", [])
    }

    def fact_text(evidence_id: str) -> str:
        item = visible_by_id.get(evidence_id)
        if item is not None:
            return f"{evidence_id}: {item.entity_id}.{item.indicator_id}={item.value}{item.unit or ''}; as_of={item.effective_date}; source={item.source_id or 'unknown'}"
        item = policy_by_id.get(evidence_id) or event_by_id.get(evidence_id)
        if item is not None:
            return f"{evidence_id}: {item.get('title') or item.get('description')}; as_of={item.get('effective_date') or item.get('event_date') or item.get('policy_date')}"
        return evidence_id

    facts_by_department = {
        memo.department: [fact_text(eid) for eid in memo.supporting_evidence_ids]
        for memo in fallback_memos
    }
    frozen_visible_ids = list(dict.fromkeys(
        evidence_id
        for memo in fallback_memos
        for evidence_id in memo.supporting_evidence_ids
    ))
    frozen_visible_facts = [fact_text(evidence_id) for evidence_id in frozen_visible_ids]
    state_summary = (
        f"city={city.model_dump(mode='json')}; company={company.model_dump(mode='json')}; "
        f"budget_before={budget.before}; context_hash={context_hash}"
    )
    department_inputs = [
        _brief(
            run_id, seed, cutoff_at, context_hash, company.company_id, memo.department,
            frozen_visible_ids, memo.missing_information, stage_id,
            frozen_visible_facts, state_summary,
        )
        for memo in fallback_memos
    ]
    runtime = department_runtime or DepartmentAgentRuntime()
    memos = [
        runtime.resolve(brief, fallback)
        for brief, fallback in zip(department_inputs, fallback_memos)
    ]
    by_dept = {memo.department: memo for memo in memos}
    brief_by_dept = {brief.department: brief for brief in department_inputs}
    previous_by_dept = {
        memory.department: memory for memory in (previous_department_memories or [])
    }
    department_memories = [
        build_department_memory(
            run_id=run_id,
            stage_id=stage_id,
            department=memo.department,
            company_id=company.company_id,
            memo=memo,
            previous=previous_by_dept.get(memo.department),
        )
        for memo in memos
    ]
    challenges: list[DepartmentChallenge] = []
    if by_dept["finance"].recommendation != by_dept["industry_information"].recommendation:
        fallback = _challenge(company.company_id, by_dept["finance"], by_dept["industry_information"], by_dept["finance"].supporting_evidence_ids[-4:], 1)
        challenges.append(runtime.challenge(
            sender=by_dept["finance"], receiver=by_dept["industry_information"],
            fallback=fallback, brief=brief_by_dept["finance"],
        ))
    if by_dept["development_reform"].recommendation != by_dept["science_technology"].recommendation:
        fallback = _challenge(company.company_id, by_dept["development_reform"], by_dept["science_technology"], by_dept["development_reform"].supporting_evidence_ids[-4:], 2)
        challenges.append(runtime.challenge(
            sender=by_dept["development_reform"], receiver=by_dept["science_technology"],
            fallback=fallback, brief=brief_by_dept["development_reform"],
        ))
    if not challenges:
        fallback = _challenge(company.company_id, by_dept["finance"], by_dept["development_reform"], by_dept["finance"].supporting_evidence_ids[-4:], 1)
        challenges.append(runtime.challenge(
            sender=by_dept["finance"], receiver=by_dept["development_reform"],
            fallback=fallback, brief=brief_by_dept["finance"],
        ))

    request = min(100, max(10, company.capital_request))
    staged = max(1, round(request * 0.6))
    conservative = max(1, round(request * 0.35))
    common = [memo.department for memo in memos if memo.recommendation in {"support", "conditional_support"}]
    dissent = [memo.department for memo in memos if memo.recommendation in {"defer", "oppose"}]
    proposals = [
        MeetingProposal(
            proposal_id=f"{stage_id.value}-{company.company_id}-staged",
            company_id=company.company_id,
            label="分期支持方案",
            recommendation="conditional_support",
            capital_points=staged,
            support_focus=SupportFocus.FINANCING,
            tranches=[conservative, staged - conservative],
            conditions=["首期资金证明", "技术/建设里程碑验收", "企业同比例出资"],
            exit_condition="连续一次里程碑失败则暂停追加并评估退出",
            rationale="保留产业窗口，同时将财政暴露切成可复核的阶段承诺。",
            supporting_departments=common or ["finance"],
            dissenting_departments=dissent,
        ),
        MeetingProposal(
            proposal_id=f"{stage_id.value}-{company.company_id}-option",
            company_id=company.company_id,
            label="保留选项方案",
            recommendation="defer",
            capital_points=conservative,
            support_focus=SupportFocus.INFRASTRUCTURE,
            tranches=[conservative],
            conditions=["仅提供前期配套", "补齐客户、设备和资金证明后再评估"],
            exit_condition="超过决策窗口仍未补齐证据则终止支持",
            rationale="以较低成本保留项目落地选项，等待关键缺口被穿透。",
            supporting_departments=["finance", "science_technology"],
            dissenting_departments=[department for department in DEPARTMENTS if department not in {"finance", "science_technology"}],
        ),
    ]
    evidence_ids = list(dict.fromkeys([eid for memo in memos for eid in memo.supporting_evidence_ids]))
    recommended_action, recommendation_rationale = _recommend_action(memos)
    meeting = JointMeetingSummary(
        company_id=company.company_id,
        consensus=["项目具有一定产业或战略价值", "公开信息不足以支持无条件一次性投入"],
        unresolved_disagreements=[challenge.topic + "：" + challenge.question for challenge in challenges],
        critical_question=memos[0].missing_information[0],
        challenges=challenges,
        proposals=proposals,
        minority_opinions=[f"{memo.department}：{memo.most_important_risk}" for memo in memos if memo.department in dissent],
        evidence_ids=evidence_ids,
        recommended_action=recommended_action,
        recommendation_rationale=recommendation_rationale,
    )
    critical_proposition = CRITICAL_PROPOSITIONS.get(
        company.company_id,
        "企业是否能够将资金、技术与建设计划转化为可验收的阶段成果？",
    )
    verification_question = VerificationQuestionCard(
        question_id=f"{stage_id.value}-{company.company_id}-verify",
        company_id=company.company_id,
        critical_proposition=critical_proposition,
        question=critical_proposition,
        requested_fields=list(dict.fromkeys(
            item for memo in memos for item in memo.missing_information
        ))[:4],
        known_evidence_ids=evidence_ids[-10:],
        missing_information=list(dict.fromkeys(
            item for memo in memos for item in memo.missing_information
        ))[:4],
    )
    enterprise_disclosure = EnterpriseDisclosure(
        question_id=verification_question.question_id,
        company_id=company.company_id,
        response_type="range" if evidence_ids else "refuse",
        statement=(
            "企业仅提供当前公开证据可支持的区间，其余资金、客户与技术细项待后续披露。"
            if evidence_ids else "当前无可核验材料，企业拒绝补造数字。"
        ),
        disclosed_evidence_ids=evidence_ids[-6:],
        missing_information=verification_question.missing_information,
    )
    enterprise_intent = None
    if enterprise_private_state is not None:
        enterprise_intent = (enterprise_runtime or EnterpriseAgentRuntime(use_api=department_runtime is not None and department_runtime.provider is not None)).resolve(
            enterprise_private_state,
            verification_question,
            evidence_ids,
            memory=enterprise_memory,
        )
        enterprise_intent = enterprise_intent.model_copy(update={"stage_id": stage_id})
        enterprise_disclosure = enterprise_disclosure.model_copy(update={
            "response_type": enterprise_intent.action,
            "statement": enterprise_intent.statement,
            "disclosed_evidence_ids": enterprise_intent.evidence_ids,
        })
    selected = next((proposal for proposal in proposals if choice and choice.proposal_id == proposal.proposal_id), None)
    condition_sheet = None
    counteroffer = None
    negotiation_log = [
        NegotiationEvent(
            sequence=1, phase="verification_question", actor="government",
            summary=verification_question.question, evidence_ids=verification_question.known_evidence_ids,
        ),
        NegotiationEvent(
            sequence=2, phase="enterprise_disclosure", actor="company",
            summary=enterprise_disclosure.statement,
            evidence_ids=enterprise_disclosure.disclosed_evidence_ids,
        ),
    ]
    if choice is None or selected is None:
        response = EnterpriseResponse(
            company_id=company.company_id, response_type="no_offer", resolution="not_applicable",
            requested_capital_points=request, agreed_capital_points=0,
            accepted_conditions=[], requested_changes=[],
            rationale="企业回应将在玩家选择条件方案后触发。", evidence_ids=evidence_ids[-8:],
        )
        selected_id = None
    elif choice.resolution == "reject":
        response = EnterpriseResponse(
            company_id=company.company_id, proposal_id=selected.proposal_id, response_type="reject", resolution="rejected",
            requested_capital_points=request, agreed_capital_points=0,
            accepted_conditions=[], requested_changes=["保留原方案并等待重新谈判"],
            rationale="企业拒绝当前条件，保留继续融资或迁移的选择。", evidence_ids=evidence_ids[-8:],
        )
        selected_id = selected.proposal_id
    elif selected.capital_points < request:
        agreed_points = request if choice.resolution == "accept_counteroffer" else selected.capital_points
        agreed_tranches = (
            [agreed_points]
            if choice.resolution == "accept_counteroffer"
            else selected.tranches
        )
        condition_sheet = GovernmentConditionSheet(
            sheet_id=f"{stage_id.value}-{company.company_id}-condition",
            company_id=company.company_id,
            proposal_id=selected.proposal_id,
            action="invest",
            capital_points=agreed_points,
            support_focus=selected.support_focus,
            tranches=agreed_tranches,
            risk_conditions=selected.conditions,
            exit_condition=selected.exit_condition,
        )
        counteroffer = EnterpriseCounteroffer(
            company_id=company.company_id,
            proposal_id=selected.proposal_id,
            requested_capital_points=request,
            requested_changes=[f"希望将资金请求提高至 {request} 点"],
            rationale="企业接受分期与审计，但认为当前额度不足以覆盖建设请求。",
        )
        response = EnterpriseResponse(
            company_id=company.company_id,
            proposal_id=selected.proposal_id,
            response_type="counteroffer",
            resolution=(
                "accepted_as_modified"
                if choice.resolution == "accept_counteroffer"
                else "accepted"
            ),
            requested_capital_points=request,
            agreed_capital_points=agreed_points,
            accepted_conditions=selected.conditions,
            requested_changes=[f"希望将资金请求提高至 {request} 点"],
            rationale=(
                "企业反提案获政府接受，最终金额按企业请求结算。"
                if choice.resolution == "accept_counteroffer"
                else "企业提出提高额度的反提案，但政府未接受；最终仍按原条件方案结算。"
            ),
            evidence_ids=evidence_ids[-8:],
        )
        selected_id = selected.proposal_id
    else:
        condition_sheet = GovernmentConditionSheet(
            sheet_id=f"{stage_id.value}-{company.company_id}-condition",
            company_id=company.company_id,
            proposal_id=selected.proposal_id,
            action="invest",
            capital_points=selected.capital_points,
            support_focus=selected.support_focus,
            tranches=selected.tranches,
            risk_conditions=selected.conditions,
            exit_condition=selected.exit_condition,
        )
        response = EnterpriseResponse(
            company_id=company.company_id, proposal_id=selected.proposal_id, response_type="accept", resolution="accepted",
            requested_capital_points=request, agreed_capital_points=selected.capital_points,
            accepted_conditions=selected.conditions, requested_changes=[],
            rationale="企业接受条件方案并承诺按里程碑推进。", evidence_ids=evidence_ids[-8:],
        )
        selected_id = selected.proposal_id
    if selected is not None:
        negotiation_log.append(NegotiationEvent(
            sequence=3, phase="government_condition", actor="government",
            summary=f"政府提出 {selected.label}，资金 {selected.capital_points} 点。",
            evidence_ids=evidence_ids[-8:],
        ))
        if counteroffer is not None:
            negotiation_log.append(NegotiationEvent(
                sequence=4, phase="enterprise_counteroffer", actor="company",
                summary=counteroffer.rationale, evidence_ids=evidence_ids[-8:],
            ))
        negotiation_log.append(NegotiationEvent(
            sequence=len(negotiation_log) + 1,
            phase="final_commitment",
            actor="government",
            summary=f"协商结果：{response.resolution}，最终同意 {response.agreed_capital_points} 点。",
            evidence_ids=evidence_ids[-8:],
        ))
    deliberation = DeliberationRound(
        company_id=company.company_id,
        department_inputs=department_inputs,
        department_memos=memos,
        meeting=meeting,
        verification_question=verification_question,
        enterprise_disclosure=enterprise_disclosure,
        enterprise_intent=enterprise_intent,
        selected_proposal_id=selected_id,
        condition_sheet=condition_sheet,
        enterprise_counteroffer=counteroffer,
        enterprise_response=response,
        negotiation_log=negotiation_log,
    )
    beliefs = [
        BeliefLedgerEntry(
            belief_id=f"{stage_id.value}-{company.company_id}-market",
            company_id=company.company_id, belief_type="market_outlook",
            value=max(0, min(1, (city.market_cycle + 100) / 200)), confidence=.55,
            evidence_ids=evidence_ids[-6:], updated_at=stage_id,
        ),
        BeliefLedgerEntry(
            belief_id=f"{stage_id.value}-{company.company_id}-financing",
            company_id=company.company_id, belief_type="financing_continuity",
            value=max(0, min(1, budget.before / max(1, company.capital_request * 2))), confidence=.55,
            evidence_ids=evidence_ids[-6:], updated_at=stage_id,
        ),
    ]
    commitments: list[CommitmentLedgerEntry] = []
    if selected and response.resolution in {"accepted", "accepted_as_modified"}:
        due_stage = _next_stage(stage_id)
        agreed_points = response.agreed_capital_points
        commitments = [
            CommitmentLedgerEntry(
                commitment_id=f"{stage_id.value}-{company.company_id}-government-capital",
                stage_id=stage_id, company_id=company.company_id, party="government",
                promise=f"提供不超过{agreed_points}点的分期支持",
                due_stage=due_stage,
                condition=";".join(selected.conditions), evidence_ids=evidence_ids[-8:],
            ),
            CommitmentLedgerEntry(
                commitment_id=f"{stage_id.value}-{company.company_id}-company-milestone",
                stage_id=stage_id, company_id=company.company_id, party="company",
                promise="按里程碑完成建设/技术验证并提交资金使用证明",
                due_stage=due_stage,
                condition=";".join(selected.conditions), evidence_ids=evidence_ids[-8:],
            ),
        ]
        deliberation.negotiation_log.append(NegotiationEvent(
            sequence=len(deliberation.negotiation_log) + 1,
            phase="rule_settlement",
            actor="rule_engine",
            summary="最终条件已写入承诺账；数值仍仅由规则引擎根据 PlayerAction 结算。",
            evidence_ids=[item.commitment_id for item in commitments],
        ))
    return deliberation, beliefs, commitments, department_memories
