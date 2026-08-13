"""Broadcast adapter: unify backend structures into frontend BroadcastEvent stream.

后端把一次阶段结算的结果分散在多种结构里（deliberation / negotiation_log /
state_delta / commitment_follow_up / evidence_filter_decision / policy / event），
前端《左右面板信息架构与播报规范》要求一条统一的 BroadcastEvent 流。本模块就是
那个「统一出口」：读 StageResult + StageInput，产出按顺序编号的 BroadcastEvent 列表。

前端只消费本模块的输出，不自己从 6 种结构拼事件。
"""

from __future__ import annotations

from contracts.investment_simulation_v0_1 import (
    BroadcastEvent,
    BroadcastNavigationTarget,
    StageId,
    StageInput,
    StageResult,
)

# 后端 NegotiationEvent.phase → 前端步骤 → 唯一主操作
_PHASE_TO_STEP = {
    "verification_question": "P04/P05 核验问题",
    "enterprise_disclosure": "P05 企业回应",
    "government_condition": "P05 政府条件单",
    "enterprise_counteroffer": "P05 企业反提案",
    "final_commitment": "P05 最终条件确认",
    "rule_settlement": "P07 结算",
}

# historical_event.event_type 里需要按「政策」处理的类型，其余按环境/危机事件处理
_POLICY_EVENT_TYPES = {"policy", "policy_capital", "industry_policy"}
_EXTERNAL_EVENT_TYPES = {"external_shock", "macro", "industry_cycle"}


def _seq(events: list[BroadcastEvent]) -> str:
    return f"{len(events) + 1:03d}"


def _make(
    events: list[BroadcastEvent],
    *,
    run_id: str,
    stage: StageId,
    cutoff: str,
    event_type: str,
    related_step: str,
    title: str,
    summary: str,
    priority: str = "normal",
    actor_type: str | None = None,
    actor_id: str | None = None,
    target_id: str | None = None,
    affected_entity_ids: list[str] | None = None,
    evidence_ids: list[str] | None = None,
    impact_tags: list[str] | None = None,
    reason_codes: list[str] | None = None,
    visibility: str = "player_visible",
    requires_acknowledgement: bool = False,
    pin_until: str | None = None,
    navigation_surface: str | None = None,
    available_at: str | None = None,
    related_decision_id: str | None = None,
    related_snapshot_id: str | None = None,
) -> BroadcastEvent:
    events.append(
        BroadcastEvent(
            event_id=f"{run_id}-{stage.value}-{event_type}-{_seq(events)}",
            run_id=run_id,
            stage_code=stage,
            related_step=related_step,
            logical_time=cutoff,
            available_at=available_at or cutoff,
            cutoff_date=cutoff,
            visibility=visibility,  # type: ignore[arg-type]
            type=event_type,  # type: ignore[arg-type]
            priority=priority,  # type: ignore[arg-type]
            actor_type=actor_type,  # type: ignore[arg-type]
            actor_id=actor_id,
            target_id=target_id,
            affected_entity_ids=affected_entity_ids or [],
            title=title,
            summary=summary,
            impact_tags=impact_tags or [],
            evidence_ids=evidence_ids or [],
            reason_codes=reason_codes or [],
            related_decision_id=related_decision_id,
            related_snapshot_id=related_snapshot_id,
            requires_acknowledgement=requires_acknowledgement,
            pin_until=pin_until,  # type: ignore[arg-type]
            navigation_target=(
                BroadcastNavigationTarget(surface=navigation_surface, target_id=target_id)  # type: ignore[arg-type]
                if navigation_surface and target_id
                else None
            ),
        )
    )
    return events[-1]


