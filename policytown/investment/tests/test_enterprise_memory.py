"""一图两账 Memory 测试（文档 5.4）。

现实图谱是场景级共享只读结构：withheld 永不出现、private 只对企业可见、
available_at 晚于截止日的不进入 Context。
"""
from __future__ import annotations

import json
import unittest

from ..memory.fact_graph import FactGraph, FactRecord


class TestFactGraph(unittest.TestCase):
    def _graph(self) -> FactGraph:
        g = FactGraph()
        g.add(FactRecord(fact_id="F1", subject="company_a", predicate="capability",
                         value="verified", effective_at="2008-08-01",
                         available_at="2008-08-31", visibility="public",
                         source_ids=["S1"]))
        g.add(FactRecord(fact_id="F2", subject="company_a", predicate="financing",
                         value="fragile", effective_at="2010-06-01",
                         available_at="2010-06-30", visibility="public",
                         source_ids=["S2"]))
        g.add(FactRecord(fact_id="F3", subject="company_a", predicate="cash",
                         value="high", effective_at="2008-07-01",
                         available_at="2008-07-31", visibility="private",
                         source_ids=["PRIV"]))
        g.add(FactRecord(fact_id="F4", subject="company_a", predicate="outcome",
                         value="success", effective_at="2012-01-01",
                         available_at="2012-06-30", visibility="withheld",
                         source_ids=["TERM"]))
        return g

    def test_cutoff_filter(self):
        g = self._graph()
        visible = {r.fact_id for r in g.visible("2008-09-30", "public")}
        self.assertEqual(visible, {"F1"})

    def test_private_visible_to_enterprise_only(self):
        g = self._graph()
        pub = {r.fact_id for r in g.visible("2008-09-30", "public")}
        ent = {r.fact_id for r in g.visible("2008-09-30", "enterprise")}
        self.assertIn("F3", ent)
        self.assertNotIn("F3", pub)

    def test_withheld_never_visible(self):
        g = self._graph()
        for viewer in ("public", "enterprise"):
            ids = {r.fact_id for r in g.visible("2099-12-31", viewer)}
            self.assertNotIn("F4", ids)

    def test_round_trip(self):
        g = self._graph()
        data = g.to_dict("2099-12-31", "enterprise")
        self.assertEqual({d["fact_id"] for d in data}, {"F1", "F2", "F3"})
        for d in data:
            self.assertIn("fact_id", d)


class TestFactGraphInContext(unittest.TestCase):
    def test_s1_context_facts_cutoff_aware(self):
        from ..core.orchestrator import Orchestrator
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        view = orch.open_stage()
        facts = view["context"]["fact_graph"]
        self.assertTrue(facts, "S1 Context 必须包含现实图谱")
        subjects = {f["subject"] for f in facts}
        self.assertIn("company_a", subjects, "京东方可见事实应在 S1 出现")
        self.assertNotIn("company_d", subjects, "赛维可见事实晚于 S1 截止日（2010-06-30）")
        for f in facts:
            self.assertLessEqual(f["available_at"], view["context"]["cutoff_at"])

    def test_withheld_terminal_never_in_any_stage_context(self):
        from ..core.orchestrator import Orchestrator
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        blobs = []
        for stage_id in ("S1", "S2", "S3", "S4"):
            view = orch.open_stage()
            blobs.append(json.dumps(view["context"], ensure_ascii=False))
            if stage_id != "S4":
                orch.submit_decisions([])
                orch.advance_stage()
        import os
        data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "data", "hefei_mvp")
        with open(os.path.join(data_dir, "enterprise_agents.json"), encoding="utf-8") as f:
            for e in json.load(f)["enterprises"]:
                kp = e.get("key_proposition")
                if kp:
                    for blob in blobs:
                        self.assertNotIn(kp["terminal_verification"]["evidence"], blob)
                        self.assertNotIn(kp["terminal_verification"]["outcome"], blob)

    def test_fact_ids_are_anonymous(self):
        from ..core.orchestrator import Orchestrator
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S4")
        view = orch.open_stage()
        ids = [f["fact_id"] for f in view["context"]["fact_graph"]]
        self.assertTrue(ids)
        for fid in ids:
            self.assertRegex(fid, r"^FACT-(COMPANY_[A-Z])-\d{2}$", fid)


from ..memory.belief_ledger import BeliefLedger, make_default_beliefs


