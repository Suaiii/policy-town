"""RulesEngine — 唯一拥有数值写权限的结算器。

settle 顺序（编排器步骤⑤）：
  a. 市场池零和分配（企业间竞争）
  b. 政府资金 → 企业资金（五动作，预算守恒）
  c. 企业动作结算（Agent 决定意图，这里决定做成多少）
  d. 历史事件应用
  e. 状态刷新 + 消息触发（产生下一轮收件箱内容）

每个变化输出 state_delta：{metric_id, company_id, delta, reason_code, input_metric_ids}
LLM 的方向判断只作为 ±5% 的方向性修饰，绝不直接改数值。
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .state import WorldState
from .message import Message

# 专业 Agent 方向 → 修饰系数
_DIRECTION_MOD = {"positive": 0.05, "neutral": 0.0, "negative": -0.05}


class RulesEngine:
    def settle(self, state: WorldState, decisions: List[dict], plans: List[dict],
               assessments: List[dict], events: List[dict]) -> dict:
        deltas: List[dict] = []
        messages: List[Message] = []
        budget_before = state.city.budget_points
        spent = 0.0
        recovered = 0.0

        mods = self._direction_modifiers(assessments)
        plan_by_company = {p["company_id"]: p for p in plans}

        # ---- a. 市场池零和分配：同行业企业争夺份额（竞争响应影响份额） ----
        deltas += self._market_allocation(state, mods, plan_by_company)

        # ---- b. 政府决策 ----
        for d in decisions:
            comp = state.companies.get(d.get("company_id"))
            if comp is None or not comp.active:
                continue
            action = d.get("action")
            points = float(d.get("capital_points", 0))
            if action in ("invest", "follow_on", "support"):
                affordable = max(0.0, budget_before - spent)
                points = min(points, affordable)  # 超额截断，保守恒
                spent += points
                comp.invested = True
                comp.rounds_unfunded = 0
                comp.committed_from_gov += points
                state.city.committed_capital += points
                if action in ("invest", "follow_on"):
                    comp.cash_points += points
                    exec_f = 0.5 + comp.metrics["execution_ability"] / 100.0
                    gain = points * 0.25 * exec_f * (1 + mods.get(comp.company_id, 0.0))
                    comp.metrics["construction_progress"] += gain
                    deltas.append(self._d(comp, "construction_progress", gain,
                                          "GOV_INVEST", ["execution_ability"]))
                    if comp.metrics["construction_progress"] >= 60:
                        ramp = points * 0.15 * exec_f
                        comp.metrics["production_ramp"] += ramp
                        deltas.append(self._d(comp, "production_ramp", ramp,
                                              "GOV_INVEST_RAMP", ["construction_progress"]))
                else:  # support
                    focus = d.get("support_focus", "infrastructure")
                    self._apply_support(state, comp, focus, points, deltas)
            elif action == "restructure":
                cost = min(comp.committed_from_gov * 0.1, budget_before - spent)
                spent += cost
                comp.debt_points *= 0.6
                comp.metrics["construction_progress"] -= 5
                deltas.append(self._d(comp, "construction_progress", -5, "RESTRUCTURE", []))
            elif action == "exit":
                recover = comp.committed_from_gov * 0.4
                recovered += recover
                state.city.committed_capital -= comp.committed_from_gov
                comp.committed_from_gov = 0.0
                comp.active = False
                deltas.append(self._d(comp, "cash_points", 0, "EXIT", []))

        # ---- c. 企业动作结算 ----
        for comp in state.companies.values():
            if not comp.active:
                continue
            plan = plan_by_company.get(comp.company_id)
            if plan is None:
                plan = {"action": "wait", "risk_response": "", "competition_response": "wait",
                        "capital_request_next_round": comp.capital_request}
            got_funding = any(d.get("company_id") == comp.company_id
                              and d.get("action") in ("invest", "follow_on", "support")
                              and d.get("capital_points", 0) > 0 for d in decisions)
            if not got_funding:
                comp.rounds_unfunded += 1
            deltas += self._apply_company_action(state, comp, plan, mods)
            # 企业发给政府的消息（下一轮生效）
            msg = self._company_message(comp, plan, state.stage_id)
            if msg is not None:
                messages.append(msg)

        # ---- d. 历史事件 ----
        for evt in events:
            deltas += self._apply_event(state, evt, mods)

        # ---- e. 状态刷新 + 消息触发 ----
        for comp in state.companies.values():
            comp.clamp_metrics()
            comp.refresh_status()
            newly = comp.check_milestones()
            for ms in newly:
                messages.append(Message(
                    channel="company_to_government", sender=comp.company_id, to="government",
                    type="progress_report", urgency=0.5,
                    state_evidence=self._company_evidence_ids(comp),
                    content="%s：达成里程碑 %s" % (comp.anon_label, ms),
                    created_stage=state.stage_id))
                # 里程碑反哺城市产业基础（路径反馈）
                if ms in ("pilot_production", "scale_up"):
                    base = state.city.industrial_base.get(comp.industry, 0.0)
                    state.city.industrial_base[comp.industry] = base + 6
                    deltas.append({"metric_id": "industrial_base.%s" % comp.industry,
                                   "company_id": None, "delta": 6,
                                   "reason_code": "PATH_FEEDBACK",
                                   "input_metric_ids": ["production_ramp"]})
            messages += self._auto_messages(comp, state.stage_id)

        state.city.budget_points = budget_before - spent + recovered
        state.city.clamp()
        for mc in state.market.values():
            mc.clamp()

        return {"deltas": deltas, "messages": messages,
                "budget": {"before": round(budget_before, 2), "spent": round(spent, 2),
                           "recovered": round(recovered, 2),
                           "after": round(state.city.budget_points, 2)}}

    # ---------- 内部 ----------

    def _market_allocation(self, state: WorldState, mods: Dict[str, float],
                           plans: Dict[str, dict]) -> List[dict]:
        """同行业共享市场池：竞争力高者挤占对手订单；price_cut 以利润换份额。"""
        deltas: List[dict] = []
        by_industry: Dict[str, list] = {}
        for comp in state.companies.values():
            if comp.active:
                by_industry.setdefault(comp.industry, []).append(comp)
        for industry, comps in by_industry.items():
            if len(comps) < 2:
                continue
            mc = state.market.get(industry)
            scarcity = 1.0 + (mc.supply_pressure / 100.0 if mc else 0.4)
            strengths = {}
            for c in comps:
                comp_factor = (0.4 * c.metrics["technology_readiness"]
                               + 0.4 * c.metrics["customer_order_strength"]
                               + 0.2 * c.metrics["production_ramp"])
                resp = plans.get(c.company_id, {}).get("competition_response", "wait")
                if resp == "price_cut":
                    comp_factor *= 1.15
                    c.metrics["project_cashflow"] -= 5
                    deltas.append(self._d(c, "project_cashflow", -5, "PRICE_WAR", []))
                elif resp == "market_focus":
                    comp_factor *= 1.08
                strengths[c.company_id] = max(1.0, comp_factor * (1 + mods.get(c.company_id, 0.0)))
            total = sum(strengths.values())
            mean_share = 1.0 / len(comps)
            for c in comps:
                share = strengths[c.company_id] / total
                shift = (share - mean_share) * 10 * scarcity
                if abs(shift) < 0.5:
                    continue
                c.metrics["customer_order_strength"] += shift
                deltas.append(self._d(c, "customer_order_strength", shift,
                                      "MARKET_SHARE", ["technology_readiness", "production_ramp"]))
        return deltas

    def _apply_support(self, state: WorldState, comp, focus: str, points: float,
                       deltas: List[dict]) -> None:
        if focus == "infrastructure":
            state.city.infrastructure_capacity += points * 0.2
            comp.metrics["construction_progress"] += points * 0.15
            deltas.append(self._d(comp, "construction_progress", points * 0.15,
                                  "SUPPORT_INFRA", ["infrastructure_capacity"]))
        elif focus == "talent":
            state.city.talent_supply += points * 0.2
            comp.metrics["technology_readiness"] += points * 0.15
            deltas.append(self._d(comp, "technology_readiness", points * 0.15,
                                  "SUPPORT_TALENT", ["talent_supply"]))
        elif focus == "supply_chain":
            state.city.industrial_base[comp.industry] = \
                state.city.industrial_base.get(comp.industry, 0.0) + points * 0.2
            comp.metrics["customer_order_strength"] += points * 0.15
            deltas.append(self._d(comp, "customer_order_strength", points * 0.15,
                                  "SUPPORT_SUPPLY", ["industrial_base"]))
        elif focus == "financing":
            comp.cash_points += points * 0.8
            comp.debt_points += points * 0.3
            deltas.append(self._d(comp, "cash_points", points * 0.8, "SUPPORT_FIN", []))

    def _apply_company_action(self, state: WorldState, comp, plan: dict,
                              mods: Dict[str, float]) -> List[dict]:
        deltas: List[dict] = []
        action = plan.get("action", "wait")
        exec_f = 0.5 + comp.metrics["execution_ability"] / 100.0
        mod = 1 + mods.get(comp.company_id, 0.0)
        mc = state.market.get(comp.industry)
        market_f = 1 + (mc.cycle / 200.0 if mc else 0.0)

        if action == "expand" and comp.cash_points >= 15:
            comp.cash_points -= 15
            g1 = 12 * exec_f * mod
            comp.metrics["construction_progress"] += g1
            deltas.append(self._d(comp, "construction_progress", g1, "ACT_EXPAND", ["execution_ability"]))
            if comp.metrics["construction_progress"] >= 60:
                g2 = 14 * exec_f * mod * max(0.5, market_f)
                comp.metrics["production_ramp"] += g2
                deltas.append(self._d(comp, "production_ramp", g2, "ACT_EXPAND", ["construction_progress"]))
        elif action == "research" and comp.cash_points >= 10:
            comp.cash_points -= 10
            g = 8 * exec_f * mod
            comp.metrics["technology_readiness"] += g
            deltas.append(self._d(comp, "technology_readiness", g, "ACT_RESEARCH", ["execution_ability"]))
        elif action == "finance":
            comp.cash_points += 18
            comp.debt_points += 14
            comp.metrics["project_cashflow"] += 10
            deltas.append(self._d(comp, "project_cashflow", 10, "ACT_FINANCE", []))
        elif action == "seek_orders" and comp.cash_points >= 4:
            comp.cash_points -= 4
            g = 7 * market_f * mod
            comp.metrics["customer_order_strength"] += g
            deltas.append(self._d(comp, "customer_order_strength", g, "ACT_ORDERS", ["market.cycle"]))
        elif action == "contract":
            comp.cash_points += 6
            comp.metrics["construction_progress"] -= 4
            comp.metrics["production_ramp"] -= 4
            deltas.append(self._d(comp, "construction_progress", -4, "ACT_CONTRACT", []))
        elif action == "relocate":
            comp.active = False
            deltas.append(self._d(comp, "cash_points", 0, "ACT_RELOCATE", []))
        else:  # wait / 资源不足时的动作降级
            comp.cash_points += 2
            if action not in ("wait",):
                deltas.append(self._d(comp, "cash_points", 2, "ACT_DOWNGRADE", ["cash_points"]))
        return deltas

    def _apply_event(self, state: WorldState, evt: dict, mods: Dict[str, float]) -> List[dict]:
        deltas: List[dict] = []
        scope = evt.get("scope", "all")
        effects = evt.get("effects", {})
        tag = evt.get("mechanism_tag", "")
        targets = [c for c in state.companies.values()
                   if c.active and (scope == "all" or c.industry == scope)]
        for comp in targets:
            sens = comp.event_sensitivities.get(tag, 1.0)
            for key, raw in effects.items():
                layer, metric = key.split(".", 1)
                val = float(raw)
                if layer == "market" and (scope == comp.industry or scope == "all"):
                    mc = state.market.get(comp.industry)
                    if mc is not None and hasattr(mc, metric):
                        setattr(mc, metric, getattr(mc, metric) + val)
                elif layer == "company":
                    eff = val * sens * (1 + mods.get(comp.company_id, 0.0))
                    comp.metrics[metric] += eff
                    if tag and tag not in comp.risk_mechanisms_fired and eff < 0:
                        comp.risk_mechanisms_fired.append(tag)
                    deltas.append({"metric_id": metric, "company_id": comp.company_id,
                                   "delta": round(eff, 2),
                                   "reason_code": "EVENT:%s" % evt.get("event_id", "?"),
                                   "input_metric_ids": [tag]})
        return deltas

    def _auto_messages(self, comp, stage_id: str) -> List[Message]:
        msgs: List[Message] = []
        if not comp.active:
            return msgs
        if comp.cash_points < 20:
            msgs.append(Message(
                channel="company_to_government", sender=comp.company_id, to="government",
                type="distress_call", urgency=0.8,
                state_evidence=self._company_evidence_ids(comp),
                content="%s：现金缓冲告急（档位：紧张），请求紧急支持，否则项目面临停建"
                        % comp.anon_label,
                created_stage=stage_id))
        elif comp.rounds_unfunded >= 2 and not comp.invested:
            msgs.append(Message(
                channel="company_to_government", sender=comp.company_id, to="government",
                type="threat", urgency=0.6,
                state_evidence=self._company_evidence_ids(comp),
                content="%s：连续多轮未获支持，正评估迁往其他城市" % comp.anon_label,
                created_stage=stage_id))
        return msgs

    def _company_message(self, comp, plan: dict, stage_id: str) -> Optional[Message]:
        req = float(plan.get("capital_request_next_round", 0))
        comp.capital_request = req
        if req <= 0 or not comp.active:
            return None
        return Message(channel="company_to_government", sender=comp.company_id,
                       to="government", type="capital_request",
                       urgency=min(1.0, req / 60.0),
                       state_evidence=self._company_evidence_ids(comp),
                       content="%s：下轮申请 %d 点（目标里程碑 %s）"
                               % (comp.anon_label, int(req), plan.get("milestone_target", "-")),
                       created_stage=stage_id)

    def _direction_modifiers(self, assessments: List[dict]) -> Dict[str, float]:
        mods: Dict[str, float] = {}
        for a in assessments:
            cid = a.get("company_id")
            if not cid:
                continue
            mod = _DIRECTION_MOD.get(a.get("direction", "neutral"), 0.0) * float(a.get("confidence", 0.5))
            mods[cid] = max(-0.15, min(0.15, mods.get(cid, 0.0) + mod))
        return mods

    @staticmethod
    def _d(comp, metric: str, delta: float, reason: str, inputs: List[str]) -> dict:
        return {"metric_id": metric, "company_id": comp.company_id,
                "delta": round(delta, 2), "reason_code": reason,
                "input_metric_ids": inputs}

    @staticmethod
    def _company_evidence_ids(comp) -> List[str]:
        return [ev.evidence_id for ev in comp.evidence[:2]]