def build_broadcast_events(stage_result: StageResult, stage_input: StageInput) -> list[BroadcastEvent]:
    events: list[BroadcastEvent] = []
    run_id = stage_input.run_id
    stage = stage_result.stage_id
    cutoff = stage_result.cutoff_at

    # 1) audit：证据过滤/降级（聚合为一条，避免逐条刷屏）
    if stage_result.frozen_context_audit is not None:
        withheld = [
            decision
            for decision in stage_result.frozen_context_audit.decisions
            if decision.decision == "withheld"
        ]
        if withheld:
            reason_codes = sorted({decision.reason_code for decision in withheld})
            _make(
                events,
                run_id=run_id, stage=stage, cutoff=cutoff,
                event_type="audit", related_step="P02 阶段入场",
                title=f"未来材料已隔离 · {len(withheld)} 条",
                summary="；".join(reason_codes),
                reason_codes=reason_codes,
                evidence_ids=[decision.evidence_id for decision in withheld],
                visibility="audit_only",
                priority="critical" if "published_after_cutoff" in reason_codes else "important",
                actor_type="system",
                navigation_surface="evidence_drawer",
            )

    # 2) policy：政策通告
    context = stage_result.real_data_context
    if context is not None:
        for policy in context.policies:
            _make(
                events,
                run_id=run_id, stage=stage, cutoff=cutoff,
                event_type="policy", related_step="P02 阶段入场",
                title=policy.get("title") or policy.get("policy_id", "政策"),
                summary=(
                    f"{policy.get('tool_type', '政策')}：{policy.get('tool_value_or_strength') or policy.get('conditions') or ''}".strip("：")
                ),
                impact_tags=[tag for tag in policy.get("target_industries") or []],
                evidence_ids=[f"policy:{policy.get('policy_id')}"],
                actor_type="system",
                navigation_surface="evidence_drawer",
                available_at=policy.get("information_available_date"),
            )

    # 3) natural_event：历史环境/危机/外部冲击（金融危机、产业周期、疫情等）
    if context is not None:
        for event in context.events:
            if event.get("event_type") in _POLICY_EVENT_TYPES:
                continue  # 政策类历史事件由 policy 播报承载，避免重复
            magnitude = event.get("magnitude")
            severe = str(magnitude).lower() == "high"
            _make(
                events,
                run_id=run_id, stage=stage, cutoff=cutoff,
                event_type="natural_event", related_step="P02 阶段入场",
                title=event.get("description") or event.get("event_id", "历史事件"),
                summary=f"类型 {event.get('event_type')}，强度 {magnitude}，持续 {event.get('duration') or '—'}",
                impact_tags=[f"#{industry}" for industry in event.get("affected_industries") or []],
                evidence_ids=[f"event:{event.get('event_id')}"],
                priority="critical" if severe else "important",
                actor_type="system",
                requires_acknowledgement=severe,
                pin_until="acknowledged" if severe else None,
                navigation_surface="map",
                available_at=event.get("information_available_date"),
            )

    # 4) department_interaction：四部门主张 + 质询
    for deliberation in stage_result.deliberations:
        company_id = deliberation.company_id
        for memo in deliberation.department_memos:
            _make(
                events,
                run_id=run_id, stage=stage, cutoff=cutoff,
                event_type="department_interaction", related_step="P04 四部门立场",
                title=f"{_DEPT_LABEL.get(memo.department, memo.department)}：{memo.recommendation}",
                summary=memo.core_claim,
                impact_tags=[f"#{company_id}"],
                evidence_ids=list(dict.fromkeys([*memo.supporting_evidence_ids, *memo.opposing_evidence_ids])),
                actor_type="department", actor_id=memo.department,
                target_id=company_id, affected_entity_ids=[company_id],
                navigation_surface="right_panel",
            )
        for challenge in deliberation.meeting.challenges:
            stance_changed = challenge.stance_before != challenge.stance_after
            _make(
                events,
                run_id=run_id, stage=stage, cutoff=cutoff,
                event_type="department_interaction", related_step="P04 质询",
                title=f"{_DEPT_LABEL.get(challenge.from_department, challenge.from_department)} → {_DEPT_LABEL.get(challenge.to_department, challenge.to_department)}",
                summary=f"{challenge.question}｜回应：{challenge.response or '证据不足'}",
                impact_tags=[f"#{company_id}"] + (["#立场变化"] if stance_changed else []),
                evidence_ids=challenge.evidence_ids,
                actor_type="department", actor_id=challenge.from_department,
                target_id=challenge.to_department, affected_entity_ids=[company_id],
                priority="important" if stance_changed else "normal",
                navigation_surface="right_panel",
            )

    # 5) government_enterprise：政企谈判脚本
    for deliberation in stage_result.deliberations:
        for item in deliberation.negotiation_log:
            actor_type = "enterprise" if item.actor == "company" else "system" if item.actor == "rule_engine" else "player" if item.actor == "government" else "system"
            _make(
                events,
                run_id=run_id, stage=stage, cutoff=cutoff,
                event_type="government_enterprise", related_step=_PHASE_TO_STEP.get(item.phase, item.phase),
                title=f"政企协商 · {item.phase}",
                summary=item.summary,
                evidence_ids=item.evidence_ids,
                impact_tags=[f"#{deliberation.company_id}"],
                actor_type=actor_type, actor_id=item.actor,
                target_id=deliberation.company_id, affected_entity_ids=[deliberation.company_id],
                priority="important" if "拒答" in item.summary or "反提案" in item.summary else "normal",
                navigation_surface="right_panel",
            )

    # 6) player_decision：从 PlayerAction / NegotiationChoice 派生
    for action in stage_input.actions:
        _make(
            events,
            run_id=run_id, stage=stage, cutoff=cutoff,
            event_type="player_decision", related_step="P05 最终条件确认",
            title="政府决策已记录",
            summary=f"对 {action.company_id} 执行 {action.action}，投入 {action.capital_points} 点"
            + (f"（{action.support_focus}）" if action.support_focus else ""),
            impact_tags=[f"#{action.company_id}"],
            actor_type="player", actor_id="player",
            target_id=action.company_id, affected_entity_ids=[action.company_id],
            related_decision_id=f"{stage.value}-{action.company_id}",
            navigation_surface="right_panel",
        )

    # 7) enterprise_action：企业自主行动意图（未结算）
    for action in stage_result.company_actions:
        _make(
            events,
            run_id=run_id, stage=stage, cutoff=cutoff,
            event_type="enterprise_action", related_step="P06 企业意图",
            title=f"{action.company_id} 意图：{action.action.value}",
            summary=action.milestone_target or action.risk_response,
            impact_tags=[f"#{action.company_id}", "#意图未结算"],
            evidence_ids=action.evidence_ids,
            actor_type="enterprise", actor_id=action.company_id,
            target_id=action.company_id, affected_entity_ids=[action.company_id],
            navigation_surface="map",
        )

    # 8) settlement：结算成功（规则引擎显式事件）
    _make(
        events,
        run_id=run_id, stage=stage, cutoff=cutoff,
        event_type="settlement", related_step="P07 结算",
        title="统一结算完成",
        summary=f"本阶段产生 {len(stage_result.state_deltas)} 项状态变化，财政 {stage_result.budget.before}→{stage_result.budget.after}",
        actor_type="system",
        navigation_surface="right_panel",
    )

    # 9) city_update：城市指标变化
    for delta in stage_result.state_deltas:
        if delta.entity_id not in {"city", "hefei"}:
            continue
        _make(
            events,
            run_id=run_id, stage=stage, cutoff=cutoff,
            event_type="city_update", related_step="P08 变化总览",
            title=f"城市指标 {delta.metric_id}",
            summary=f"{delta.before} → {delta.after}（{'+' if delta.delta >= 0 else ''}{delta.delta}）",
            reason_codes=[delta.reason_code],
            evidence_ids=delta.evidence_ids,
            impact_tags=[f"#{delta.metric_id}"],
            actor_type="city",
            navigation_surface="map",
        )

    # 10) commitment：承诺随访
    for follow_up in stage_result.commitment_follow_ups:
        breached = follow_up.status == "breached"
        _make(
            events,
            run_id=run_id, stage=stage, cutoff=cutoff,
            event_type="commitment", related_step="P08 承诺账",
            title=f"承诺随访：{follow_up.status}",
            summary=f"{follow_up.promise}｜{follow_up.explanation}",
            evidence_ids=follow_up.evidence_ids,
            impact_tags=[f"#{follow_up.company_id}"],
            actor_type="system",
            target_id=follow_up.company_id, affected_entity_ids=[follow_up.company_id],
            priority="critical" if breached else "important",
            requires_acknowledgement=breached,
            pin_until="acknowledged" if breached else None,
            navigation_surface="commitment_ledger",
        )

    return events


_DEPT_LABEL = {
    "finance": "财政",
    "industry_information": "经信",
    "science_technology": "科技",
    "development_reform": "发改",
}
