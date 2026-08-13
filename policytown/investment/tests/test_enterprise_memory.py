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
