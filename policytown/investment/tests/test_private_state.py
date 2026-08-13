"""企业私有状态测试（文档 5.2：政府不可见、受约束区间、assumption_class）。

铁律：
1. 私有状态只进入企业 Agent 自身 prompt，绝不进入公开 Context；
2. 区间必须有依据（basis）并记录 assumption_class=latent_scenario_variable；
3. 同 seed 同输入 → 同私有值（运行稳定性）。
"""
from __future__ import annotations

import json
import unittest

from ..core.orchestrator import Orchestrator
from ..core.private_state import make_private_state, ScenarioAssumption, LATENT_CLASS


class TestScenarioAssumption(unittest.TestCase):
    def test_deterministic_draw(self):
        a1 = ScenarioAssumption(key="cash_reserve", range_min=10, range_max=30, basis="依据A")
        a2 = ScenarioAssumption(key="cash_reserve", range_min=10, range_max=30, basis="依据A")
        self.assertEqual(a1.draw(42), a2.draw(42))
        self.assertTrue(10 <= a1.draw(42) <= 30)
        self.assertEqual(a1.to_dict()["assumption_class"], LATENT_CLASS)

    def test_invalid_range_rejected(self):
        with self.assertRaises(ValueError):
            ScenarioAssumption(key="x", range_min=30, range_max=10, basis="依据")


class TestPrivateState(unittest.TestCase):
    def test_make_private_state_uses_baseline_ranges(self):
        enterprise = {
            "private_baseline": {
                "cash_reserve": {"min": 15, "max": 25, "basis": "2007年末货币资金约17亿"},
                "financing_capacity": {"min": 60, "max": 80, "basis": "定增完成"},
            },
            "decision_baseline": {"expansion_appetite": 0.75, "risk_preference": 0.45},
        }
        company = _fake_company()
        ps = make_private_state(company, enterprise, seed=42)
        self.assertTrue(15 <= ps.cash_reserve <= 25)
        self.assertTrue(60 <= ps.financing_capacity <= 80)
        self.assertEqual(ps.expansion_appetite, 0.75)
        self.assertEqual(ps.risk_preference, 0.45)
        self.assertTrue(all(a.assumption_class == LATENT_CLASS for a in ps.assumptions))
        self.assertEqual(len(ps.assumptions), 2)

    def test_private_state_never_in_public_context(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        view = orch.open_stage()
        blob = json.dumps(view["context"], ensure_ascii=False)
        for token in ("cash_reserve", "financing_capacity", "parent_support",
                      "tech_team_depth", "ip_pathway_risk", "assumptions",
                      "latent_scenario_variable"):
            self.assertNotIn(token, blob, "私有字段泄漏进公开 Context：%s" % token)

    def test_private_state_stable_across_runs(self):
        def draw():
            orch = Orchestrator(seed=42)
            orch.start(["proto_a", "proto_d", "proto_b"], "S1")
            return {cid: a.private_state.to_dict()
                    for cid, a in orch.company_agents.items()}
        self.assertEqual(json.dumps(draw(), sort_keys=True),
                         json.dumps(draw(), sort_keys=True))


def _fake_company():
    from ..core.state import CompanyState
    return CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                        metrics={}, cash_points=0, debt_points=0)
