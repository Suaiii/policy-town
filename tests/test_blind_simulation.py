import unittest

from contracts.investment_simulation_v0_1 import StageId, StageInput
from policytown.investment import InvestmentEngine
from policytown.investment.blind_simulation import run_blind_decision
from policytown.investment.deliberation import _recommend_action


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


if __name__ == "__main__":
    unittest.main()
