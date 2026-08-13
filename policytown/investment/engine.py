from __future__ import annotations

from contracts.investment_simulation_v0_1 import (
    AgentAssessment,
    BudgetState,
    CityMetrics,
    CompanyAction,
    CompanyActionType,
    CompanyState,
    CompanyStatus,
    CommitmentFollowUp,
    Direction,
    FinalResult,
    InvestmentActionType,
    KeyFactor,
    PlayerAction,
    ReplayScores,
    SimulationState,
    StageAudit,
    StageId,
    StageInput,
    StageResult,
    StateDelta,
    SupportFocus,
    TimelineEvent,
)

from .context import HefeiContextBuilder
from .deliberation import DepartmentAgentRuntime, deliberate
from .loader import HefeiMvpLoader
from .real_data import HefeiRealDataRepository


STAGE_ORDER = (StageId.S1, StageId.S2, StageId.S3, StageId.S4)


def _clamp(value: int, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, int(value)))


class InvestmentEngine:
    """确定性产业投资状态机；LLM 不参与任何数值结算。"""

    def __init__(
        self,
        loader: HefeiMvpLoader | None = None,
        real_data: HefeiRealDataRepository | None = None,
        department_provider=None,
        use_agent_api: bool | None = None,
    ) -> None:
        self.loader = loader or HefeiMvpLoader()
        self.real_data = real_data or HefeiRealDataRepository()
        self.context_builder = HefeiContextBuilder(self.loader, self.real_data)
        self.department_runtime = DepartmentAgentRuntime(
            department_provider,
            use_api=use_agent_api,
        )

    def new_run(
        self,
        run_id: str,
        company_ids: list[str] | None = None,
        *,
        seed: int = 42,
    ) -> SimulationState:
        selected = company_ids or ["company_a", "company_b", "company_d"]
        projection = self.context_builder.project(selected, self.loader.cutoff_at(StageId.S1))
        return SimulationState(
            run_id=run_id,
            seed=seed,
            treasury_balance=0,
            city_metrics=projection.city,
            companies=projection.companies,
        )

    def run_stage(self, state: SimulationState, stage_input: StageInput) -> StageResult:
        self._validate_stage(state, stage_input)
        companies = [item.model_copy(deep=True) for item in state.companies]
        city = state.city_metrics.model_copy(deep=True)
        action_by_company = {item.company_id: item for item in stage_input.actions}
        negotiation_by_company = {item.company_id: item for item in stage_input.negotiations}
        active_ids = {item.company_id for item in companies if item.status != CompanyStatus.EXITED}
        unknown_actions = sorted(set(action_by_company) - active_ids)
        if unknown_actions:
            raise ValueError(f"actions target unavailable companies: {unknown_actions}")
        unknown_negotiations = sorted(set(negotiation_by_company) - active_ids)
        if unknown_negotiations:
            raise ValueError(f"negotiations target unavailable companies: {unknown_negotiations}")

        cutoff = self.loader.cutoff_at(stage_input.stage_id)
        budget_assumption = self.loader.budget_assumption(stage_input.stage_id)
        visible_observations = {
            item.observation_id for item in self.real_data.context_at(cutoff).observations
        }
        budget_assumption.capacity_evidence = [
            item for item in budget_assumption.capacity_evidence
            if item.get("observation_id") in visible_observations
        ]
        new_fiscal_capacity = budget_assumption.new_fiscal_capacity
        gross_resources = state.treasury_balance + new_fiscal_capacity + state.exits_and_returns
        before = max(0, gross_resources - state.committed_capital - state.maintenance_cost)
        spent = sum(item.capital_points for item in stage_input.actions)
        if spent > before:
            raise ValueError(f"capital allocation {spent} exceeds available budget {before}")
        budget = BudgetState(
            before=before,
            spent=spent,
            after=before - spent,
            opening_balance=state.treasury_balance,
            new_fiscal_capacity=new_fiscal_capacity,
            stage_budget=new_fiscal_capacity,
            gross_resources=gross_resources,
            exits_and_returns=state.exits_and_returns,
            committed_capital=state.committed_capital,
            maintenance_cost=state.maintenance_cost,
            carry_out=before - spent,
            assumption=budget_assumption,
        )

        event = self.loader.event(stage_input.stage_id)
        case_ids = {
            self.loader.raw_company_config(item.company_id).get("historical_case_id")
            for item in companies
        }
        frozen_audit = self.real_data.freeze_audit(
            stage_input.stage_id,
            cutoff,
            mode=stage_input.context_mode,
            case_ids={item for item in case_ids if item},
        )
        real_adjustments, real_context = self.context_builder.adjustments(
            [item.company_id for item in companies],
            self._previous_cutoff(stage_input.stage_id),
            cutoff,
        )
        evidence_ids = set(event.evidence_ids)
        deltas: list[StateDelta] = []
        assessments: list[AgentAssessment] = []
        company_actions: list[CompanyAction] = []
        deliberations = []
        belief_updates = []
        commitment_updates = []
        next_returns = 0
        new_commitment = 0

        self._apply_real_context_adjustments(city, companies, real_adjustments, deltas)
        self._apply_city_stage_context(
            city,
            stage_input.stage_id,
            event.magnitude,
            deltas,
            self._context_event_evidence(real_context, event.evidence_ids),
        )
        commitment_follow_ups, carried_commitments = self._follow_up_commitments(
            state.commitment_ledger,
            companies,
            stage_input.stage_id,
            frozen_audit,
        )
        self._apply_follow_up_effects(
            companies,
            action_by_company,
            commitment_follow_ups,
            deltas,
        )
        self._validate_negotiation_choices(
            companies,
            city,
            budget,
            real_context,
            stage_input,
            frozen_audit,
            event.evidence_ids,
        )
        for company in companies:
            if company.status == CompanyStatus.EXITED:
                company_actions.append(self._wait_action(company))
                continue
            player_action = action_by_company.get(company.company_id)
            assessments.extend(self._assess(company, city, budget, event.evidence_ids, real_context))
            deliberation, company_beliefs, company_commitments = deliberate(
                company,
                city,
                budget,
                self.context_builder,
                real_context,
                stage_input.stage_id,
                event.evidence_ids,
                state.run_id,
                state.seed,
                cutoff,
                frozen_audit.context_hash,
                negotiation_by_company.get(company.company_id),
                self.department_runtime,
            )
            agreed_points = deliberation.enterprise_response.agreed_capital_points
            negotiation_choice = negotiation_by_company.get(company.company_id)
            if (
                player_action
                and negotiation_choice is not None
                and player_action.capital_points != agreed_points
            ):
                raise ValueError(
                    f"player action for {company.company_id} must match selected proposal; "
                    f"player action points must equal negotiated amount {agreed_points}"
                )
            deliberations.append(deliberation)
            belief_updates.extend(company_beliefs)
            commitment_updates.extend(company_commitments)
            if player_action:
                evidence_ids.add(f"PLAYER-{stage_input.stage_id.value}-{company.company_id}")
                commitment, returned = self._apply_player_action(
                    company, city, player_action, deltas, stage_input.stage_id
                )
                new_commitment += commitment
                next_returns += returned
            company_action = self._choose_company_action(company, city, player_action, event.evidence_ids)
            company_actions.append(company_action)
            self._apply_company_action(company, company_action, deltas)
            self._apply_event(
                company,
                stage_input.stage_id,
                event.magnitude,
                self._context_event_evidence(real_context, event.evidence_ids),
                deltas,
            )
            self._refresh_company_status(company)
            evidence_ids.update(company_action.evidence_ids)

        self._apply_portfolio_feedback(city, companies, deltas)
        next_stage = self._next_stage(stage_input.stage_id)
        continuing = sum(item.status != CompanyStatus.EXITED for item in companies)
        maintenance = min(18, continuing * 2 + new_commitment // 5)
        next_state = SimulationState(
            run_id=state.run_id,
            current_stage=stage_input.stage_id,
            next_stage=next_stage,
            seed=state.seed,
            treasury_balance=budget.after,
            city_metrics=city,
            companies=companies,
            committed_capital=min(25, new_commitment),
            maintenance_cost=maintenance,
            exits_and_returns=min(25, next_returns),
            belief_ledger=[*state.belief_ledger, *belief_updates],
            commitment_ledger=[*state.commitment_ledger, *commitment_updates],
            completed_stages=[*state.completed_stages, stage_input.stage_id],
            stage_audits=[
                *state.stage_audits,
                self._build_stage_audit(
                    stage_input.stage_id,
                    cutoff,
                    companies,
                    company_actions,
                    city,
                    deltas,
                    real_context,
                    commitment_follow_ups,
                    deliberations,
                    commitment_updates,
                ),
            ],
        )
        next_state.commitment_ledger = [*carried_commitments, *commitment_updates]
        timeline_events = next_state.stage_audits[-1].timeline_events
        evidence = self._merge_evidence(
            self.loader.evidence_for(evidence_ids, cutoff),
            self.real_data.evidence_at(cutoff),
        )
        return StageResult(
            stage_id=stage_input.stage_id,
            cutoff_at=cutoff,
            budget=budget,
            city_metrics=city,
            companies=companies,
            company_actions=company_actions,
            agent_assessments=assessments,
            deliberations=deliberations,
            belief_updates=belief_updates,
            commitment_updates=commitment_updates,
            commitment_follow_ups=commitment_follow_ups,
            timeline_events=timeline_events,
            state_deltas=deltas,
            events=[event],
            evidence_refs=evidence,
            real_data_context=real_context,
            frozen_context_audit=frozen_audit,
            next_candidates=[item.company_id for item in companies if item.status != CompanyStatus.EXITED],
            next_state=next_state,
        )

    @staticmethod
    def _merge_evidence(configured, real):
        merged = {item.evidence_id: item for item in configured}
        merged.update({item.evidence_id: item for item in real})
        return [merged[key] for key in sorted(merged)]

    def _previous_cutoff(self, stage_id: StageId) -> str:
        index = STAGE_ORDER.index(stage_id)
        if index == 0:
            return self.loader.cutoff_at(stage_id)
        return self.loader.cutoff_at(STAGE_ORDER[index - 1])

    def _validate_negotiation_choices(
        self,
        companies,
        city,
        budget,
        real_context,
        stage_input,
        frozen_audit,
        event_evidence,
    ) -> None:
        if not stage_input.negotiations:
            return
        company_by_id = {item.company_id: item for item in companies}
        action_by_id = {item.company_id: item for item in stage_input.actions}
        for choice in stage_input.negotiations:
            if choice.resolution == "reject":
                continue
            preview, _, _ = deliberate(
                company_by_id[choice.company_id],
                city,
                budget,
                self.context_builder,
                real_context,
                stage_input.stage_id,
                event_evidence,
                stage_input.run_id,
                stage_input.seed,
                frozen_audit.cutoff_at,
                frozen_audit.context_hash,
                department_runtime=self.department_runtime,
            )
            proposals = {item.proposal_id: item for item in preview.meeting.proposals}
            if choice.proposal_id not in proposals:
                raise ValueError(
                    f"unknown proposal_id for {choice.company_id}: {choice.proposal_id}"
                )
            proposal = proposals[choice.proposal_id]
            action = action_by_id[choice.company_id]
            expected_points = (
                proposal.capital_points
                if choice.resolution == "accept"
                else max(proposal.capital_points, company_by_id[choice.company_id].capital_request)
            )
            if action.capital_points != expected_points:
                raise ValueError(
                    f"player action for {choice.company_id} must match selected proposal; "
                    f"player action points must equal negotiated amount {expected_points}"
                )
            if proposal.support_focus and action.action == InvestmentActionType.SUPPORT:
                if action.support_focus != proposal.support_focus:
                    raise ValueError("player support focus must match negotiated proposal")

    def _context_event_evidence(self, real_context, configured: list[str]) -> list[str]:
        event_ids = [f"event:{item['event_id']}" for item in real_context.events]
        policy_ids = [f"policy:{item['policy_id']}" for item in real_context.policies]
        observation_ids = [
            f"observation:{item.observation_id}"
            for item in real_context.observations
            if item.indicator_id in {"gdp_growth", "industry_growth", "fixed_asset_investment"}
        ]
        return list(dict.fromkeys([
            *configured,
            *observation_ids[-6:],
            *event_ids[-4:],
            *policy_ids[-4:],
        ]))

    def _apply_real_context_adjustments(self, city, companies, adjustments, deltas) -> None:
        targets = {"city": city, **{item.company_id: item for item in companies}}
        for adjustment in adjustments:
            target = targets.get(adjustment.entity_id)
            if target is None or not hasattr(target, adjustment.metric_id):
                continue
            self._record(
                deltas,
                adjustment.entity_id,
                target,
                adjustment.metric_id,
                adjustment.delta,
                "real_context_update",
                [adjustment.metric_id, adjustment.formula],
                adjustment.evidence_ids,
                low=-100 if adjustment.metric_id in {"market_cycle", "project_cashflow"} else 0,
            )

    def finalize(self, state: SimulationState) -> FinalResult:
        if state.completed_stages != list(STAGE_ORDER):
            raise ValueError("final result requires a completed S1-S4 run")
        active = [item for item in state.companies if item.status != CompanyStatus.EXITED]
        average_progress = round(sum(item.construction_progress for item in active) / max(1, len(active)))
        average_health = round(sum(item.financial_health for item in active) / max(1, len(active)))
        replay = self._score_replay(state)
        case_ids = {
            self.loader.raw_company_config(item.company_id).get("historical_case_id")
            for item in state.companies
        }
        return FinalResult(
            run_id=state.run_id,
            portfolio_result={
                "active_companies": len(active),
                "average_construction_progress": average_progress,
                "average_financial_health": average_health,
                "portfolio_public_value": state.city_metrics.portfolio_public_value,
                "result_label": "场景推演结果",
            },
            historical_replay=replay,
            replay_evidence=self.real_data.replay_audit({item for item in case_ids if item}),
            branch_points=[
                "早期财政承诺压缩后续可用点数",
                "产业基础与供应链积累改变后续企业行动",
                "未获投资企业仍会受市场事件影响并继续演化",
            ],
            story_timeline=[
                item
                for audit in state.stage_audits
                for item in audit.timeline_events
            ],
        )

    def _build_stage_audit(
        self,
        stage_id,
        cutoff,
        companies,
        company_actions,
        city,
        deltas,
        real_context,
        follow_ups,
        deliberations,
        commitment_updates,
    ) -> StageAudit:
        evidence_prefixes = ("observation:", "policy:", "event:")
        evidence_backed = sum(
            any(evidence_id.startswith(evidence_prefixes) for evidence_id in item.evidence_ids)
            for item in deltas
        )
        future_evidence = sum(
            item.information_available_date > cutoff for item in real_context.observations
        )
        timeline_events = self._build_timeline_events(
            stage_id,
            cutoff,
            real_context,
            follow_ups,
            deliberations,
            commitment_updates,
            deltas,
        )
        return StageAudit(
            stage_id=stage_id,
            cutoff_at=cutoff,
            company_actions={item.company_id: item.action.value for item in company_actions},
            company_statuses={item.company_id: item.status.value for item in companies},
            construction_progress={item.company_id: item.construction_progress for item in companies},
            financial_health={item.company_id: item.financial_health for item in companies},
            supply_pressure={item.company_id: item.supply_pressure for item in companies},
            city_metrics=city.model_copy(deep=True),
            evidence_backed_deltas=evidence_backed,
            total_deltas=len(deltas),
            future_evidence_count=future_evidence,
            follow_ups=follow_ups,
            timeline_events=timeline_events,
        )

    @staticmethod
    def _follow_up_commitments(commitments, companies, stage_id, frozen_audit):
        """Each stage checks at most one due commitment per company.

        The MVP uses already-settled state as the observable milestone.  It does
        not infer a historical fact or ask an LLM to decide whether money moves.
        """
        company_by_id = {item.company_id: item for item in companies}
        due_by_company = {}
        for item in commitments:
            if item.status == "pending" and item.due_stage == stage_id:
                due_by_company.setdefault(item.company_id, []).append(item)
        selected = {
            company_id: next(
                (item for item in items if item.party == "company"),
                items[0],
            )
            for company_id, items in due_by_company.items()
        }
        follow_ups = []
        updated = []
        for item in commitments:
            if (
                selected.get(item.company_id) is None
                or selected[item.company_id].commitment_id != item.commitment_id
            ):
                updated.append(item)
                continue
            company = company_by_id.get(item.company_id)
            evidence_ids = [
                evidence_id
                for evidence_id in [*item.evidence_ids, *frozen_audit.visible_evidence_ids]
                if evidence_id in frozen_audit.visible_evidence_ids
                and (evidence_id in item.evidence_ids or item.company_id in evidence_id)
            ][-8:]
            if item.party == "government":
                status = "fulfilled"
                observed, threshold = None, None
                explanation = "政府条件已进入规则引擎，承诺金额按财政账结算。"
                triggered = "release_next_tranche"
            elif company is None:
                status = "evidence_insufficient"
                observed, threshold = None, None
                explanation = "本阶段没有可用于核验该企业承诺的状态。"
                triggered = "request_evidence"
            else:
                observed = max(
                    company.construction_progress,
                    company.technology_readiness,
                    company.production_ramp,
                )
                threshold = 45
                if observed >= threshold:
                    status = "fulfilled"
                    explanation = "建设、技术或量产指标至少一项达到阶段验收阈值。"
                    triggered = "release_next_tranche"
                elif evidence_ids:
                    status = "breached"
                    explanation = "已有阶段证据，但建设、技术与量产指标均未达到验收阈值。"
                    triggered = "pause_follow_on"
                else:
                    status = "evidence_insufficient"
                    explanation = "没有足够的本阶段可见证据确认企业是否履约。"
                    triggered = "request_evidence"
            follow_ups.append(CommitmentFollowUp(
                follow_up_id=f"{stage_id.value}-{item.commitment_id}-follow-up",
                commitment_id=item.commitment_id,
                company_id=item.company_id,
                due_stage=stage_id,
                party=item.party,
                promise=item.promise,
                status=status,
                observed_value=observed,
                threshold=threshold,
                explanation=explanation,
                evidence_ids=evidence_ids,
                triggered_action=triggered,
            ))
            ledger_status = "pending" if status == "evidence_insufficient" else status
            updated.append(item.model_copy(update={
                "status": ledger_status,
                "evidence_ids": list(dict.fromkeys([*item.evidence_ids, *evidence_ids])),
            }))
        return follow_ups, updated

    @staticmethod
    def _build_timeline_events(
        stage_id,
        cutoff,
        real_context,
        follow_ups,
        deliberations,
        commitment_updates,
        deltas,
    ):
        events = []

        def add(event_type, actor, title, summary, company_id=None, evidence_ids=None):
            events.append(TimelineEvent(
                sequence=len(events) + 1,
                stage_id=stage_id,
                cutoff_at=cutoff,
                event_type=event_type,
                actor=actor,
                title=title,
                summary=summary,
                company_id=company_id,
                evidence_ids=evidence_ids or [],
            ))

        for follow_up in follow_ups:
            add(
                "follow_up", "rule_engine", "上一阶段承诺到期",
                f"{follow_up.promise}：{follow_up.status}。{follow_up.explanation}",
                follow_up.company_id, follow_up.evidence_ids,
            )
        visible = [f"observation:{item.observation_id}" for item in real_context.observations]
        add(
            "government_knowledge", "government", "政府当时知道什么",
            f"截止 {cutoff}，冻结 Context 中有 {len(visible)} 条可见观测。",
            evidence_ids=visible[-8:],
        )
        for deliberation in deliberations:
            add(
                "government_concern", "government", "政府担心什么",
                deliberation.verification_question.critical_proposition,
                deliberation.company_id,
                deliberation.verification_question.known_evidence_ids,
            )
            add(
                "enterprise_response", "company", "企业披露或回避了什么",
                deliberation.enterprise_disclosure.statement,
                deliberation.company_id,
                deliberation.enterprise_disclosure.disclosed_evidence_ids,
            )
        for commitment in commitment_updates:
            add(
                "mutual_commitment", "both", "双方承诺了什么",
                f"{commitment.party}：{commitment.promise}",
                commitment.company_id, commitment.evidence_ids,
            )
        material = sorted(deltas, key=lambda item: abs(item.delta), reverse=True)[:3]
        add(
            "stage_outcome", "rule_engine", "后续发生了什么",
            "；".join(
                f"{item.entity_id}.{item.metric_id} {item.before}→{item.after}"
                for item in material
            ) or "本阶段没有产生数值状态变化。",
            evidence_ids=list(dict.fromkeys(
                evidence_id for item in material for evidence_id in item.evidence_ids
            )),
        )
        return events

    def _apply_follow_up_effects(self, companies, action_by_company, follow_ups, deltas):
        company_by_id = {item.company_id: item for item in companies}
        for follow_up in follow_ups:
            if follow_up.party != "company" or follow_up.status != "breached":
                continue
            action = action_by_company.get(follow_up.company_id)
            if action is not None and action.action == InvestmentActionType.FOLLOW_ON:
                raise ValueError(
                    f"follow-on is paused for {follow_up.company_id}: "
                    f"due commitment {follow_up.commitment_id} was breached"
                )
            company = company_by_id.get(follow_up.company_id)
            if company is None:
                continue
            evidence = follow_up.evidence_ids or [follow_up.commitment_id]
            self._record(
                deltas,
                company.company_id,
                company,
                "missed_windows",
                1,
                "commitment_breach",
                ["commitment_status", "milestone_threshold"],
                evidence,
            )
            self._record(
                deltas,
                company.company_id,
                company,
                "supply_pressure",
                4,
                "commitment_breach",
                ["commitment_status", "supply_pressure"],
                evidence,
            )

    def _score_replay(self, state: SimulationState) -> ReplayScores:
        if not state.stage_audits:
            raise ValueError("historical replay requires stage audits")
        first, last = state.stage_audits[0], state.stage_audits[-1]
        companies = {item.company_id: item for item in state.companies}
        case_by_company = {
            company_id: self.loader.raw_company_config(company_id).get("historical_case_id")
            for company_id in companies
        }
        outcomes = self.real_data.case_outcomes({case_id for case_id in case_by_company.values() if case_id})
        direction_hits = []
        for company_id, company in companies.items():
            expected = outcomes.get(case_by_company[company_id])
            if expected not in {"success", "failure"}:
                continue
            progressed = (
                last.construction_progress[company_id] > first.construction_progress[company_id]
                and company.status not in {CompanyStatus.STALLED, CompanyStatus.EXITED}
            )
            distressed = (
                company.status in {CompanyStatus.STALLED, CompanyStatus.EXITED}
                or company.financial_health < 40
                or company.supply_pressure > 70
            )
            direction_hits.append(progressed if expected == "success" else distressed)
        direction_score = sum(direction_hits) / len(direction_hits) if direction_hits else 0.0

        sequence_checks: list[bool] = []
        for company_id in companies:
            progress = [audit.construction_progress[company_id] for audit in state.stage_audits]
            sequence_checks.extend(next_value >= value for value, next_value in zip(progress, progress[1:]))
        sequence_score = sum(sequence_checks) / len(sequence_checks) if sequence_checks else 0.0

        evidence_backed = sum(item.evidence_backed_deltas for item in state.stage_audits)
        total_deltas = sum(item.total_deltas for item in state.stage_audits)
        mechanism_score = evidence_backed / total_deltas if total_deltas else 0.0

        path_checks = [
            last.city_metrics.industrial_base >= first.city_metrics.industrial_base,
            last.city_metrics.supply_chain_strength >= first.city_metrics.supply_chain_strength,
            last.city_metrics.portfolio_public_value >= first.city_metrics.portfolio_public_value,
        ]
        path_feedback_score = sum(path_checks) / len(path_checks)
        leakage_passed = not any(item.future_evidence_count for item in state.stage_audits)
        return ReplayScores(
            direction_score=round(direction_score, 4),
            sequence_score=round(sequence_score, 4),
            mechanism_score=round(mechanism_score, 4),
            path_feedback_score=round(path_feedback_score, 4),
            leakage_audit_passed=leakage_passed,
            calibrated_case_count=len(direction_hits),
            score_basis={
                "direction": "模拟末态方向与 case_library 中 success/failure 标签逐案匹配",
                "sequence": "各阶段 construction_progress 是否保持合理先后顺序",
                "mechanism": "state_delta 中带 observation/policy/event 证据的比例",
                "path_feedback": "产业基础、供应链和公共价值是否形成正向阶段反馈",
                "leakage": "每阶段 Context 是否仅包含 information_available_date 不晚于 cutoff 的观测",
            },
            limitations=[
                "方向评分是机制级校准，不等同于复原真实收益或财政回报。",
                "当前深校准集中于京东方与赛维类原型，其余案例仍需补充决策日前企业数据。",
            ],
        )

    def _validate_stage(self, state: SimulationState, stage_input: StageInput) -> None:
        if stage_input.run_id != state.run_id:
            raise ValueError("run_id does not match current state")
        if stage_input.seed != state.seed:
            raise ValueError("seed does not match current state")
        if state.next_stage != stage_input.stage_id:
            raise ValueError(f"expected stage {state.next_stage}, got {stage_input.stage_id}")

    @staticmethod
    def _next_stage(stage_id: StageId) -> StageId | None:
        index = STAGE_ORDER.index(stage_id)
        return STAGE_ORDER[index + 1] if index + 1 < len(STAGE_ORDER) else None

    def _record(
        self,
        deltas: list[StateDelta],
        entity_id: str,
        target: object,
        metric_id: str,
        change: int,
        reason_code: str,
        input_metric_ids: list[str],
        evidence_ids: list[str],
        *,
        low: int = 0,
        high: int = 100,
    ) -> None:
        before = int(getattr(target, metric_id))
        after = _clamp(before + change, low, high)
        if before == after:
            return
        setattr(target, metric_id, after)
        deltas.append(StateDelta(
            entity_id=entity_id,
            metric_id=metric_id,
            before=before,
            delta=after - before,
            after=after,
            reason_code=reason_code,
            input_metric_ids=input_metric_ids,
            evidence_ids=evidence_ids,
        ))

    def _apply_city_stage_context(self, city, stage_id, magnitude, deltas, evidence_ids) -> None:
        market_changes = {StageId.S1: -8, StageId.S2: 18, StageId.S3: -12, StageId.S4: 15}
        policy_changes = {StageId.S1: 0, StageId.S2: 5, StageId.S3: 12, StageId.S4: 10}
        self._record(deltas, "city", city, "market_cycle", market_changes[stage_id], "historical_event", ["market_cycle"], evidence_ids, low=-100)
        self._record(deltas, "city", city, "policy_support", policy_changes[stage_id], "policy_window", ["policy_support"], evidence_ids)

    def _apply_player_action(self, company, city, action, deltas, stage_id) -> tuple[int, int]:
        points = action.capital_points
        evidence = [f"PLAYER-{stage_id.value}-{company.company_id}"]
        common_inputs = ["capital_points", "capital_intensity", "execution_ability"]
        if action.action == InvestmentActionType.INVEST:
            self._record(deltas, company.company_id, company, "construction_progress", round(points * .45), "player_investment", common_inputs, evidence)
            self._record(deltas, company.company_id, company, "project_cashflow", round(points * .30), "player_investment", common_inputs, evidence, low=-100)
            company.cumulative_support += points
            return round(points * .20), 0
        if action.action == InvestmentActionType.SUPPORT:
            focus_map = {
                SupportFocus.INFRASTRUCTURE: "infrastructure_capacity",
                SupportFocus.TALENT: "talent_supply",
                SupportFocus.SUPPLY_CHAIN: "supply_chain_strength",
                SupportFocus.FINANCING: "portfolio_public_value",
            }
            city_metric = focus_map[action.support_focus]
            self._record(deltas, "city", city, city_metric, max(1, round(points * .20)), "player_support", ["capital_points", city_metric], evidence)
            if action.support_focus == SupportFocus.TALENT:
                self._record(deltas, company.company_id, company, "technology_readiness", round(points * .18), "talent_support", ["talent_supply", "technology_readiness"], evidence)
            elif action.support_focus == SupportFocus.SUPPLY_CHAIN:
                self._record(deltas, company.company_id, company, "customer_order_strength", round(points * .18), "supply_chain_support", ["supply_chain_strength", "customer_order_strength"], evidence)
            elif action.support_focus == SupportFocus.INFRASTRUCTURE:
                self._record(deltas, company.company_id, company, "construction_progress", round(points * .18), "infrastructure_support", ["infrastructure_capacity", "construction_progress"], evidence)
            else:
                self._record(deltas, company.company_id, company, "financial_health", round(points * .18), "financing_support", ["portfolio_public_value", "financial_health"], evidence)
            company.cumulative_support += points
            company.synergy_sources = sorted(set(company.synergy_sources + [action.support_focus.value]))
            return round(points * .12), 0
        if action.action == InvestmentActionType.FOLLOW_ON:
            self._record(deltas, company.company_id, company, "financial_health", round(points * .30), "player_follow_on", common_inputs, evidence)
            self._record(deltas, company.company_id, company, "construction_progress", round(points * .25), "player_follow_on", common_inputs, evidence)
            company.cumulative_support += points
            return round(points * .25), 0
        if action.action == InvestmentActionType.RESTRUCTURE:
            self._record(deltas, company.company_id, company, "execution_ability", 8 + round(points * .10), "player_restructure", ["execution_ability", "capital_points"], evidence)
            self._record(deltas, company.company_id, company, "project_cashflow", 6 + round(points * .10), "player_restructure", ["project_cashflow", "capital_points"], evidence, low=-100)
            company.cumulative_support += points
            return round(points * .08), 0
        company.status = CompanyStatus.EXITED
        returned = min(25, round(company.cumulative_support * .25))
        return 0, returned

    def _assess(self, company, city, budget, evidence_ids, real_context) -> list[AgentAssessment]:
        fiscal_capacity = self.context_builder.index(real_context, "city", "fiscal_capacity")
        if fiscal_capacity is None:
            fiscal_capacity = budget.before
        industry_signal = self._company_industry_signal(company.company_id, real_context)
        configs = [
            ("fiscal", (fiscal_capacity + budget.before + 100 - company.capital_intensity) // 3, "capital_intensity", "公开财政收入经分档后，与本轮余量和项目资本强度共同约束追加空间。"),
            ("industry", (city.industrial_base + city.supply_chain_strength + company.customer_order_strength + industry_signal) // 4, "industrial_base", "公开产业规模和增速与本地产业、客户协同共同决定项目落地效率。"),
            ("technology", (company.technology_readiness + company.execution_ability) // 2, "technology_readiness", "技术成熟度必须与执行能力一起判断。"),
            ("market", 50 + city.market_cycle // 2 - company.supply_pressure // 4, "market_cycle", "市场周期与供给压力决定扩产风险。"),
        ]
        result = []
        for agent, raw_score, metric, summary in configs:
            score = _clamp(raw_score)
            direction = Direction.POSITIVE if score >= 65 else Direction.NEGATIVE if score < 45 else Direction.NEUTRAL
            real_ids = self.context_builder.evidence_ids(company.company_id, agent, real_context)
            result.append(AgentAssessment(
                agent=agent,
                company_id=company.company_id,
                direction=direction,
                score=score,
                confidence=.76,
                key_factors=[KeyFactor(metric_id=metric, effect=direction)],
                evidence_ids=sorted(set([*evidence_ids, *real_ids])),
                reasoning_summary=summary,
            ))
        return result

    def _company_industry_signal(self, company_id: str, real_context) -> int:
        entities = self.context_builder.COMPANY_ENTITIES.get(company_id, set())
        growth = [
            float(item.value) for item in real_context.observations
            if item.entity_id in entities
            and item.indicator_id == "industry_growth"
            and isinstance(item.value, (int, float))
        ]
        if growth:
            return _clamp(50 + growth[-1])
        return 50

    def _choose_company_action(self, company, city, player_action, evidence_ids) -> CompanyAction:
        if company.status == CompanyStatus.EXITED:
            return self._wait_action(company)
        if company.financial_health < 35 or company.project_cashflow < -55:
            action, milestone, response = CompanyActionType.FINANCE, "cash_buffer", "seek_external_financing"
        elif company.supply_pressure > 70 or city.market_cycle < -35:
            action, milestone, response = CompanyActionType.CONTRACT, "cost_reduction", "delay_expansion"
        elif company.technology_readiness < 60:
            action, milestone, response = CompanyActionType.RESEARCH, "technical_validation", "protect_research_budget"
        elif company.customer_order_strength < 55:
            action, milestone, response = CompanyActionType.SEEK_ORDERS, "anchor_customer", "prioritize_customer_conversion"
        elif player_action and player_action.capital_points >= company.capital_request // 2:
            action, milestone, response = CompanyActionType.EXPAND, "pilot_production", "accelerate_construction"
        else:
            action, milestone, response = CompanyActionType.WAIT, "preserve_option", "keep_cash_buffer"
        allocations = {
            CompanyActionType.EXPAND: {"construction": .55, "research": .20, "market": .10, "cash_buffer": .15},
            CompanyActionType.RESEARCH: {"construction": .15, "research": .55, "market": .10, "cash_buffer": .20},
            CompanyActionType.FINANCE: {"construction": .05, "research": .10, "market": .10, "cash_buffer": .75},
            CompanyActionType.SEEK_ORDERS: {"construction": .10, "research": .10, "market": .55, "cash_buffer": .25},
            CompanyActionType.CONTRACT: {"construction": .05, "research": .10, "market": .15, "cash_buffer": .70},
            CompanyActionType.WAIT: {"construction": .05, "research": .10, "market": .10, "cash_buffer": .75},
        }
        request = _clamp(company.capital_intensity // 2 + max(0, -company.project_cashflow) // 4, 10, 80)
        return CompanyAction(
            company_id=company.company_id,
            action=action,
            capital_request_next_round=request,
            resource_allocation=allocations[action],
            milestone_target=milestone,
            risk_response=response,
            evidence_ids=evidence_ids,
            confidence=.72,
        )

    @staticmethod
    def _wait_action(company) -> CompanyAction:
        return CompanyAction(
            company_id=company.company_id,
            action=CompanyActionType.WAIT,
            capital_request_next_round=0,
            resource_allocation={"construction": 0, "research": 0, "market": 0, "cash_buffer": 1},
            milestone_target="none",
            risk_response="exited",
            evidence_ids=[],
            confidence=1,
        )

    def _apply_company_action(self, company, action, deltas) -> None:
        evidence = action.evidence_ids or ["RULE-COMPANY-ACTION"]
        if action.action == CompanyActionType.EXPAND:
            self._record(deltas, company.company_id, company, "construction_progress", 7, "company_expand", ["construction_progress", "financial_health"], evidence)
            self._record(deltas, company.company_id, company, "project_cashflow", -4, "company_expand", ["project_cashflow", "capital_intensity"], evidence, low=-100)
        elif action.action == CompanyActionType.RESEARCH:
            self._record(deltas, company.company_id, company, "technology_readiness", 6, "company_research", ["technology_readiness", "execution_ability"], evidence)
            self._record(deltas, company.company_id, company, "project_cashflow", -3, "company_research", ["project_cashflow", "capital_intensity"], evidence, low=-100)
        elif action.action == CompanyActionType.FINANCE:
            self._record(deltas, company.company_id, company, "financial_health", 4, "company_finance", ["financial_health", "project_cashflow"], evidence)
        elif action.action == CompanyActionType.SEEK_ORDERS:
            self._record(deltas, company.company_id, company, "customer_order_strength", 6, "company_seek_orders", ["customer_order_strength", "market_cycle"], evidence)
        elif action.action == CompanyActionType.CONTRACT:
            self._record(deltas, company.company_id, company, "financial_health", 3, "company_contract", ["financial_health", "supply_pressure"], evidence)
            self._record(deltas, company.company_id, company, "construction_progress", -2, "company_contract", ["construction_progress", "supply_pressure"], evidence)
        company.capital_request = action.capital_request_next_round

    def _apply_event(self, company, stage_id, magnitude, evidence_ids, deltas) -> None:
        config = self.loader.raw_company_config(company.company_id)
        sensitivity = int(config.get("event_sensitivity", {}).get(stage_id.value, 0))
        self._record(deltas, company.company_id, company, "financial_health", sensitivity // 2, "historical_event", ["financial_health", "market_cycle"], evidence_ids)
        self._record(deltas, company.company_id, company, "customer_order_strength", sensitivity, "historical_event", ["customer_order_strength", "market_cycle"], evidence_ids)
        pressure_change = max(-12, min(12, -sensitivity // 2))
        self._record(deltas, company.company_id, company, "supply_pressure", pressure_change, "historical_event", ["supply_pressure", "market_cycle"], evidence_ids)

    @staticmethod
    def _refresh_company_status(company) -> None:
        if company.status == CompanyStatus.EXITED:
            return
        if company.financial_health < 22 or company.missed_windows >= 3:
            company.status = CompanyStatus.STALLED
        elif company.financial_health < 42 or company.supply_pressure > 72:
            company.status = CompanyStatus.UNDER_PRESSURE
        elif company.production_ramp >= 35 or company.construction_progress >= 75:
            company.status = CompanyStatus.RAMPING
            company.production_ramp = _clamp(company.production_ramp + 8)
        else:
            company.status = CompanyStatus.BUILDING

    def _apply_portfolio_feedback(self, city, companies, deltas) -> None:
        active = [item for item in companies if item.status != CompanyStatus.EXITED]
        progressing = sum(item.construction_progress >= 45 for item in active)
        supported = sum(bool(item.synergy_sources) for item in active)
        stalled = sum(item.status == CompanyStatus.STALLED for item in active)
        evidence = ["RULE-PORTFOLIO-FEEDBACK"]
        if progressing:
            self._record(deltas, "city", city, "industrial_base", progressing * 2, "portfolio_feedback", ["construction_progress", "industrial_base"], evidence)
            self._record(deltas, "city", city, "employment_index", progressing, "portfolio_feedback", ["construction_progress", "employment_index"], evidence)
        if supported:
            self._record(deltas, "city", city, "supply_chain_strength", supported * 2, "path_dependence", ["synergy_sources", "supply_chain_strength"], evidence)
        self._record(deltas, "city", city, "portfolio_public_value", progressing * 2 - stalled * 2, "portfolio_feedback", ["construction_progress", "company_status"], evidence)
