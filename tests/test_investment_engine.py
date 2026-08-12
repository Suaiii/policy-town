import itertools
import unittest

from contracts.investment_simulation_v0_1 import PlayerAction, StageId, StageInput
from policytown.investment import HefeiMvpLoader, InvestmentEngine


class InvestmentEngineTest(unittest.TestCase):
    def setUp(self):
        self.loader = HefeiMvpLoader()
        self.engine = InvestmentEngine(self.loader)

    def _input(self, run_id, stage, actions=None):
        return StageInput(run_id=run_id, stage_id=stage, seed=42, actions=actions or [])

    def test_budget_conservation_and_over_allocation_rejected(self):
        state = self.engine.new_run("budget")
        result = self.engine.run_stage(state, self._input("budget", StageId.S1, [
            PlayerAction(company_id="company_a", action="invest", capital_points=55),
            PlayerAction(company_id="company_b", action="support", capital_points=45, support_focus="talent"),
        ]))
        self.assertEqual(result.budget.before, result.budget.spent + result.budget.after)
        self.assertEqual(0, result.budget.opening_balance)
        self.assertEqual(100, result.budget.new_fiscal_capacity)
        self.assertEqual("scenario_assumption", result.budget.assumption.value_type)
        self.assertEqual("insufficient", result.budget.assumption.data_attempt_status)
        self.assertFalse(result.budget.assumption.source_ids)
        self.assertEqual(result.budget.after, result.next_state.treasury_balance)
        with self.assertRaisesRegex(ValueError, "exceeds available budget"):
            self.engine.run_stage(state, self._input("budget", StageId.S1, [
                PlayerAction(company_id="company_a", action="invest", capital_points=70),
                PlayerAction(company_id="company_b", action="invest", capital_points=31),
            ]))

    def test_unspent_budget_carries_forward_instead_of_resetting(self):
        state = self.engine.new_run("carry", ["company_a", "company_d"])
        s1 = self.engine.run_stage(
            state,
            self._input("carry", StageId.S1, [
                PlayerAction(company_id="company_a", action="invest", capital_points=20),
            ]),
        )
        s2 = self.engine.run_stage(s1.next_state, self._input("carry", StageId.S2))
        self.assertEqual(80, s2.budget.opening_balance)
        self.assertEqual(s1.next_state.treasury_balance, s2.budget.opening_balance)
        self.assertEqual(
            s2.budget.opening_balance + s2.budget.new_fiscal_capacity + s2.budget.exits_and_returns,
            s2.budget.gross_resources,
        )
        self.assertEqual(
            max(0, s2.budget.gross_resources - s2.budget.committed_capital - s2.budget.maintenance_cost),
            s2.budget.before,
        )

    def test_spending_more_now_reduces_next_stage_available_balance(self):
        low = self.engine.new_run("low", ["company_a", "company_d"])
        high = self.engine.new_run("high", ["company_a", "company_d"])
        low_s1 = self.engine.run_stage(low, self._input("low", StageId.S1, [
            PlayerAction(company_id="company_a", action="invest", capital_points=20),
        ]))
        high_s1 = self.engine.run_stage(high, self._input("high", StageId.S1, [
            PlayerAction(company_id="company_a", action="invest", capital_points=70),
        ]))
        low_s2 = self.engine.run_stage(low_s1.next_state, self._input("low", StageId.S2))
        high_s2 = self.engine.run_stage(high_s1.next_state, self._input("high", StageId.S2))
        self.assertGreater(low_s2.budget.before, high_s2.budget.before)
        self.assertGreaterEqual(low_s2.budget.before - high_s2.budget.before, 40)

    def test_all_six_prototypes_share_the_same_engine(self):
        ids = self.loader.company_ids()
        seen = set()
        for pair in itertools.combinations(ids, 2):
            state = self.engine.new_run("combo", list(pair))
            result = self.engine.run_stage(state, self._input("combo", StageId.S1))
            seen.update(item.company_id for item in result.companies)
            self.assertEqual(2, len(result.company_actions))
        self.assertEqual(set(ids), seen)

    def test_unfunded_companies_continue_to_change(self):
        state = self.engine.new_run("parallel", ["company_a", "company_b", "company_d"])
        before = {item.company_id: item.model_dump() for item in state.companies}
        result = self.engine.run_stage(state, self._input("parallel", StageId.S1, [
            PlayerAction(company_id="company_a", action="invest", capital_points=50),
        ]))
        for company_id in ("company_b", "company_d"):
            after = next(item for item in result.companies if item.company_id == company_id).model_dump()
            self.assertNotEqual(before[company_id], after)

    def test_different_allocations_produce_different_states(self):
        zero = self.engine.new_run("zero", ["company_a", "company_d"])
        funded = self.engine.new_run("funded", ["company_a", "company_d"])
        zero_result = self.engine.run_stage(zero, self._input("zero", StageId.S1))
        funded_result = self.engine.run_stage(funded, self._input("funded", StageId.S1, [
            PlayerAction(company_id="company_a", action="invest", capital_points=50),
        ]))
        zero_a = next(item for item in zero_result.companies if item.company_id == "company_a")
        funded_a = next(item for item in funded_result.companies if item.company_id == "company_a")
        self.assertNotEqual(zero_a.construction_progress, funded_a.construction_progress)

    def test_stage_order_and_finalization(self):
        state = self.engine.new_run("full", ["company_a", "company_d"])
        for stage in StageId:
            result = self.engine.run_stage(state, self._input("full", stage))
            state = result.next_state
        final = self.engine.finalize(state)
        self.assertEqual([StageId.S1, StageId.S2, StageId.S3, StageId.S4], state.completed_stages)
        self.assertTrue(final.historical_replay.leakage_audit_passed)
        self.assertGreater(final.historical_replay.calibrated_case_count, 0)
        self.assertEqual(
            {"direction", "sequence", "mechanism", "path_feedback", "leakage"},
            set(final.historical_replay.score_basis),
        )

    def test_replay_sequence_score_is_computed_from_stage_history(self):
        state = self.engine.new_run("replay-score", ["company_a", "company_d"])
        for stage in StageId:
            state = self.engine.run_stage(
                state, self._input("replay-score", stage)
            ).next_state
        normal = self.engine.finalize(state).historical_replay.sequence_score
        state.stage_audits[2].construction_progress["company_a"] = 0
        degraded = self.engine.finalize(state).historical_replay.sequence_score
        self.assertLess(degraded, normal)

    def test_every_delta_is_reconciled_and_traceable(self):
        state = self.engine.new_run("trace", ["company_a", "company_b"])
        result = self.engine.run_stage(state, self._input("trace", StageId.S1, [
            PlayerAction(company_id="company_a", action="support", capital_points=30, support_focus="supply_chain"),
        ]))
        self.assertTrue(result.state_deltas)
        for delta in result.state_deltas:
            self.assertEqual(delta.after, delta.before + delta.delta)
            self.assertTrue(delta.reason_code)
            self.assertTrue(delta.input_metric_ids)


if __name__ == "__main__":
    unittest.main()
