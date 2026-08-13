"""冒烟测试：对应验收标准的底线。

  python3 -m unittest policytown.investment.tests.test_smoke -v
"""
from __future__ import annotations

import json
import unittest

from ..core.orchestrator import Orchestrator
from ..replay.replay import replay_historical

PICK = ["proto_a", "proto_d", "proto_b"]
SCRIPT = {
    "S1": [{"company_id": "company_a", "action": "invest", "capital_points": 40,
            "support_focus": "infrastructure"}],
    "S2": [{"company_id": "company_a", "action": "follow_on", "capital_points": 25,
            "support_focus": "supply_chain"}],
    "S3": [{"company_id": "company_d", "action": "restructure", "capital_points": 10,
            "support_focus": "financing"}],
    "S4": [{"company_id": "company_b", "action": "invest", "capital_points": 30,
            "support_focus": "talent"}],
}


def run_full(seed: int = 42):
    orch = Orchestrator(seed=seed)
    orch.start(PICK, "S1")
    rounds = []
    for sid in ("S1", "S2", "S3", "S4"):
        orch.open_stage()
        rounds.append(orch.submit_decisions(SCRIPT[sid]))
        if sid != "S4":
            orch.advance_stage()
    return rounds, orch.finish()


class TestSmoke(unittest.TestCase):
    def test_budget_conservation(self):
        rounds, _ = run_full()
        for r in rounds:
            b = r["budget"]
            self.assertAlmostEqual(b["after"], b["before"] - b["spent"] + b["recovered"], places=6)
            self.assertGreaterEqual(b["spent"], 0)
            self.assertLessEqual(b["spent"], b["before"] + 1e-9, "支出不得超过当期预算")

    def test_determinism_same_seed(self):
        r1, f1 = run_full(seed=42)
        r2, f2 = run_full(seed=42)
        self.assertEqual(json.dumps(r1, sort_keys=True), json.dumps(r2, sort_keys=True))
        self.assertEqual(json.dumps(f1, sort_keys=True), json.dumps(f2, sort_keys=True))

    def test_unfunded_company_still_evolves(self):
        rounds, _ = run_full()
        s1 = rounds[0]
        d = next(c for c in s1["companies"] if c["company_id"] == "company_d")
        self.assertNotEqual(d["status"], "", "未投资企业也必须继续生长")

    def test_distress_message_generated(self):
        rounds, _ = run_full()
        types = [m["type"] for r in rounds for m in r["messages_new"]]
        self.assertIn("capital_request", types, "企业必须每轮发出下轮资金请求")

    def test_cutoff_isolation(self):
        orch = Orchestrator(seed=42)
        orch.start(PICK, "S1")
        view = orch.open_stage()
        for eid, ev in view["context"]["evidence_pack"].items():
            self.assertLessEqual(ev["publication_date"], view["context"]["cutoff_at"],
                                 "证据不得晚于截止日：%s" % eid)
        blob = json.dumps(view["context"], ensure_ascii=False)
        for token in ("京东方", "长鑫", "赛维", "熔安", "熔盛", "未名", "鑫昊"):
            self.assertNotIn(token, blob, "真实案例名泄漏：%s" % token)

    def test_historical_replay_runs(self):
        result = replay_historical(PICK, seed=42)
        scores = result["historical_replay"]
        for key in ("direction_score", "sequence_score", "mechanism_score",
                    "path_feedback_score"):
            self.assertGreaterEqual(scores[key], 0.0)
            self.assertLessEqual(scores[key], 1.0)
        self.assertTrue(scores["leakage_audit_passed"])


if __name__ == "__main__":
    unittest.main()
