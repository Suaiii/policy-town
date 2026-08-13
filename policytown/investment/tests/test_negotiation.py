"""政企协商契约测试：核验回应 + 一次性反提案（文档 4.6 / 8.6）。

铁律：
1. 回应受企业私有状态与决策底色约束，五种状态可全部到达；
2. 反提案每阶段只出现一次；接受/拒绝受扩张惯性、风险偏好驱动；
3. 回应与反提案不修改任何数值（协商层只表达意图）。
"""
from __future__ import annotations

import unittest

from ..agents.company import CompanyAgent
from ..core.private_state import CompanyPrivateState
from ..core.state import CompanyState


def _comp() -> CompanyState:
    return CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                        metrics={}, cash_points=0, debt_points=0)


def _agent(private: dict, appetite: float = 0.5, risk: float = 0.5) -> CompanyAgent:
    agent = CompanyAgent("company_a", llm_fn=None)  # llm_fn=None → 确定性 fallback
    agent.private_state = CompanyPrivateState(
        company_id="company_a", cash_reserve=private.get("cash_reserve", 20),
        financing_capacity=private.get("financing_capacity", 50),
        parent_support=private.get("parent_support", 50),
        tech_team_depth=50, ip_pathway_risk=40,
        expansion_appetite=appetite, risk_preference=risk)
    return agent


def _view():
    return {"company_id": "company_a", "anon_label": "企业A", "industry": "display",
            "metrics": {}, "cash_band": "一般", "capital_request": 30,
            "evidence_ids": ["E1"]}


class TestVerificationResponse(unittest.TestCase):
    def test_all_five_states_reachable(self):
        cases = [
            ({"financing_capacity": 80, "parent_support": 80}, "full_disclosure"),
            ({"financing_capacity": 55, "parent_support": 55}, "range"),
        ]
        seen = set()
        for priv, expect in cases:
            resp = _agent(priv).respond_to_verification(
                {"question_id": "VQ-1", "question": "披露融资安排"}, _view(), {})
            self.assertEqual(resp["response_type"], expect)
            self.assertEqual(resp["question_id"], "VQ-1")
            seen.add(resp["response_type"])
        resp_low = _agent({"financing_capacity": 30, "parent_support": 30}, risk=0.4) \
            .respond_to_verification({"question_id": "VQ-2", "question": "披露融资安排"},
                                     _view(), {})
        self.assertEqual(resp_low["response_type"], "partial_disclosure")
        resp_cond = _agent({"financing_capacity": 30, "parent_support": 30}, risk=0.8) \
            .respond_to_verification({"question_id": "VQ-3", "question": "披露融资安排"},
                                     _view(), {})
        self.assertEqual(resp_cond["response_type"], "condition_offer")
        resp_ref = _agent({"financing_capacity": 15, "parent_support": 15}, risk=0.4) \
            .respond_to_verification({"question_id": "VQ-4", "question": "披露融资安排"},
                                     _view(), {})
        self.assertEqual(resp_ref["response_type"], "refusal")
        seen.update({resp_low["response_type"], resp_cond["response_type"],
                     resp_ref["response_type"]})
        self.assertEqual(seen, {"full_disclosure", "range", "partial_disclosure",
                                "condition_offer", "refusal"})

    def test_range_bounds_are_consistent(self):
        resp = _agent({"financing_capacity": 55, "parent_support": 55}) \
            .respond_to_verification({"question_id": "VQ-1", "question": "q"}, _view(), {})
        lo, hi = resp["ranges"]["financing_capacity"]
        self.assertLessEqual(lo, hi)

    def test_verification_schema_valid(self):
        from ..agents.company import validate_verification_response
        resp = _agent({"financing_capacity": 80, "parent_support": 80}) \
            .respond_to_verification({"question_id": "VQ-1", "question": "q"}, _view(), {})
        validate_verification_response(resp)  # 不抛异常即通过
        resp["response_type"] = "nonsense"
        with self.assertRaises(ValueError):
            validate_verification_response(resp)


class TestCounterProposal(unittest.TestCase):
    def test_high_appetite_requests_more(self):
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.8, risk=0.5)
        prop = agent.make_counter_proposal(
            {"capital_points": 40, "milestone_due": "S2", "risk_conditions": ["tranches"]},
            _view(), {}, "S1")
        self.assertIsNotNone(prop)
        req = {r["key"]: r for r in prop["requests"]}
        self.assertIn("capital_points", req)
        self.assertEqual(req["capital_points"]["requested"], 50.0)
        self.assertEqual(prop["accepts"][0]["item"], "risk_conditions")

    def test_high_risk_rejects_exit_clause(self):
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.4, risk=0.8)
        prop = agent.make_counter_proposal(
            {"capital_points": 40, "milestone_due": "S2",
             "risk_conditions": ["exit_clause"]},
            _view(), {}, "S1")
        self.assertIn("exit_clause", prop["rejects"])
        self.assertIn({"item": "tranches", "note": "接受分期拨付以替代退出条款"},
                      prop["accepts"])

    def test_low_appetite_accepts(self):
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.3, risk=0.3)
        prop = agent.make_counter_proposal(
            {"capital_points": 40, "milestone_due": "S2", "risk_conditions": ["exit_clause"]},
            _view(), {}, "S1")
        self.assertEqual(prop["requests"], [])
        self.assertEqual(prop["rejects"], [])

    def test_one_time_per_stage(self):
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.8, risk=0.5)
        first = agent.make_counter_proposal({"capital_points": 40, "risk_conditions": []},
                                            _view(), {}, "S1")
        second = agent.make_counter_proposal({"capital_points": 40, "risk_conditions": []},
                                             _view(), {}, "S1")
        self.assertIsNotNone(first)
        self.assertIsNone(second, "同一阶段反提案只能出现一次")
        third = agent.make_counter_proposal({"capital_points": 40, "risk_conditions": []},
                                            _view(), {}, "S2")
        self.assertIsNotNone(third, "下一阶段允许新的反提案")

    def test_proposal_schema_valid(self):
        from ..agents.company import validate_counter_proposal
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.8, risk=0.8)
        prop = agent.make_counter_proposal(
            {"capital_points": 40, "milestone_due": "S2", "risk_conditions": ["exit_clause"]},
            _view(), {}, "S1")
        validate_counter_proposal(prop)
        prop["rejects"] = ["nonsense"]
        with self.assertRaises(ValueError):
            validate_counter_proposal(prop)