class TestBeliefLedger(unittest.TestCase):
    def test_defaults_from_risk_preference(self):
        beliefs = make_default_beliefs(risk_preference=0.5)
        self.assertEqual(set(beliefs), {"market_recovery", "financing_continuity",
                                        "tech_execution", "government_fulfillment"})
        self.assertTrue(all(0.0 <= v <= 1.0 for v in beliefs.values()))
        low = make_default_beliefs(risk_preference=0.0)
        high = make_default_beliefs(risk_preference=1.0)
        self.assertLess(low["market_recovery"], high["market_recovery"])
        self.assertEqual(low["financing_continuity"], 0.4)
        self.assertEqual(high["financing_continuity"], 0.6)

    def test_blend_rule(self):
        ledger = BeliefLedger()
        ledger.init_defaults({"financing_continuity": 0.5})
        e = ledger.update("financing_continuity", signal=0.9, signal_weight=0.8,
                          stage_id="S2", evidence_ids=["E1"])
        # w = min(0.5, 0.8) = 0.5 → 0.5*0.5 + 0.9*0.5 = 0.7; confidence = 0.5 + 0.5*0.2 = 0.6
        self.assertAlmostEqual(e.value, 0.7, places=6)
        self.assertAlmostEqual(e.confidence, 0.6, places=6)
        self.assertEqual(e.update_rule, "bounded_evidence_blend_v1")
        self.assertEqual(e.updated_at, "S2")
        self.assertIn("E1", e.evidence_ids)

    def test_clamp_and_confidence(self):
        ledger = BeliefLedger()
        ledger.init_defaults({"market_recovery": 0.9})
        e = ledger.update("market_recovery", signal=0.0, signal_weight=0.5, stage_id="S3",
                          evidence_ids=["E2"])
        # w = min(0.5, max(0.05, 0.5)) = 0.5 → value = 0.9*0.5 + 0.0*0.5 = 0.45;
        # confidence = 0.5 + 0.5*0.2 = 0.6
        self.assertAlmostEqual(e.value, 0.45, places=6)
        self.assertAlmostEqual(e.confidence, 0.6, places=6)

    def test_evidence_dedup_and_append(self):
        ledger = BeliefLedger()
        ledger.init_defaults({"tech_execution": 0.5})
        ledger.update("tech_execution", signal=0.6, signal_weight=0.3, stage_id="S1",
                      evidence_ids=["E1"])
        e = ledger.update("tech_execution", signal=0.6, signal_weight=0.3, stage_id="S2",
                          evidence_ids=["E1", "E2"])
        self.assertEqual(e.evidence_ids, ["E1", "E2"])

    def test_round_trip(self):
        ledger = BeliefLedger()
        ledger.init_defaults(make_default_beliefs(0.5))
        ledger.update("financing_continuity", signal=0.7, signal_weight=0.5, stage_id="S2",
                      evidence_ids=["E1"])
        data = ledger.to_dict()
        self.assertEqual(len(data), 4)
        self.assertEqual([d["update_rule"] for d in data], ["bounded_evidence_blend_v1"] * 4)


from ..memory.commitment_ledger import CommitmentLedger, CommitmentRecord, STATUSES


class TestCommitmentLedger(unittest.TestCase):
    def test_lifecycle(self):
        ledger = CommitmentLedger()
        rec = CommitmentRecord(commitment_id="C-S1-001", party="company_a",
                               promise="complete_pilot_line", due_stage="S2",
                               condition="second_tranche_release")
        ledger.add(rec)
        self.assertEqual([r.commitment_id for r in ledger.due_in("S2")], ["C-S1-001"])
        self.assertEqual(ledger.due_in("S3"), [])
        ledger.mark("C-S1-001", "fulfilled")
        self.assertEqual(ledger.due_in("S2"), [], "已履约承诺不再到期")
        self.assertEqual(rec.status, "fulfilled")

    def test_mark_invalid_status_rejected(self):
        ledger = CommitmentLedger()
        ledger.add(CommitmentRecord(commitment_id="C-1", party="government",
                                    promise="provide_capital", due_stage="S2",
                                    condition="agreement"))
        with self.assertRaises(ValueError):
            ledger.mark("C-1", "nonsense")
        with self.assertRaises(KeyError):
            ledger.mark("C-9", "pending")

    def test_statuses_enum(self):
        self.assertEqual(set(STATUSES),
                         {"pending", "fulfilled", "delayed", "breached",
                          "insufficient_evidence"})

    def test_machine_readable(self):
        ledger = CommitmentLedger()
        ledger.add(CommitmentRecord(commitment_id="C-1", party="government",
                                    promise="provide_capital", due_stage="S2",
                                    condition="agreement", source_ids=["agreement:S1-001"]))
        data = ledger.to_dict()
        self.assertEqual(data[0]["condition"], "agreement")
        self.assertEqual(data[0]["status"], "pending")
        self.assertIn("source_ids", data[0])


