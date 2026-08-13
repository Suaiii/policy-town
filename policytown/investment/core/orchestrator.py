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
from .meeting import (build_challenges, detect_conflicts, find_memorandum,
                      make_minutes, position_revision)
from .questions import build_question_cards, validate_question_card
from .negotiation import validate_condition_sheet
from ..memory.fact_graph import FactRecord
from ..memory.commitment_ledger import CommitmentRecord
from ..agents.professional import (make_challenge_responders, make_professional_agents,
                                   run_assessments, run_challenge_responses)
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
        self.responder_agents = make_challenge_responders(llm_fn)
        self.company_agents: Dict[str, CompanyAgent] = {}
        self.state: Optional[WorldState] = None
        self._pending_view: Optional[dict] = None
        self._verifications: Dict[str, dict] = {}
        self._pending_sheets: List[dict] = []
        self._last_deltas: List[dict] = []

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
                    fact_id="FACT-%s-%02d" % (cid.upper(), i + 1),
                    subject=cid, predicate="visible_fact", value=fact,
                    effective_at=avail, available_at=avail, visibility="public",
                    source_ids=["CASE-%s" % ent.get("prototype_id", "?").upper()]))

    # ---------- ①②：开局视图（Context + 四部门研判 + 部门通信 + 问题卡） ----------

    def open_stage(self) -> dict:
        st = self._state()
        stage = self.stages[st.stage_id]
        ctx = build_context(st, self.inbox, stage["events"])
        assessments = run_assessments(self.pro_agents, ctx)
        communication = self._communicate(assessments, ctx)
        cards = build_question_cards(assessments, self.enterprises, st.stage_id)
        for c in cards:
            validate_question_card(c)
        graph = project(st, self.inbox, stage["events"])
        self._pending_view = {"context": ctx, "assessments": assessments,
                              "communication": communication,
                              "question_cards": cards}
        return {"stage": {"stage_id": st.stage_id, "label": stage["label"],
                          "window": stage["window"], "core_tension": stage["core_tension"]},
                "context": ctx, "department_memoranda": assessments,
                "department_communication": communication,
                "meeting_minutes": communication["minutes"],
                "question_cards": cards,
                "graph_view": graph}

    # ---------- ④⑤⑥：提交决策 → 企业响应 → 结算 ----------

    def submit_decisions(self, decisions: List[dict]) -> dict:
        st = self._state()
        stage = self.stages[st.stage_id]
        view = self._pending_view or self._stage_view(st)
        if "communication" not in view:
            view["communication"] = self._communicate(view["assessments"], view["context"])
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
            "department_communication": view["communication"],
            "meeting_minutes": view["communication"]["minutes"],
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

    # ---------- P1：部门通信（冲突 → 质询 → 立场修订 → 纪要） ----------

    def _communicate(self, assessments: List[dict], ctx: dict) -> dict:
        """P1：冲突识别 → 一轮定向质询 → 立场修订 → 会议纪要（全部只读记录）。"""
        st = self._state()
        conflicts = detect_conflicts(assessments, st.stage_id)
        challenges = build_challenges(conflicts, st.stage_id)
        responses = run_challenge_responses(self.responder_agents, challenges,
                                            assessments, ctx)
        revisions = []
        for ch, resp in zip(challenges, responses):
            rev = position_revision(
                ch, find_memorandum(assessments, ch["to"], ch["company_id"]) or {},
                find_memorandum(assessments, ch["from"], ch["company_id"]) or {},
                resp)
            if rev is not None:
                revisions.append(rev)
        minutes = make_minutes(assessments, challenges, responses, revisions, st.stage_id)
        return {"conflicts": conflicts, "challenges": challenges,
                "responses": responses, "position_revisions": revisions,
                "minutes": minutes}

    # ---------- P1.5：紧凑政企协商 ----------

    def request_verification(self, card_id: str) -> dict:
        """玩家选择一张问题卡 → 企业实时回应（一次 LLM 调用；断网走 fallback）。"""
        st = self._state()
        view = self._pending_view or self._stage_view(st)
        card = next((c for c in view["question_cards"] if c["card_id"] == card_id), None)
        if card is None:
            raise ValueError("unknown question card: %s" % card_id)
        agent = self.company_agents[card["company_id"]]
        company_view = next(c for c in view["context"]["companies"]
                            if c["company_id"] == card["company_id"])
        question = {"question_id": card["card_id"], "question": card["question"],
                    "targets": card.get("targets", [])}
        resp = agent.respond_to_verification(question, company_view, view["context"])
        self._verifications[st.stage_id] = resp
        return {"card": card, "verification_response": resp}

    def submit_conditions(self, sheets: List[dict]) -> dict:
        """玩家提交政府条件单 → 每家企业一次性反提案（一次 LLM 调用/家）。"""
        st = self._state()
        view = self._pending_view or self._stage_view(st)
        for s in sheets:
            validate_condition_sheet(s)
        proposals: Dict[str, Optional[dict]] = {}
        for sheet in sheets:
            cid = sheet["company_id"]
            agent = self.company_agents[cid]
            company_view = next(c for c in view["context"]["companies"]
                                if c["company_id"] == cid)
            conditions = {"capital_points": sheet["capital_points"],
                          "milestone_due": sheet.get("milestone_due", ""),
                          "risk_conditions": sheet.get("risk_conditions", [])}
            proposals[cid] = agent.make_counter_proposal(
                conditions, company_view, view["context"], st.stage_id)
        self._pending_sheets = sheets
        return {"counter_proposals": proposals}

    def finalize_negotiation(self, confirmations: Dict[str, dict]) -> dict:
        """玩家确认/修改/放弃反提案 → 写承诺账 → 转引擎结算。

        门禁：只有 confirmations 中 action=accept/modify 的条件单生成 decisions；
        reject 或未提及的企业不产生任何数值效果。
        """
        st = self._state()
        sheets_by_cid = {s["company_id"]: s for s in self._pending_sheets or []}
        final_sheets: List[dict] = []
        for cid, conf in confirmations.items():
            action = conf.get("action")
            if action == "accept":
                final_sheets.append(sheets_by_cid.get(cid))
            elif action == "modify":
                ms = conf.get("modified_sheet")
                validate_condition_sheet(ms)
                final_sheets.append(ms)
        final_sheets = [s for s in final_sheets if s is not None]
        decisions = [{"company_id": s["company_id"], "action": "invest",
                      "capital_points": s["capital_points"],
                      "support_focus": s["support_focus"]}
                     for s in final_sheets]
        self._write_commitments(final_sheets, st.stage_id)
        result = self.submit_decisions(decisions)
        # 采纳门禁：state_deltas 只暴露已确认企业（含无企业级的城市增量），
        # 未确认企业的演化仍体现在 companies 状态中
        confirmed = {s["company_id"] for s in final_sheets}
        result["state_deltas"] = [d for d in result["state_deltas"]
                                  if d.get("company_id") is None
                                  or d["company_id"] in confirmed]
        self._last_deltas = result.get("state_deltas", [])
        result["negotiation"] = self._negotiation_trace(final_sheets, confirmations)
        return result

    # ---------- P2：联席方案接入玩家决策 ----------

    def apply_plan(self, plan_id: str, capital_map: Dict[str, float]) -> List[dict]:
        """玩家选择联席方案 → 生成条件单草稿（不落状态，交给 submit_conditions）。"""
        st = self._state()
        view = self._pending_view or self._stage_view(st)
        from .negotiation import build_sheets_from_plan
        sheets = build_sheets_from_plan(view["communication"]["minutes"],
                                        plan_id, capital_map)
        for s in sheets:
            validate_condition_sheet(s)
        return sheets

    # ---------- 私有助手 ----------

    def _stage_view(self, st) -> dict:
        stage = self.stages[st.stage_id]
        ctx = build_context(st, self.inbox, stage["events"])
        assessments = run_assessments(self.pro_agents, ctx)
        communication = self._communicate(assessments, ctx)
        cards = build_question_cards(assessments, self.enterprises, st.stage_id)
        return {"context": ctx, "assessments": assessments,
                "communication": communication, "question_cards": cards}

    def _write_commitments(self, sheets: List[dict], stage_id: str) -> None:
        """政企双方承诺写入（政方 → WorldState 账，企方 → 企业 Memory 账）。"""
        st = self._state()
        idx = _STAGE_ORDER.index(stage_id)
        due = _STAGE_ORDER[idx + 1] if idx + 1 < len(_STAGE_ORDER) else stage_id
        for s in sheets:
            cid = s["company_id"]
            sheet_id = s["sheet_id"]
            cond = s.get("milestone_due") or (
                s["risk_conditions"][0] if s["risk_conditions"] else "agreement")
            st.government_commitments.add(CommitmentRecord(
                commitment_id="GOV-%s" % sheet_id, party="government",
                promise="provide_capital", due_stage=due, condition=cond,
                source_ids=[sheet_id]))
            agent = self.company_agents[cid]
            agent.memory.commitments.add(CommitmentRecord(
                commitment_id="CO-%s" % sheet_id, party=cid,
                promise="meet_conditions", due_stage=due, condition=cond,
                source_ids=[sheet_id]))
            agent.memory.beliefs.update(
                "government_fulfillment", signal=0.85, signal_weight=0.4,
                stage_id=stage_id, evidence_ids=[sheet_id])

    def _negotiation_trace(self, final_sheets: List[dict],
                           confirmations: Dict[str, dict]) -> dict:
        """结算页协商轨迹：条件 → 引擎 deltas 证据链（文档 4.8 / P2）。"""
        st = self._state()
        by_cid = {s["company_id"]: s for s in final_sheets}
        verification = self._verifications.get(st.stage_id)
        trace: Dict[str, dict] = {}
        for cid, conf in confirmations.items():
            sheet = by_cid.get(cid)
            if sheet is None:
                trace[cid] = {"final_action": "reject", "sheet": None,
                              "verification": None, "commitments": [],
                              "condition_impact": []}
                continue
            deltas = [d for d in self._last_deltas if d.get("company_id") == cid]
            metrics = sorted({d["metric_id"] for d in deltas})
            codes = sorted({d["reason_code"] for d in deltas})
            impacts = []
            for cond in sheet.get("risk_conditions", []):
                impacts.append({
                    "condition": cond,
                    "affected_metrics": metrics,
                    "reason_codes": codes[:5],
                    "delta_count": len(deltas),
                    "evidence_ids": sorted({eid for d in deltas
                                            for eid in d.get("input_metric_ids", [])}),
                })
            trace[cid] = {"final_action": conf.get("action", "accept"), "sheet": sheet,
                          "verification": verification if verification
                          and verification.get("company_id") == cid else None,
                          "commitments": [c.to_dict() for c in
                                          st.government_commitments.records
                                          if sheet["sheet_id"] in c.source_ids],
                          "condition_impact": impacts}
        return trace

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
