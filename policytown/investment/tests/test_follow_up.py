"""P2.5 投后随访与单线终局测试（文档 4.9 / 9.2）。

铁律：
1. 每阶段只随访一项最重要的到期承诺；
2. 履约状态确定性判定（阈值），写回现实图谱并更新判断账；
3. 终局输出故事性时间线与关键命题复盘（终局才揭示 withheld 结论）。
"""
from __future__ import annotations

import unittest

from ..core.follow_up import (STATUS_LABELS, build_timeline, resolve_follow_up,
                              select_follow_up)
from ..core.orchestrator import Orchestrator
from ..memory.commitment_ledger import CommitmentLedger, CommitmentRecord
from ..core.state import CompanyState


def _comp(ramp=0, construction=20):
    return CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                        metrics={"production_ramp": ramp,
                                 "construction_progress": construction},
                        cash_points=0, debt_points=0)


def _ledger():
    ledger = CommitmentLedger()
    ledger.add(CommitmentRecord(commitment_id="C-1", party="company_a",
                                promise="meet_conditions", due_stage="S2",
                                condition="second_tranche_release"))
    ledger.add(CommitmentRecord(commitment_id="C-2", party="company_a",
                                promise="meet_conditions", due_stage="S3",
                                condition="scale_up"))
    return ledger


class TestFollowUpCore(unittest.TestCase):
    def test_select_earliest_due(self):
        ledger = _ledger()
        rec = select_follow_up(ledger, "S2")
        self.assertEqual(rec.commitment_id, "C-1")
        self.assertEqual(select_follow_up(ledger, "S4"), None)
        self.assertEqual(ledger.due_in("S2")[0].status, "pending")

    def test_resolve_statuses(self):
        c = _ledger().records[0]
        self.assertEqual(resolve_follow_up(c, _comp(ramp=60))["status"], "fulfilled")
        self.assertEqual(resolve_follow_up(c, _comp(ramp=20, construction=70))["status"],
                         "delayed")
        self.assertEqual(resolve_follow_up(c, _comp(ramp=10, construction=30))["status"],
                         "breached")
        self.assertEqual(resolve_follow_up(c, _comp(ramp=10, construction=50))["status"],
                         "insufficient_evidence")
        self.assertEqual(len(STATUS_LABELS), 4)


class TestFollowUpWiring(unittest.TestCase):
    def _play_one_stage(self, orch):
        view = orch.open_stage()
        sheets = orch.apply_plan(view["meeting_minutes"]["proposals"][0]["proposal_id"],
                                 {"company_a": 20.0})
        sheets = [s for s in sheets if s["company_id"] == "company_a"]
        orch.submit_conditions(sheets)
        orch.finalize_negotiation({"company_a": {"action": "accept"}})

    def test_follow_up_runs_at_next_stage_open(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        self._play_one_stage(orch)
        self.assertEqual(orch._state().government_commitments.records[0].due_stage, "S2")
        orch.advance_stage()  # S2 open_stage → 随访 S1 承诺
        view = orch._pending_view
        fu = view["follow_up"]
        self.assertIsNotNone(fu)
        self.assertEqual(fu["stage_id"], "S2")
        self.assertIn(fu["status"], ("fulfilled", "delayed", "breached",
                                     "insufficient_evidence"))
        # 写回现实图谱
        facts = [f for f in view["context"]["fact_graph"]
                 if f["fact_id"].startswith("FU-")]
        self.assertTrue(facts)
        self.assertIn(fu["status"], facts[0]["predicate"])
        # 账目已 mark
        rec = orch.company_agents["company_a"].memory.commitments.records[0]
        self.assertNotEqual(rec.status, "pending")
        # 判断账更新
        belief = orch.company_agents["company_a"].memory.beliefs \
            .get("financing_continuity").value
        self.assertTrue(0.0 <= belief <= 1.0)

    def test_finish_has_timeline_and_review(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        for sid in ("S1", "S2", "S3"):
            self._play_one_stage(orch)
            if sid != "S3":
                orch.advance_stage()
        final = orch.finish()
        # 时间线：有叙事记录的阶段
        self.assertTrue(final["timeline"])
        for t in final["timeline"]:
            for k in ("worried", "negotiated", "committed", "followed_up", "result"):
                self.assertIn(k, t)
        # 关键命题复盘：三核心案例全部在场，终局才揭示
        review = {r["company_id"]: r for r in final["proposition_review"]}
        self.assertEqual(set(review), {"company_a", "company_d", "company_b"})
        for r in review.values():
            self.assertTrue(r["proposition"])
            self.assertIn(r["evidence_status_at_decision"],
                          ("verified", "partial", "unverified", "conflicting"))
            self.assertTrue(r["terminal_outcome"], "终局必须揭示 withheld 结论")
            self.assertIn("handling", r)
            self.assertIn("assumptions", r)


class TestTimelineBuilder(unittest.TestCase):
    def test_build_timeline(self):
        stages = {"S1": {"window": "2007-2008"}, "S2": {"window": "2009-2011"}}
        records = {"S1": {"worries": ["w"], "negotiation": "range",
                          "committed": [{"company_id": "company_a"}],
                          "result": {"spent": 20}}}
        tl = build_timeline(records, [{"stage_id": "S2", "status": "fulfilled"}], stages)
        self.assertEqual(len(tl), 1)
        self.assertEqual(tl[0]["window"], "2007-2008")
        self.assertEqual(tl[0]["committed"][0]["company_id"], "company_a")


if __name__ == "__main__":
    unittest.main()
