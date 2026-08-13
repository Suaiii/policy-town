"""Orchestrator — 唯一时序控制者，对应 run_round 循环 ①→⑥。

用法（前端/演示只面对这两个方法）：
  view = orch.open_stage()            # ①②：Context + 四部门初审备忘录 + 图投影
  result = orch.submit_decisions(d)   # ④⑤⑥：企业响应 → 结算 → 轮次输出 + 图投影
  orch.advance_stage() / orch.finish()

外层回路（replay）复用同一实例，只是 decisions 来自历史序列而非玩家。
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Dict, List, Optional

from .state import (WorldState, CityState, CompanyState, MarketConditions, Evidence)
from .message import Inbox
from .context import build_context
from .engine import RulesEngine
from .graph_projection import project
from .private_state import make_private_state
from ..memory.fact_graph import FactRecord
from ..agents.professional import make_professional_agents, run_assessments
from ..agents.company import CompanyAgent

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "hefei_mvp")
_ANON = "ABCDEF"
_STAGE_ORDER = ("S1", "S2", "S3", "S4")


class Orchestrator:
    def __init__(self, run_id: str = "demo-001", seed: int = 42,
                 llm_fn: Optional[Callable[[str], dict]] = None,
                 data_dir: Optional[str] = None) -> None:
        self.run_id = run_id
        self.seed = seed
        self.data_dir = data_dir or _DATA_DIR
        self.prototypes = {p["prototype_id"]: p for p in
                           _load_json(self.data_dir, "prototypes.json")["prototypes"]}
        self.stages = {s["stage_id"]: s for s in
                       _load_json(self.data_dir, "stages.json")["stages"]}
        self.enterprises = {e["prototype_id"]: e for e in
                            _load_json(self.data_dir, "enterprise_agents.json")["enterprises"]}
        self.engine = RulesEngine()
        self.inbox = Inbox()
        self.llm_fn = llm_fn
        self.pro_agents = make_professional_agents(llm_fn)
        self.company_agents: Dict[str, CompanyAgent] = {}
        self.state: Optional[WorldState] = None
        self._pending_view: Optional[dict] = None

    # ---------- 开局 ----------

    def start(self, company_ids: List[str], stage_id: str = "S1") -> None:
        stage = self.stages[stage_id]
        companies: Dict[str, CompanyState] = {}
        market: Dict[str, MarketConditions] = {}
        for i, pid in enumerate(company_ids):
            proto = self.prototypes[pid]
            cid = "company_%s" % pid.split("_")[-1]
            evidence = [Evidence(
                evidence_id="%s-PRE-%02d" % (pid.upper(), n + 1),
                source_id="CASE-%s" % pid.upper(),
                as_of=stage["cutoff_at"], publication_date=stage["cutoff_at"],
                value_type="derived", quality="B",
                summary="%s 截止日前背景资料 #%d" % (proto["industry_label"], n + 1))
                for n in range(2)]
            companies[cid] = CompanyState(
                company_id=cid, anon_label="企业%s" % _ANON[i],
                industry=proto["industry"],
                metrics=dict(proto["initial_metrics"]),
                cash_points=float(proto["initial_cash_points"]),
                debt_points=float(proto["initial_debt_points"]),
                capital_request=float(proto["capital_request"]),
                follow_on_thresholds=list(proto["follow_on_thresholds"]),
                event_sensitivities=dict(proto["event_sensitivities"]),
                milestone_plan=list(proto["milestones"]), evidence=evidence)
            market.setdefault(proto["industry"], MarketConditions())
        for c in companies.values():
            c.refresh_status()
        self.state = WorldState(
            run_id=self.run_id, seed=self.seed, stage_id=stage_id,
            cutoff_at=stage["cutoff_at"], round_index=0,
            city=CityState(budget_points=float(stage["budget_points"])),
            market=market, companies=companies)
        for cid in companies:
            proto_id = "proto_%s" % cid.split("_")[-1]
            self.company_agents[cid] = CompanyAgent(
                cid, enterprise=self.enterprises.get(proto_id), llm_fn=self.llm_fn)
        for cid in companies:
            proto_id = "proto_%s" % cid.split("_")[-1]
            self.company_agents[cid].private_state = make_private_state(
                companies[cid], self.enterprises.get(proto_id), self.seed)

        # 现实图谱播种：仅关键命题的可见事实（available_at=企业决策截止日）
        for cid, agent in self.company_agents.items():
            ent = agent.enterprise or {}
            kp = ent.get("key_proposition")
            if not kp:
                continue
            avail = ent.get("decision_cutoff", stage["cutoff_at"])
            for i, fact in enumerate(kp.get("visible_facts", [])):
                self.state.fact_graph.add(FactRecord(
                    fact_id="FACT-%s-%02d" % (ent.get("enterprise_id", cid).upper(), i + 1),
                    subject=cid, predicate="visible_fact", value=fact,
                    effective_at=avail, available_at=avail, visibility="public",
                    source_ids=["CASE-%s" % ent.get("prototype_id", "?").upper()]))

    # ---------- ①②：开局视图（Context + 专业研判 + 图投影） ----------

    def open_stage(self) -> dict:
        st = self._state()
        stage = self.stages[st.stage_id]
        ctx = build_context(st, self.inbox, stage["events"])
        assessments = run_assessments(self.pro_agents, ctx)
        graph = project(st, self.inbox, stage["events"])
        self._pending_view = {"context": ctx, "assessments": assessments}
        return {"stage": {"stage_id": st.stage_id, "label": stage["label"],
                          "window": stage["window"], "core_tension": stage["core_tension"]},
                "context": ctx, "department_memoranda": assessments, "graph_view": graph}

    # ---------- ④⑤⑥：提交决策 → 企业响应 → 结算 ----------

    def submit_decisions(self, decisions: List[dict]) -> dict:
        st = self._state()
        stage = self.stages[st.stage_id]
        view = self._pending_view or {"context": build_context(st, self.inbox, stage["events"]),
                                      "assessments": run_assessments(self.pro_agents, self._ctx())}
        ctx = view["context"]

        funded = {cid: 0.0 for cid in st.companies}
        for d in decisions:
            if d.get("action") in ("invest", "follow_on", "support"):
                funded[d["company_id"]] = funded.get(d["company_id"], 0.0) + float(d.get("capital_points", 0))

        def _plan(company_view: dict) -> dict:
            cid = company_view["company_id"]
            return self.company_agents[cid].plan(company_view, ctx, funded.get(cid, 0.0), st.stage_id)

        with ThreadPoolExecutor(max_workers=max(1, len(ctx["companies"]))) as pool:
            plans = list(pool.map(_plan, ctx["companies"]))

        result = self.engine.settle(st, decisions, plans, view["assessments"], stage["events"])
        for msg in result["messages"]:
            self.inbox.add(msg)

        st.history.append({"stage_id": st.stage_id,
                           "decisions": decisions,
                           "company_actions": [{"company_id": p["company_id"], "action": p["action"]}
                                               for p in plans],
                           "companies": {cid: {"metrics": dict(c.metrics),
                                               "status": c.status,
                                               "cash_points": round(c.cash_points, 2)}
                                         for cid, c in st.companies.items()}})

        graph = project(st, self.inbox, stage["events"])
        output = {
            "stage_id": st.stage_id, "cutoff_at": st.cutoff_at,
            "budget": result["budget"],
            "city_metrics": {"committed_capital": round(st.city.committed_capital, 2),
                             "industrial_base": dict(st.city.industrial_base),
                             "talent_supply": st.city.talent_supply,
                             "infrastructure_capacity": st.city.infrastructure_capacity},
            "companies": [{"company_id": c.company_id, "anon_label": c.anon_label,
                           "industry": c.industry, "status": c.status,
                           "metrics": {k: round(v, 2) for k, v in c.metrics.items()},
                           "cash_points": round(c.cash_points, 2),
                           "milestones_done": list(c.milestones_done)}
                          for c in st.companies.values()],
            "company_actions": plans,
            "department_memoranda": view["assessments"],
            "state_deltas": result["deltas"],
            "events": [{"event_id": e["event_id"], "title": e["title"]} for e in stage["events"]],
            "evidence_refs": sorted(ctx["evidence_pack"].keys()),
            "messages_new": [m.to_dict() for m in result["messages"]],
            "graph_view": graph,
            "next_candidates": [],
        }
        self._pending_view = None
        return output

    # ---------- 阶段推进与终局 ----------

    def advance_stage(self) -> dict:
        st = self._state()
        idx = _STAGE_ORDER.index(st.stage_id)
        if idx >= len(_STAGE_ORDER) - 1:
            raise RuntimeError("已是终局阶段")
        nxt = self.stages[_STAGE_ORDER[idx + 1]]
        st.stage_id = nxt["stage_id"]
        st.cutoff_at = nxt["cutoff_at"]
        st.round_index += 1
        st.city.budget_points = float(nxt["budget_points"])  # 新阶段新财政池
        return self.open_stage()

    def finish(self) -> dict:
        from ..replay.replay import score_run
        st = self._state()
        scores = score_run(st, self.prototypes)
        return {"portfolio_result": {
                    "companies": [{"company_id": c.company_id, "status": c.status,
                                   "milestones_done": list(c.milestones_done)}
                                  for c in st.companies.values()],
                    "committed_capital": round(st.city.committed_capital, 2),
                    "industrial_base": dict(st.city.industrial_base)},
                "historical_replay": scores,
                "branch_points": _branch_points(st)}

    def _state(self) -> WorldState:
        if self.state is None:
            raise RuntimeError("先调用 start()")
        return self.state

    def _ctx(self) -> dict:
        st = self._state()
        return build_context(st, self.inbox, self.stages[st.stage_id]["events"])


def _load_json(data_dir: str, name: str) -> dict:
    with open(os.path.join(data_dir, name), encoding="utf-8") as f:
        return json.load(f)


def _branch_points(st: WorldState) -> List[dict]:
    points = []
    for rec in st.history:
        for cid, snap in rec["companies"].items():
            if snap["status"] in ("承压", "停滞", "退出"):
                points.append({"stage_id": rec["stage_id"], "company_id": cid,
                               "status": snap["status"]})
    return points
