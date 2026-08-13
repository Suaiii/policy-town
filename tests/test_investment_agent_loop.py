import unittest
import sqlite3
import tempfile
from pathlib import Path

from contracts.investment_simulation_v0_1 import (
    NegotiationChoice,
    PlayerAction,
    StageId,
    StageInput,
)
from policytown.investment import HefeiMvpLoader, HefeiRealDataRepository, InvestmentEngine


class GovernmentEnterpriseLoopTest(unittest.TestCase):
    def setUp(self):
        self.loader = HefeiMvpLoader()
        self.engine = InvestmentEngine(self.loader)

    def _preview(self, run_id: str = "loop-preview"):
        state = self.engine.new_run(run_id, ["company_a", "company_d"], seed=42)
        result = self.engine.run_stage(
            state,
            StageInput(run_id=run_id, stage_id=StageId.S1, seed=42),
        )
        return state, result

    def test_four_department_contract_is_frozen_and_traceable(self):
        _, result = self._preview()
        deliberation = result.deliberations[0]
        self.assertEqual(
            {"finance", "industry_information", "science_technology", "development_reform"},
            {item.department for item in deliberation.department_inputs},
        )
        self.assertEqual(4, len(deliberation.department_memos))
        visible = set(result.frozen_context_audit.visible_evidence_ids)
        for brief, memo in zip(deliberation.department_inputs, deliberation.department_memos):
            self.assertEqual(result.frozen_context_audit.context_hash, brief.context_hash)
            self.assertEqual(brief.context_hash, memo.input_hash)
            self.assertEqual("deterministic_fallback", memo.generation_mode)
            self.assertTrue(brief.department_kpis)
            self.assertTrue(brief.red_lines)
            self.assertTrue(set(brief.visible_evidence_ids) <= visible | {"HF-S1-EVENT-01"})
            self.assertTrue(memo.supporting_evidence_ids or memo.missing_information)

    def test_negotiation_closes_into_commitments_and_rule_settlement(self):
        state, preview = self._preview("loop-settle")
        proposal = preview.deliberations[0].meeting.proposals[0]
        result = self.engine.run_stage(
            state,
            StageInput(
                run_id="loop-settle",
                stage_id=StageId.S1,
                seed=42,
                actions=[PlayerAction(
                    company_id="company_a",
                    action="invest",
                    capital_points=proposal.capital_points,
                )],
                negotiations=[NegotiationChoice(
                    company_id="company_a",
                    proposal_id=proposal.proposal_id,
                    resolution="accept",
                )],
            ),
        )
        loop = next(item for item in result.deliberations if item.company_id == "company_a")
        self.assertIsNotNone(loop.verification_question)
        self.assertIn(loop.enterprise_disclosure.response_type, {
            "disclose", "range", "refuse", "exchange_condition",
        })
        self.assertIsNotNone(loop.condition_sheet)
        self.assertIsNotNone(loop.enterprise_counteroffer)
        self.assertEqual(
            ["verification_question", "enterprise_disclosure", "government_condition",
             "enterprise_counteroffer", "final_commitment", "rule_settlement"],
            [item.phase for item in loop.negotiation_log],
        )
        self.assertEqual(2, len([
            item for item in result.commitment_updates if item.company_id == "company_a"
        ]))
        self.assertTrue(any(
            item.reason_code == "player_investment" and item.entity_id == "company_a"
            for item in result.state_deltas
        ))

    def test_accepted_counteroffer_becomes_the_final_numeric_amount(self):
        state, preview = self._preview("counteroffer-settle")
        company = next(item for item in state.companies if item.company_id == "company_a")
        proposal = preview.deliberations[0].meeting.proposals[0]
        self.assertGreater(company.capital_request, proposal.capital_points)
        result = self.engine.run_stage(
            state,
            StageInput(
                run_id="counteroffer-settle",
                stage_id=StageId.S1,
                actions=[PlayerAction(
                    company_id="company_a",
                    action="invest",
                    capital_points=company.capital_request,
                )],
                negotiations=[NegotiationChoice(
                    company_id="company_a",
                    proposal_id=proposal.proposal_id,
                    resolution="accept_counteroffer",
                )],
            ),
        )
        loop = next(item for item in result.deliberations if item.company_id == "company_a")
        self.assertEqual("accepted_as_modified", loop.enterprise_response.resolution)
        self.assertEqual(company.capital_request, loop.enterprise_response.agreed_capital_points)
        self.assertEqual(company.capital_request, loop.condition_sheet.capital_points)
        self.assertEqual(company.capital_request, result.budget.spent)

    def test_rejected_negotiation_cannot_change_numeric_state(self):
        with self.assertRaisesRegex(ValueError, "rejected negotiation"):
            StageInput(
                run_id="reject",
                stage_id=StageId.S1,
                actions=[PlayerAction(company_id="company_a", action="invest", capital_points=10)],
                negotiations=[NegotiationChoice(
                    company_id="company_a", proposal_id="p", resolution="reject",
                )],
            )

    def test_player_action_must_match_the_negotiated_amount(self):
        state, preview = self._preview("tampered-settlement")
        proposal = preview.deliberations[0].meeting.proposals[0]
        with self.assertRaisesRegex(ValueError, "must equal negotiated amount"):
            self.engine.run_stage(
                state,
                StageInput(
                    run_id="tampered-settlement",
                    stage_id=StageId.S1,
                    actions=[PlayerAction(
                        company_id="company_a",
                        action="invest",
                        capital_points=proposal.capital_points + 1,
                    )],
                    negotiations=[NegotiationChoice(
                        company_id="company_a",
                        proposal_id=proposal.proposal_id,
                        resolution="accept",
                    )],
                ),
            )

    def test_seeded_output_is_reproducible_and_run_memories_are_isolated(self):
        _, first = self._preview("repeat")
        _, second = self._preview("repeat")
        self.assertEqual(
            first.deliberations[0].model_dump(mode="json"),
            second.deliberations[0].model_dump(mode="json"),
        )
        other_state, other = self._preview("other-run")
        self.assertFalse(other_state.belief_ledger)
        self.assertFalse(other_state.commitment_ledger)
        self.assertTrue(other.next_state.belief_ledger)
        self.assertTrue(all("repeat" not in item.brief_id for item in other.deliberations[0].department_inputs))

    def test_model_timeout_invalid_json_and_offline_all_use_fallback(self):
        providers = [
            lambda _brief: (_ for _ in ()).throw(TimeoutError("deadline")),
            lambda _brief: "not-json",
            lambda _brief: (_ for _ in ()).throw(OSError("offline")),
        ]
        for index, provider in enumerate(providers):
            engine = InvestmentEngine(department_provider=provider)
            state = engine.new_run(f"fallback-{index}", ["company_a", "company_d"])
            result = engine.run_stage(
                state,
                StageInput(run_id=state.run_id, stage_id=StageId.S1),
            )
            memos = result.deliberations[0].department_memos
            self.assertTrue(all(item.generation_mode == "deterministic_fallback" for item in memos))
            self.assertTrue(all(item.fallback_reason for item in memos))
            self.assertEqual(4, len(memos))

    def test_model_cannot_cite_future_or_unknown_evidence(self):
        def malicious(brief):
            return {
                "recommendation": "support",
                "core_claim": "引用截止日后证据。",
                "supporting_evidence_ids": ["observation:boe_2008_revenue"],
                "opposing_evidence_ids": [],
                "assumptions": [],
                "missing_information": [],
                "red_lines": brief.red_lines,
                "acceptable_conditions": ["无条件"],
                "confidence": 1,
                "most_important_risk": "无",
            }

        engine = InvestmentEngine(department_provider=malicious)
        state = engine.new_run("future-citation", ["company_a", "company_d"])
        result = engine.run_stage(
            state,
            StageInput(run_id=state.run_id, stage_id=StageId.S1),
        )
        for memo in result.deliberations[0].department_memos:
            self.assertEqual("deterministic_fallback", memo.generation_mode)
            self.assertNotIn("observation:boe_2008_revenue", memo.supporting_evidence_ids)