from ..agents.company import CompanyAgent


class _CapturingLlm:
    def __init__(self) -> None:
        self.prompts: list = []

    def __call__(self, prompt: str, validator=None) -> dict:
        self.prompts.append(prompt)
        return {"company_id": "company_a", "action": "wait",
                "capital_request_next_round": 0.0,
                "resource_allocation": {"construction": 0.2, "research": 0.2,
                                        "market": 0.2, "cash_buffer": 0.4},
                "milestone_target": "construction_done", "risk_response": "observe",
                "competition_response": "wait", "evidence_ids": [], "confidence": 0.5}


def _view(company_id="company_a"):
    return {"company_id": company_id, "anon_label": "企业A", "industry": "display",
            "status": "建设",
            "metrics": {"financial_health": 50, "execution_ability": 50,
                        "technology_readiness": 50, "customer_order_strength": 50,
                        "construction_progress": 20, "production_ramp": 0,
                        "project_cashflow": -10, "capital_intensity": 40},
            "cash_band": "一般", "capital_request": 30,
            "milestones_done": [], "evidence_ids": []}


def _mini_ctx():
    return {"cutoff_at": "2008-09-30", "market": {}, "city": {}, "companies": [],
            "evidence_pack": {}, "fact_graph": []}


class TestAgentMemorySeparation(unittest.TestCase):
    def test_plan_prompt_has_baseline_private_memory(self):
        import json
        enterprise = {
            "prototype_id": "proto_a", "enter_stage": "S1",
            "decision_cutoff": "2008-08-31", "industry": "display",
            "system_prompt": "你是京东方系企业决策代表。",
            "stage_contexts": {},
            "decision_baseline": {"management_objectives": ["扩代"], "expansion_appetite": 0.75,
                                  "risk_preference": 0.45,
                                  "financing_constraints": {"bank_credit": "strong"},
                                  "negotiation_stance": "cooperative"},
            "private_baseline": {"cash_reserve": {"min": 15, "max": 25, "basis": "年报口径"}},
        }
        from ..core.private_state import make_private_state
        from ..core.state import CompanyState
        comp = CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                            metrics={}, cash_points=0, debt_points=0)
        llm = _CapturingLlm()
        agent = CompanyAgent("company_a", enterprise=enterprise, llm_fn=llm)
        agent.private_state = make_private_state(comp, enterprise, seed=42)
        agent.plan(_view(), _mini_ctx(), 0.0, "S1")
        blob = llm.prompts[-1]
        for token in ('"decision_baseline"', '"private_state"', '"memory"',
                      '"cash_reserve"', '"beliefs"', '"commitments"'):
            self.assertIn(token, blob, "plan prompt 缺 %s" % token)

    def test_identity_static_memory_dynamic(self):
        """决策底色固定；判断账/承诺账是动态记忆，互不混淆。"""
        enterprise = {
            "prototype_id": "proto_a", "enter_stage": "S1",
            "decision_cutoff": "2008-08-31", "industry": "display",
            "system_prompt": "你是京东方系企业决策代表。", "stage_contexts": {},
            "decision_baseline": {"management_objectives": ["扩代"], "expansion_appetite": 0.75,
                                  "risk_preference": 0.45,
                                  "financing_constraints": {"bank_credit": "strong"},
                                  "negotiation_stance": "cooperative"},
        }
        from ..core.private_state import make_private_state
        from ..core.state import CompanyState
        comp = CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                            metrics={}, cash_points=0, debt_points=0)
        agent = CompanyAgent("company_a", enterprise=enterprise, llm_fn=None)
        agent.private_state = make_private_state(comp, enterprise, seed=42)
        before = agent.memory.to_dict()
        agent.memory.beliefs.update("financing_continuity", signal=0.2,
                                    signal_weight=0.8, stage_id="S1", evidence_ids=["E1"])
        after = agent.memory.to_dict()
        self.assertNotEqual(before, after, "判断账必须随证据变化")
        self.assertEqual(agent.enterprise["decision_baseline"]["expansion_appetite"], 0.75,
                         "决策底色固定不变")

    def test_public_context_has_no_memory_fields(self):
        import json
        from ..core.orchestrator import Orchestrator
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        view = orch.open_stage()
        blob = json.dumps(view["context"], ensure_ascii=False)
        for token in ("beliefs", "commitments", "management_objectives",
                      "expansion_appetite", "risk_preference"):
            self.assertNotIn(token, blob, "Memory/底色泄漏进公开 Context：%s" % token)
