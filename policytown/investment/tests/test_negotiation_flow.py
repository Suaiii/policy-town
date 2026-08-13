"""P1.5+P2 政企协商测试（问题卡 → 核验 → 条件单 → 反提案 → 承诺账 → 玩家门禁）。

铁律：
1. 问题卡纯确定性；每企业每轮最多 2 张；
2. 采纳门禁：只有 confirmations 中 accept/modify 的条件单进入引擎，全拒预算不动；
3. 承诺写入机器可读（政方 WorldState 账 + 企方 Memory 账），判断账随协商更新；
4. 结算协商轨迹给出 条件 → 引擎 reason_code 的证据链。
"""
from __future__ import annotations

import json
import unittest

from ..core.negotiation import (build_sheets_from_plan, classify_conditions,
                                update_beliefs_from_verification,
                                validate_condition_sheet)
from ..core.orchestrator import Orchestrator


def _start(company_ids=("proto_a", "proto_d")):
    orch = Orchestrator(seed=42)
    orch.start(list(company_ids), "S1")
    view = orch.open_stage()
    return orch, view


def _sheet(cid, sheet_id="CS-S1-001", points=40, risk=("tranches",),
           focus="infrastructure", milestone=""):
    return {"sheet_id": sheet_id, "company_id": cid, "capital_points": points,
            "support_focus": focus, "milestone_due": milestone,
            "risk_conditions": list(risk)}


class TestQuestionCards(unittest.TestCase):
    def test_cards_present_and_scoped(self):
        orch, view = _start()
        cards = view["question_cards"]
        self.assertTrue(cards)
        self.assertIn("company_a", {c["company_id"] for c in cards},
                      "核心案例关键命题卡必须在场")
        for c in cards:
            self.assertTrue(c["card_id"].startswith("CARD-S1-"))
            self.assertIn(c["source"], ("key_proposition", "department_gap"))

    def test_deterministic(self):
        _, v1 = _start()
        _, v2 = _start()
        self.assertEqual(json.dumps(v1["question_cards"], sort_keys=True),
                         json.dumps(v2["question_cards"], sort_keys=True))


class TestClassifierAndSheet(unittest.TestCase):
    def test_classify(self):
        self.assertEqual(classify_conditions(["分期拨付，首期不超过50%", "按里程碑绑定放款"]),
                         ["tranches", "milestones"])
        self.assertEqual(classify_conditions([]), [])

    def test_sheet_validation(self):
        s = _sheet("company_a")
        validate_condition_sheet(s)
        s2 = dict(s, support_focus="magic")
        with self.assertRaises(ValueError):
            validate_condition_sheet(s2)


class TestNegotiationRound(unittest.TestCase):
    def test_verify_conditions_finalize_chain(self):
        orch, view = _start()
        card = next(c for c in view["question_cards"] if c["company_id"] == "company_a")
        out = orch.request_verification(card["card_id"])
        self.assertEqual(out["verification_response"]["company_id"], "company_a")
        resp = out["verification_response"]
        self.assertIn(resp["response_type"],
                      ("full_disclosure", "partial_disclosure", "range",
                       "refusal", "condition_offer"))

        res = orch.submit_conditions([_sheet("company_a", points=40)])
        prop = res["counter_proposals"]["company_a"]
        self.assertIsNotNone(prop)
        self.assertTrue(prop["proposal_id"].startswith("CP-"))

        result = orch.finalize_negotiation({"company_a": {"action": "accept"}})
        self.assertEqual(result["stage_id"], "S1")
        self.assertGreaterEqual(result["budget"]["spent"], 0)
        tr = result["negotiation"]["company_a"]
        self.assertEqual(tr["final_action"], "accept")
        self.assertEqual(tr["verification"]["response_type"], resp["response_type"])
        self.assertTrue(tr["commitments"], "确认后必须写政方承诺")
        self.assertEqual(tr["commitments"][0]["party"], "government")

    def test_unknown_card_rejected(self):
        orch, _ = _start()
        with self.assertRaises(ValueError):
            orch.request_verification("CARD-S1-99")


