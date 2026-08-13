"""GraphView 投影 — 关系图是 State 的只读视图，不存储任何数据。

每轮由编排器调用：project(state, inbox, events) → contracts/graph_view.schema.json
前端（cytoscape.js / vis-network）直接消费 nodes/edges；weight → 边粗细，
animated=True → 流光/脉冲动画（资金流、告急消息、事件冲击波）。
"""
from __future__ import annotations

from typing import List

from .state import WorldState
from .message import Inbox


def project(state: WorldState, inbox: Inbox, events: List[dict]) -> dict:
    nodes: List[dict] = []
    edges: List[dict] = []

    # 政府节点
    nodes.append({"id": "government", "kind": "government", "label": "合肥市政府",
                  "status": "", "size": 30.0})

    # 企业与产业池节点
    industries = set()
    for comp in state.companies.values():
        size = 10.0 + comp.cash_points * 0.3 + comp.metrics["construction_progress"] * 0.1
        nodes.append({"id": comp.company_id, "kind": "company",
                      "label": comp.anon_label, "status": comp.status,
                      "size": round(size, 1)})
        industries.add(comp.industry)
        # 投资边：政府 → 企业（已承诺资本）
        if comp.committed_from_gov > 0:
            edges.append({"source": "government", "target": comp.company_id,
                          "relation": "invests",
                          "weight": round(comp.committed_from_gov / 10.0, 2),
                          "animated": True})
        # 协同边：企业 → 产业池
        if comp.metrics["production_ramp"] >= 30:
            edges.append({"source": comp.company_id, "target": "industry:%s" % comp.industry,
                          "relation": "synergy",
                          "weight": round(comp.metrics["production_ramp"] / 20.0, 2),
                          "animated": False})

    for ind in sorted(industries):
        base = state.city.industrial_base.get(ind, 0.0)
        nodes.append({"id": "industry:%s" % ind, "kind": "industry",
                      "label": ind, "status": "", "size": 12.0 + base * 0.2})

    # 竞争边：同行业企业两两互连
    comps = [c for c in state.companies.values() if c.active]
    for i in range(len(comps)):
        for j in range(i + 1, len(comps)):
            a, b = comps[i], comps[j]
            if a.industry == b.industry:
                mc = state.market.get(a.industry)
                pressure = mc.supply_pressure if mc else 40.0
                edges.append({"source": a.company_id, "target": b.company_id,
                              "relation": "competes",
                              "weight": round(1.0 + pressure / 25.0, 2),
                              "animated": False})

    # 请求边：收件箱活跃消息（企业 → 政府），告急消息脉冲动画
    for msg in inbox.active(state.stage_id):
        edges.append({"source": msg.sender, "target": "government",
                      "relation": "requests",
                      "weight": round(1.0 + msg.urgency * 3.0, 2),
                      "animated": msg.type == "distress_call"})

    # 事件节点与冲击边
    for evt in events:
        ev_id = evt.get("event_id", "evt")
        nodes.append({"id": ev_id, "kind": "market_event",
                      "label": evt.get("title", ev_id), "status": "", "size": 16.0})
        scope = evt.get("scope", "all")
        for comp in comps:
            if scope == "all" or comp.industry == scope:
                edges.append({"source": ev_id, "target": comp.company_id,
                              "relation": "shocks", "weight": 2.0, "animated": True})

    return {"nodes": nodes, "edges": edges}
