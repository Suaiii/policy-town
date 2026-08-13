"""ContextBuilder — 纯代码，无 LLM。

职责（编排器步骤①）：装载 State → cutoff 过滤 → 匿名化 → 对手摘要 → 证据包，
产出一份全局只读的 FrozenContext（contracts/context.schema.json）。
真实案例名（historical_case）在任何时刻都不进入 Context。
"""
from __future__ import annotations

from typing import Dict, List

from .state import WorldState, Evidence
from .message import Inbox

# 企业公开视图允许的指标白名单（除此之外一律不投影）
_PUBLIC_METRICS = (
    "financial_health", "execution_ability", "technology_readiness",
    "customer_order_strength", "construction_progress", "production_ramp",
    "project_cashflow", "capital_intensity",
)


def build_context(state: WorldState, inbox: Inbox, stage_events: List[dict]) -> dict:
    cutoff = state.cutoff_at
    evidence_pack: Dict[str, dict] = {}

    # 事件证据（同样受 cutoff 约束）
    for evt in stage_events:
        ev = evt.get("evidence")
        if ev and ev.get("publication_date", "9999") <= cutoff:
            evidence_pack[ev["evidence_id"]] = dict(ev)

    companies = []
    company_list = list(state.companies.values())
    for comp in company_list:
        ev_ids = []
        for ev in comp.evidence:
            if ev.available_at(cutoff):
                evidence_pack[ev.evidence_id] = _evidence_dict(ev)
                ev_ids.append(ev.evidence_id)

        rivals = [
            {"company_id": other.company_id,
             "anon_label": other.anon_label,
             "industry": other.industry,
             "status": other.status,
             "expanding": other.metrics["construction_progress"] > 30,
             "market_pressure": _pressure_label(state.market.get(other.industry))}
            for other in company_list
            if other.company_id != comp.company_id and other.active
        ]

        companies.append({
            "company_id": comp.company_id,
            "anon_label": comp.anon_label,
            "industry": comp.industry,
            "status": comp.status,
            "metrics": {k: round(comp.metrics[k], 2) for k in _PUBLIC_METRICS},
            "cash_band": _cash_band(comp.cash_points),
            "capital_request": comp.capital_request,
            "milestones_done": list(comp.milestones_done),
            "rivals_summary": rivals,
            "evidence_ids": ev_ids,
        })

    return {
        "stage_id": state.stage_id,
        "cutoff_at": cutoff,
        "city": {
            "budget_points": state.city.budget_points,
            "committed_capital": state.city.committed_capital,
            "industrial_base": dict(state.city.industrial_base),
            "talent_supply": state.city.talent_supply,
            "infrastructure_capacity": state.city.infrastructure_capacity,
        },
        "market": {ind: {"cycle": mc.cycle, "price_trend": mc.price_trend,
                         "supply_pressure": mc.supply_pressure,
                         "policy_support": mc.policy_support}
                   for ind, mc in state.market.items()},
        "companies": companies,
        "inbox": inbox.to_list(state.stage_id),
        "evidence_pack": evidence_pack,
    }


def _evidence_dict(ev: Evidence) -> dict:
    return {"evidence_id": ev.evidence_id, "source_id": ev.source_id,
            "as_of": ev.as_of, "publication_date": ev.publication_date,
            "value_type": ev.value_type, "quality": ev.quality, "summary": ev.summary}


def _cash_band(cash: float) -> str:
    if cash < 15:
        return "紧张"
    if cash < 35:
        return "一般"
    return "充裕"


def _pressure_label(mc) -> str:
    if mc is None:
        return "unknown"
    if mc.supply_pressure >= 60:
        return "high"
    if mc.supply_pressure >= 40:
        return "mid"
    return "low"


def slim_context(ctx: dict, kind: str, company_id: str = "") -> dict:
    """Context 切片：每个 Agent 只拿自己需要的字段，缩小 prompt、加快响应。

    kind: fiscal | economy | sci_tech | development | company_plan
    对测试用的迷你 ctx（缺字段）容错。
    """
    companies = ctx.get("companies", [])
    comp = next((c for c in companies if c.get("company_id") == company_id), None)
    industry = comp.get("industry") if comp else None
    city = ctx.get("city", {})
    slim = {
        "stage_id": ctx.get("stage_id", ""),
        "cutoff_at": ctx.get("cutoff_at", ""),
        "city": {
            "budget_points": city.get("budget_points", 0),
            "committed_capital": city.get("committed_capital", 0),
        },
        "market": {},
    }
    if kind in ("economy", "company_plan", "development") and industry:
        slim["city"].update({
            "industrial_base": {k: v for k, v in city.get("industrial_base", {}).items()
                                if k == industry},
            "talent_supply": city.get("talent_supply", 0),
            "infrastructure_capacity": city.get("infrastructure_capacity", 0),
        })
        slim["market"][industry] = ctx["market"].get(industry) if ctx.get("market") else None
    if kind in ("sci_tech", "company_plan") and comp:
        slim["company"] = {
            "company_id": comp["company_id"], "anon_label": comp.get("anon_label"),
            "industry": comp["industry"], "status": comp.get("status"),
            "metrics": comp["metrics"], "cash_band": comp.get("cash_band"),
            "capital_request": comp.get("capital_request", 0),
            "milestones_done": comp.get("milestones_done", []),
            "evidence_ids": comp.get("evidence_ids", []),
        }
    if kind == "company_plan":
        slim["city"]["industrial_base"] = city.get("industrial_base", {})  # 产业协同全貌
        slim["city"]["talent_supply"] = city.get("talent_supply", 0)
        slim["city"]["infrastructure_capacity"] = city.get("infrastructure_capacity", 0)
        slim["market"] = ctx.get("market", {})
        slim["rivals_summary"] = comp.get("rivals_summary", []) if comp else []
        slim["inbox_mine"] = [m for m in ctx.get("inbox", []) if m.get("from") == company_id]
        slim["evidence_pack"] = {eid: ctx["evidence_pack"][eid]
                                 for eid in (comp.get("evidence_ids", []) if comp else [])
                                 if eid in ctx.get("evidence_pack", {})}
    elif kind == "fiscal":
        slim["company_requests"] = [{"company_id": c["company_id"],
                                     "anon_label": c["anon_label"],
                                     "industry": c["industry"],
                                     "capital_request": c["capital_request"],
                                     "cash_band": c.get("cash_band")}
                                    for c in companies]
    elif kind == "development" and industry:
        slim["company"] = {"company_id": comp["company_id"], "anon_label": comp["anon_label"],
                           "industry": comp["industry"],
                           "metrics": comp["metrics"]}
    elif kind == "economy" and industry:
        slim["company"] = {"company_id": comp["company_id"], "anon_label": comp["anon_label"],
                           "industry": comp["industry"],
                           "metrics": {k: comp["metrics"][k] for k in
                                       ("technology_readiness", "customer_order_strength")}}
    return slim