class TestCommitmentAndBeliefs(unittest.TestCase):
    def test_commitments_both_sides_and_context(self):
        orch, _ = _start()
        orch.submit_conditions([_sheet("company_a", sheet_id="CS-S1-007")])
        orch.finalize_negotiation({"company_a": {"action": "accept"}})
        st = orch._state()
        gov = [r for r in st.government_commitments.records if "CS-S1-007" in r.source_ids]
        self.assertEqual(len(gov), 1)
        self.assertEqual(gov[0].party, "government")
        self.assertEqual(orch.company_agents["company_a"]
                         .memory.commitments.to_dict()[0]["promise"], "meet_conditions")
        view2 = orch.open_stage()
        blob = json.dumps(view2["context"].get("government_commitments", []),
                          ensure_ascii=False)
        self.assertIn("CS-S1-007", blob)

    def test_belief_updates(self):
        orch, _ = _start()
        before = orch.company_agents["company_a"].memory.beliefs \
            .get("government_fulfillment").value
        orch.submit_conditions([_sheet("company_a", sheet_id="CS-S1-008")])
        orch.finalize_negotiation({"company_a": {"action": "accept"}})
        after = orch.company_agents["company_a"].memory.beliefs \
            .get("government_fulfillment").value
        self.assertGreater(after, before, "政府履约信念必须随承诺上调")

        # 核验回应 → 融资连续性判断更新
        orch2, view2 = _start()
        card = next(c for c in view2["question_cards"] if c["company_id"] == "company_a")
        orch2.request_verification(card["card_id"])
        agent = orch2.company_agents["company_a"]
        b = agent.memory.beliefs.get("financing_continuity").value
        update_beliefs_from_verification(agent, orch2._verifications["S1"], "S1")
        a = agent.memory.beliefs.get("financing_continuity").value
        rt = orch2._verifications["S1"]["response_type"]
        self.assertGreater(a, b) if rt != "refusal" else self.assertLess(a, b)


class TestPlanSelectionAndGate(unittest.TestCase):
    def test_apply_plan_into_negotiation(self):
        orch, view = _start()
        plan_id = view["meeting_minutes"]["proposals"][0]["proposal_id"]
        sheets = orch.apply_plan(plan_id, {"company_a": 30.0})
        self.assertTrue(sheets)
        for s in sheets:
            validate_condition_sheet(s)
        self.assertEqual(orch._state().city.committed_capital, 0.0, "apply_plan 不落状态")
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation(
            {s["company_id"]: {"action": "accept"} for s in sheets})
        for cid, tr in result["negotiation"].items():
            self.assertEqual(tr["final_action"], "accept")
            self.assertEqual(tr["sheet"]["company_id"], cid)

    def test_reject_all_no_effect(self):
        orch, _ = _start()
        orch.submit_conditions([_sheet("company_a", points=40)])
        before = orch._state().city.budget_points
        result = orch.finalize_negotiation({"company_a": {"action": "reject"}})
        self.assertEqual(orch._state().city.budget_points, before, "全拒必须预算不变")
        self.assertEqual(result["budget"]["spent"], 0.0)
        self.assertEqual(orch._state().government_commitments.records, [])

    def test_modify_uses_modified_sheet(self):
        orch, _ = _start()
        orch.submit_conditions([_sheet("company_a", sheet_id="CS-G-02", points=40)])
        modified = _sheet("company_a", sheet_id="CS-G-02M", points=25,
                          risk=("milestones",), focus="supply_chain")
        result = orch.finalize_negotiation(
            {"company_a": {"action": "modify", "modified_sheet": modified}})
        tr = result["negotiation"]["company_a"]
        self.assertEqual(tr["sheet"]["capital_points"], 25.0)
        self.assertEqual(result["budget"]["spent"], 25.0)

    def test_unnamed_company_not_settled(self):
        orch, _ = _start()
        orch.submit_conditions([_sheet("company_a", sheet_id="CS-G-03", points=40),
                                _sheet("company_d", sheet_id="CS-G-04", points=30,
                                       risk=(), focus="talent")])
        result = orch.finalize_negotiation({"company_a": {"action": "accept"}})
        gov_cids = {d["company_id"] for d in result["state_deltas"]
                    if d["reason_code"].startswith("GOV")}
        self.assertNotIn("company_d", gov_cids, "未确认企业不得获得政府资金")
        self.assertEqual(result["budget"]["spent"], 40.0)


class TestConditionImpactChain(unittest.TestCase):
    def test_impact_traceable_to_deltas(self):
        orch, _ = _start()
        orch.submit_conditions([_sheet("company_a", sheet_id="CS-H-01", points=40)])
        result = orch.finalize_negotiation({"company_a": {"action": "accept"}})
        tr = result["negotiation"]["company_a"]
        deltas = [d for d in result["state_deltas"] if d.get("company_id") == "company_a"]
        self.assertTrue(deltas)
        for imp in tr["condition_impact"]:
            self.assertTrue(imp["affected_metrics"])
        codes = {c for imp in tr["condition_impact"] for c in imp["reason_codes"]}
        self.assertTrue(codes & {d["reason_code"] for d in deltas},
                        "条件影响必须能追溯到引擎 reason_code")
        json.dumps(result["negotiation"], ensure_ascii=False)  # 可序列化


if __name__ == "__main__":
    unittest.main()
