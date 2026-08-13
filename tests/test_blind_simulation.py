import unittest

from contracts.investment_simulation_v0_1 import StageId, StageInput
from policytown.investment import InvestmentEngine
from policytown.investment.blind_simulation import run_blind_decision
from policytown.investment.deliberation import _apply_enterprise_signal, _recommend_action


class RecommendActionTest(unittest.TestCase):
    def test_majority_support_recommends_support(self):
        from policytown.investment.deliberation import _memo  # noqa: F401
        class _M:
            def __init__(self, recommendation):
                self.recommendation = recommendation
        memos = [_M("support"), _M("support"), _M("conditional_support"), _M("defer")]
        action, _ = _recommend_action(memos)
        self.assertEqual("support", action)

    def test_split_recommends_staged(self):
        class _M:
            def __init__(self, recommendation):
                self.recommendation = recommendation
        memos = [_M("support"), _M("conditional_support"), _M("defer"), _M("defer")]
        action, _ = _recommend_action(memos)
        self.assertEqual("staged", action)

    def test_majority_oppose_recommends_reject(self):
        class _M:
            def __init__(self, recommendation):
                self.recommendation = recommendation
        memos = [_M("oppose"), _M("oppose"), _M("defer"), _M("conditional_support")]
        action, _ = _recommend_action(memos)
        self.assertEqual("reject", action)

    def test_enterprise_condition_downgrades_unconditional_support(self):
        class _Intent:
            action = "exchange_condition"
        action, rationale = _apply_enterprise_signal("support", "部门支持。", _Intent())
        self.assertEqual("staged", action)
        self.assertIn("企业", rationale)


class BlindSimulationTest(unittest.TestCase):
    def setUp(self):
        self.engine = InvestmentEngine()
        self.state = self.engine.new_run("blind", ["company_a", "company_d"], seed=42)

    def test_run_blind_decision_end_to_end(self):
        result = run_blind_decision(
            self.engine, self.state, stage_id=StageId.S1, seed=42, company_id="company_a",
        )
        self.assertEqual("CASE-02", result.case_id)
        self.assertEqual("invest", result.baseline_action)
        self.assertIsNotNone(result.action_matches_baseline)
        self.assertIn(result.recommended_action, {"support", "staged", "defer", "reject"})
        self.assertEqual(4, len(result.department_recommendations))
        self.assertTrue(result.recommendation_rationale)
        self.assertGreaterEqual(result.challenge_count, 1)
        self.assertIsNotNone(result.enterprise_action)
        self.assertEqual("invest", result.settled_action)
        self.assertGreater(result.settled_capital_points, 0)
        self.assertTrue(result.settlement_reconciled)

    def test_departments_receive_distinct_evidence_views(self):
        preview = self.engine.run_stage(
            self.state,
            StageInput(run_id="blind", stage_id=StageId.S1, seed=42),
        )
        deliberation = next(
            item for item in preview.deliberations if item.company_id == "company_a"
        )
        views = {
            brief.department: tuple(brief.visible_evidence_ids)
            for brief in deliberation.department_inputs
        }
        self.assertGreater(len(set(views.values())), 1)
        for memo in deliberation.department_memos:
            self.assertTrue(
                set(memo.supporting_evidence_ids) <= set(views[memo.department])
            )

    def test_department_memories_persist_across_stages(self):
        result = self.engine.run_stage(
            self.state,
            StageInput(run_id="blind", stage_id=StageId.S1, seed=42),
        )
        memories = result.next_state.department_memories
        self.assertTrue(memories)
        company_a_memories = [m for m in memories if m.company_id == "company_a"]
        self.assertEqual(4, len(company_a_memories))
        departments = {m.department for m in company_a_memories}
        self.assertEqual(
            {"finance", "industry_information", "science_technology", "development_reform"},
            departments,
        )
        for memory in company_a_memories:
            self.assertTrue(memory.stance_history)
            self.assertEqual("stance_tracking_v1", memory.update_rule)

    def test_department_memory_changes_next_stage_judgment(self):
        s1 = self.engine.run_stage(
            self.state,
            StageInput(run_id="blind", stage_id=StageId.S1, seed=42),
        )
        supportive = s1.next_state.model_copy(deep=True)
        opposed = s1.next_state.model_copy(deep=True)
        for state, stance in ((supportive, "support"), (opposed, "oppose")):
            for memory in state.department_memories:
                if memory.company_id == "company_a":
                    memory.stance_history = [stance]
                    memory.confidence = 1.0
                    memory.key_concerns = [f"测试持续关切-{stance}"]

        supportive_result = self.engine.run_stage(
            supportive,
            StageInput(run_id="blind", stage_id=StageId.S2, seed=42),
        )
        opposed_result = self.engine.run_stage(
            opposed,
            StageInput(run_id="blind", stage_id=StageId.S2, seed=42),
        )
        supportive_memos = {
            memo.department: memo
            for memo in next(
                item for item in supportive_result.deliberations
                if item.company_id == "company_a"
            ).department_memos
        }
        opposed_memos = {
            memo.department: memo
            for memo in next(
                item for item in opposed_result.deliberations
                if item.company_id == "company_a"
            ).department_memos
        }
        self.assertTrue(any(
            supportive_memos[department].recommendation
            != opposed_memos[department].recommendation
            for department in supportive_memos
        ))
        self.assertIn("测试持续关切-oppose", opposed_memos["finance"].most_important_risk)


if __name__ == "__main__":
    unittest.main()
