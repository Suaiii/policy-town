import unittest

from contracts.investment_simulation_v0_1 import (
    CommitmentLedgerEntry,
    NegotiationChoice,
    PlayerAction,
    StageId,
    StageInput,
)
from policytown.investment import InvestmentEngine


class InvestmentDeliberationTest(unittest.TestCase):
    def setUp(self):
        self.engine = InvestmentEngine()
        self.state = self.engine.new_run("agent-loop", ["company_a", "company_d"], seed=42)

    def _preview(self):
        return self.engine.run_stage(
            self.state,
            StageInput(run_id="agent-loop", stage_id=StageId.S1, seed=42),
        )

    def test_s1_produces_four_independent_department_memos(self):
        result = self._preview()
        boe = next(item for item in result.deliberations if item.company_id == "company_a")
        self.assertEqual(
            {"finance", "industry_information", "science_technology", "development_reform"},
            {item.department for item in boe.department_memos},
        )
        self.assertTrue(all(item.core_claim for item in boe.department_memos))
        self.assertTrue(all(item.supporting_evidence_ids for item in boe.department_memos))
        self.assertTrue(all(item.missing_information for item in boe.department_memos))
        self.assertTrue(all(item.red_lines for item in boe.department_memos))
        valid_observations = {
            item.observation_id for item in result.real_data_context.observations
        }
        for memo in boe.department_memos:
            for evidence_id in memo.supporting_evidence_ids:
                if evidence_id.startswith("observation:"):
                    self.assertIn(evidence_id.removeprefix("observation:"), valid_observations)
        self.assertTrue(all(
            ref.as_of <= result.cutoff_at
            for ref in result.evidence_refs
            if ref.evidence_id in {
                evidence_id
                for memo in boe.department_memos
                for evidence_id in memo.supporting_evidence_ids
            }
        ))

    def test_joint_meeting_contains_targeted_challenge_and_two_options(self):
        boe = next(item for item in self._preview().deliberations if item.company_id == "company_a")
        self.assertTrue(boe.meeting.challenges)
        self.assertGreaterEqual(len(boe.meeting.proposals), 2)
        self.assertTrue(all(item.conditions for item in boe.meeting.proposals))
        self.assertNotEqual(
            boe.meeting.proposals[0].capital_points,
            boe.meeting.proposals[1].capital_points,
        )

    def test_selected_offer_triggers_one_response_and_writes_ledgers(self):
        proposal = next(
            item for item in self._preview().deliberations if item.company_id == "company_a"
        ).meeting.proposals[0]
        result = self.engine.run_stage(
            self.state,
            StageInput(
                run_id="agent-loop",
                stage_id=StageId.S1,
                actions=[
                    PlayerAction(
                        company_id="company_a",
                        action="invest",
                        capital_points=proposal.capital_points,
                    )
                ],
                negotiations=[
                    NegotiationChoice(
                        company_id="company_a",
                        proposal_id=proposal.proposal_id,
                        resolution="accept",
                    )
                ],
            ),
        )
        boe = next(item for item in result.deliberations if item.company_id == "company_a")
        self.assertEqual(proposal.proposal_id, boe.selected_proposal_id)
        self.assertIn(boe.enterprise_response.response_type, {"accept", "counteroffer"})
        self.assertEqual(proposal.capital_points, boe.enterprise_response.agreed_capital_points)
        self.assertEqual(proposal.capital_points, boe.condition_sheet.capital_points)
        self.assertIn(f"{proposal.capital_points}点", result.commitment_updates[0].promise)
        self.assertEqual(2, len(result.commitment_updates))
        self.assertEqual(2, len(result.belief_updates) // len(result.deliberations))
        self.assertEqual(result.commitment_updates, result.next_state.commitment_ledger)

    def test_preview_is_deterministic(self):
        first = self._preview().deliberations
        second = self._preview().deliberations
        self.assertEqual(first, second)

    def test_settlement_rejects_action_that_does_not_match_selected_offer(self):
        proposal = next(
            item for item in self._preview().deliberations if item.company_id == "company_a"
        ).meeting.proposals[0]
        with self.assertRaisesRegex(ValueError, "must equal negotiated amount"):
            self.engine.run_stage(
                self.state,
                StageInput(
                    run_id="agent-loop",
                    stage_id=StageId.S1,
                    actions=[
                        PlayerAction(
                            company_id="company_a",
                            action="invest",
                            capital_points=proposal.capital_points - 1,
                        )
                    ],
                    negotiations=[
                        NegotiationChoice(
                            company_id="company_a",
                            proposal_id=proposal.proposal_id,
                            resolution="accept",
                        )
                    ],
                ),
            )

    def test_accept_counteroffer_uses_enterprise_requested_amount(self):
        proposal = next(
            item for item in self._preview().deliberations if item.company_id == "company_a"
        ).meeting.proposals[0]
        requested = next(item for item in self.state.companies if item.company_id == "company_a").capital_request
        result = self.engine.run_stage(
            self.state,
            StageInput(
                run_id="agent-loop",
                stage_id=StageId.S1,
                actions=[PlayerAction(
                    company_id="company_a", action="invest", capital_points=requested,
                )],
                negotiations=[NegotiationChoice(
                    company_id="company_a",
                    proposal_id=proposal.proposal_id,
                    resolution="accept_counteroffer",
                )],
            ),
        )
        boe = next(item for item in result.deliberations if item.company_id == "company_a")
        self.assertEqual("accepted_as_modified", boe.enterprise_response.resolution)
        self.assertEqual(requested, boe.enterprise_response.agreed_capital_points)
        self.assertEqual(requested, boe.condition_sheet.capital_points)
        self.assertIn(f"{requested}点", result.commitment_updates[0].promise)

    def test_next_stage_follows_up_one_due_commitment_per_company(self):
        proposal = next(
            item for item in self._preview().deliberations if item.company_id == "company_a"
        ).meeting.proposals[0]
        s1 = self.engine.run_stage(
            self.state,
            StageInput(
                run_id="agent-loop",
                stage_id=StageId.S1,
                actions=[PlayerAction(
                    company_id="company_a", action="invest",
                    capital_points=proposal.capital_points,
                )],
                negotiations=[NegotiationChoice(
                    company_id="company_a", proposal_id=proposal.proposal_id,
                    resolution="accept",
                )],
            ),
        )
        s2 = self.engine.run_stage(
            s1.next_state,
            StageInput(run_id="agent-loop", stage_id=StageId.S2),
        )
        self.assertEqual(1, len(s2.commitment_follow_ups))
        follow_up = s2.commitment_follow_ups[0]
        self.assertEqual("company_a", follow_up.company_id)
        self.assertEqual(StageId.S2, follow_up.due_stage)
        self.assertIn(follow_up.status, {"fulfilled", "breached", "evidence_insufficient"})
        self.assertTrue(any(
            item.event_type == "follow_up" for item in s2.timeline_events
        ))
        company_commitment = next(
            item for item in s2.next_state.commitment_ledger
            if item.commitment_id == follow_up.commitment_id
        )
        expected_status = "pending" if follow_up.status == "evidence_insufficient" else follow_up.status
        self.assertEqual(expected_status, company_commitment.status)

    def test_breached_due_commitment_blocks_follow_on_and_changes_state(self):
        state = self.engine.new_run("breach-follow-up", ["company_a", "company_d"], seed=42)
        company = next(item for item in state.companies if item.company_id == "company_a")
        company.construction_progress = 0
        company.technology_readiness = 0
        company.production_ramp = 0
        state.current_stage = StageId.S1
        state.next_stage = StageId.S2
        state.completed_stages = [StageId.S1]
        state.commitment_ledger = [CommitmentLedgerEntry(
            commitment_id="S1-company_a-company-milestone",
            stage_id=StageId.S1,
            company_id="company_a",
            party="company",
            promise="提交阶段建设与技术里程碑",
            due_stage=StageId.S2,
            condition="里程碑验收",
            evidence_ids=["observation:boe_total_investment"],
        )]
        preview = self.engine.run_stage(
            state,
            StageInput(run_id=state.run_id, stage_id=StageId.S2),
        )
        follow_up = preview.commitment_follow_ups[0]
        self.assertEqual("breached", follow_up.status)
        changed = next(item for item in preview.companies if item.company_id == "company_a")
        self.assertGreaterEqual(changed.missed_windows, 1)
        with self.assertRaisesRegex(ValueError, "follow-on is paused"):
            self.engine.run_stage(
                state,
                StageInput(
                    run_id=state.run_id,
                    stage_id=StageId.S2,
                    actions=[PlayerAction(
                        company_id="company_a",
                        action="follow_on",
                        capital_points=5,
                    )],
                ),
            )


if __name__ == "__main__":
    unittest.main()