class CutoffFreezeDemoTest(unittest.TestCase):
    def setUp(self):
        self.repository = HefeiRealDataRepository()

    def test_s1_cutoff_is_fixed_to_decision_date(self):
        self.assertEqual("2008-09-12", HefeiMvpLoader().cutoff_at(StageId.S1))

    def test_all_stage_cutoffs_match_the_frozen_product_schedule(self):
        loader = HefeiMvpLoader()
        self.assertEqual(
            {
                StageId.S1: "2008-09-12",
                StageId.S2: "2011-06-30",
                StageId.S3: "2014-06-30",
                StageId.S4: "2016-12-31",
            },
            {stage_id: loader.cutoff_at(stage_id) for stage_id in StageId},
        )

    def test_stage_event_evidence_is_not_dated_after_cutoff(self):
        loader = HefeiMvpLoader()
        for stage_id in StageId:
            cutoff = loader.cutoff_at(stage_id)
            refs = loader.evidence_for(set(loader.event(stage_id).evidence_ids), cutoff)
            self.assertEqual(
                set(loader.event(stage_id).evidence_ids),
                {item.evidence_id for item in refs},
            )

    def test_s1_audit_shows_one_visible_and_two_future_boe_records(self):
        audit = self.repository.freeze_audit(
            StageId.S1, "2008-09-12", mode="audit", case_ids={"CASE-02"},
        )
        decisions = {item.evidence_id: item for item in audit.decisions}
        self.assertEqual("visible", decisions["observation:boe_total_investment"].decision)
        self.assertEqual("available_at_cutoff", decisions["observation:boe_total_investment"].reason_code)
        for evidence_id in (
            "observation:boe_6g_government_capital_commitment",
            "observation:boe_2008_revenue",
        ):
            self.assertEqual("withheld", decisions[evidence_id].decision)
            self.assertEqual("published_after_cutoff", decisions[evidence_id].reason_code)
            self.assertGreater(decisions[evidence_id].information_available_date, audit.cutoff_at)

    def test_player_mode_hides_future_metadata_and_replay_unlocks_milestones(self):
        player = self.repository.freeze_audit(
            StageId.S1, "2008-09-12", mode="player", case_ids={"CASE-02"},
        )
        self.assertEqual(1, len([item for item in player.decisions if item.title == "当时不可知"]))
        self.assertFalse(any(
            item.evidence_id == "observation:boe_2008_revenue" for item in player.decisions
        ))
        audit = self.repository.freeze_audit(
            StageId.S1, "2008-09-12", mode="audit", case_ids={"CASE-02"},
        )
        replay = self.repository.freeze_audit(
            StageId.S1, "9999-12-31", mode="replay", case_ids={"CASE-02"},
        )
        withheld = next(item for item in audit.decisions if item.evidence_id == "milestone:boe_construction")
        unlocked = next(item for item in replay.decisions if item.evidence_id == "milestone:boe_construction")
        self.assertEqual("withheld", withheld.decision)
        self.assertEqual("withheld_outcome", withheld.reason_code)
        self.assertEqual("visible", unlocked.decision)

    def test_all_stage_contexts_reject_future_information(self):
        loader = HefeiMvpLoader()
        for stage_id in StageId:
            cutoff = loader.cutoff_at(stage_id)
            context = self.repository.context_at(cutoff)
            self.assertTrue(all(
                item.information_available_date <= cutoff for item in context.observations
            ))

    def test_removing_key_evidence_changes_a_department_position_or_condition(self):
        with sqlite3.connect(self.repository.db_path) as source, tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            copied = Path(tmp) / "without_key_evidence.sqlite3"
            with sqlite3.connect(copied) as target:
                source.backup(target)
            with sqlite3.connect(copied) as target:
                target.execute("DELETE FROM observation WHERE observation_id = 'boe_total_investment'")
                target.commit()

            baseline_engine = InvestmentEngine()
            baseline_state = baseline_engine.new_run("baseline-key", ["company_a", "company_d"])
            baseline = baseline_engine.run_stage(
                baseline_state,
                StageInput(run_id="baseline-key", stage_id=StageId.S1),
            )
            changed_repository = HefeiRealDataRepository(copied)
            changed_engine = InvestmentEngine(real_data=changed_repository)
            changed_state = changed_engine.new_run("changed-key", ["company_a", "company_d"])
            changed = changed_engine.run_stage(
                changed_state,
                StageInput(run_id="changed-key", stage_id=StageId.S1),
            )
            baseline_memo = next(
                item for item in baseline.deliberations[0].department_memos
                if item.department == "science_technology"
            )
            changed_memo = next(
                item for item in changed.deliberations[0].department_memos
                if item.department == "science_technology"
            )
            self.assertTrue(
                baseline_memo.recommendation != changed_memo.recommendation
                or baseline.deliberations[0].meeting.proposals
                != changed.deliberations[0].meeting.proposals
                or baseline_memo.supporting_evidence_ids
                != changed_memo.supporting_evidence_ids
            )

    def test_final_result_unlocks_replay_evidence_without_polluting_stages(self):
        engine = InvestmentEngine()
        state = engine.new_run("final-replay", ["company_a", "company_d"])
        for stage_id in StageId:
            result = engine.run_stage(
                state,
                StageInput(run_id=state.run_id, stage_id=stage_id),
            )
            self.assertTrue(all(
                item.information_available_date <= result.cutoff_at
                for item in result.real_data_context.observations
            ))
            state = result.next_state
        final = engine.finalize(state)
        self.assertEqual("replay", final.replay_evidence.mode)
        self.assertIn(
            "observation:boe_2008_revenue",
            final.replay_evidence.visible_evidence_ids,
        )
        self.assertIn(
            "milestone:boe_construction",
            final.replay_evidence.visible_evidence_ids,
        )


if __name__ == "__main__":
    unittest.main()
