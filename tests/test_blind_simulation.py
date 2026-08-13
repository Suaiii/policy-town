import unittest

from contracts.investment_simulation_v0_1 import (
    AutonomousGovernmentDecision,
    InvestmentActionType,
    StageId,
    StageInput,
)
from policytown.investment import InvestmentEngine
from policytown.investment.blind_simulation import (
    GovernmentDecisionRuntime,
    autonomous_action,
    run_blind_decision,
)


class BlindSimulationTest(unittest.TestCase):
    def setUp(self):
        self.engine = InvestmentEngine()
        self.state = self.engine.new_run("blind", ["company_a", "company_d"], seed=42)
        preview = self.engine.run_stage(
            self.state,
            StageInput(run_id="blind", stage_id=StageId.S1, seed=42),
        )
        self.deliberation = next(
            item for item in preview.deliberations if item.company_id == "company_a"
        )
        self.proposals = {p.proposal_id: p for p in self.deliberation.meeting.proposals}

    def _decision(self, proposal, resolution="accept"):
        return AutonomousGovernmentDecision(
            company_id="company_a",
            stage_id=StageId.S1,
            proposal_id=proposal.proposal_id,
            resolution=resolution,
            reasoning="test",
        )

    def test_autonomous_action_invest_for_conditional_support(self):
        proposal = next(p for p in self.proposals.values() if p.recommendation in {"support", "conditional_support"})
        action, choice = autonomous_action(self._decision(proposal), self.deliberation)
        self.assertIsNotNone(action)
        self.assertEqual(InvestmentActionType.INVEST, action.action)
        self.assertEqual(proposal.capital_points, action.capital_points)
        self.assertEqual("accept", choice.resolution)

    def test_autonomous_action_support_for_defer(self):
        proposal = next(p for p in self.proposals.values() if p.recommendation == "defer")
        action, choice = autonomous_action(self._decision(proposal), self.deliberation)
        self.assertIsNotNone(action)
        self.assertEqual(InvestmentActionType.SUPPORT, action.action)
        self.assertIsNotNone(action.support_focus)

    def test_autonomous_action_reject_means_no_action(self):
        proposal = next(iter(self.proposals.values()))
        action, choice = autonomous_action(self._decision(proposal, "reject"), self.deliberation)
        self.assertIsNone(action)
        self.assertEqual("reject", choice.resolution)

    def test_fallback_selects_a_valid_proposal(self):
        runtime = GovernmentDecisionRuntime()
        decision = runtime._fallback(self.deliberation, "company_a", StageId.S1)
        self.assertIn(decision.proposal_id, self.proposals)
        self.assertEqual("deterministic_fallback", decision.generation_mode)

    def test_run_blind_decision_end_to_end(self):
        runtime = GovernmentDecisionRuntime()
        result = run_blind_decision(
            self.engine, self.state, stage_id=StageId.S1, seed=42,
            decision_runtime=runtime, company_id="company_a",
        )
        self.assertEqual("CASE-02", result.case_id)
        self.assertEqual("invest", result.baseline_action)
        self.assertIsNotNone(result.action_matches_baseline)
        self.assertEqual("deterministic_fallback", result.decision.generation_mode)
        self.assertIn(result.decision.proposal_id, self.proposals)


if __name__ == "__main__":
    unittest.main()
