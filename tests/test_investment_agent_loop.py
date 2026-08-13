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
from policytown.investment import HefeiMvpLoader, HefeiRealDataRepository, InvestmentEngine, MemoryStore


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

    def test_enterprise_private_state_is_loaded_and_not_in_department_brief(self):
        engine = InvestmentEngine()
        state = engine.new_run("private-state", ["company_a", "company_d"])
        result = engine.run_stage(
            state,
            StageInput(run_id=state.run_id, stage_id=StageId.S1),
        )
        for loop in result.deliberations:
            self.assertIsNotNone(loop.enterprise_intent)
            private = engine.loader.enterprise_private_state(loop.company_id, StageId.S1)
            self.assertNotEqual(private.risk_preference, "")
            serialized_briefs = " ".join(str(item.model_dump()) for item in loop.department_inputs)
            self.assertNotIn("financial_private_state", serialized_briefs)
            self.assertNotIn(private.financial_private_state, serialized_briefs)
            self.assertIn(private.risk_preference, loop.enterprise_intent.rationale)

    def test_model_runtime_record_is_traceable(self):
        engine = InvestmentEngine()
        state = engine.new_run("runtime-record", ["company_a", "company_d"])
        result = engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=StageId.S1))
        self.assertEqual("deterministic_fallback", result.model_runtime["provider"])
        self.assertEqual(result.frozen_context_audit.context_hash, result.model_runtime["context_hash"])
        self.assertEqual("42", result.model_runtime["seed"])

    def test_private_state_stage_context_is_cutoff_scoped(self):
        loader = InvestmentEngine().loader
        s1 = loader.enterprise_private_state("company_a", StageId.S1)
        s4 = loader.enterprise_private_state("company_a", StageId.S4)
        self.assertEqual({"S1"}, set(s1.stage_context))
        self.assertEqual({"S1", "S2", "S3", "S4"}, set(s4.stage_context))

    def test_enterprise_memory_persists_and_updates_across_stages(self):
        engine = InvestmentEngine()
        state = engine.new_run("cognitive-loop", ["company_a", "company_d"], seed=42)
        initial = next(item for item in state.enterprise_memories if item.company_id == "company_a")
        s1 = engine.run_stage(
            state,
            StageInput(run_id=state.run_id, stage_id=StageId.S1),
        )
        after_s1 = next(item for item in s1.next_state.enterprise_memories if item.company_id == "company_a")
        s2 = engine.run_stage(
            s1.next_state,
            StageInput(run_id=state.run_id, stage_id=StageId.S2),
        )
        after_s2 = next(item for item in s2.next_state.enterprise_memories if item.company_id == "company_a")
        self.assertEqual(state.run_id, after_s2.run_id)
        self.assertEqual(StageId.S2, after_s2.current_stage)
        self.assertGreaterEqual(len(after_s2.intent_history), 2)
        self.assertNotEqual(initial.current_stage, after_s2.current_stage)
        self.assertNotEqual(after_s1.last_update_reason, after_s2.last_update_reason)
        self.assertTrue(s2.reality_graph_updates)
        self.assertTrue(all(item.run_id == state.run_id for item in s2.reality_graph_updates))
        self.assertTrue(any(item.predicate == "enterprise_intent" for item in s2.reality_graph_updates))
        self.assertTrue(any(item.predicate == "belief:market_outlook" for item in s2.reality_graph_updates))

    def test_reality_graph_and_private_memory_are_isolated_by_run_id(self):
        engine = InvestmentEngine()
        left = engine.new_run("memory-left", ["company_a", "company_d"], seed=42)
        right = engine.new_run("memory-right", ["company_a", "company_d"], seed=42)
        left_result = engine.run_stage(left, StageInput(run_id=left.run_id, stage_id=StageId.S1))
        self.assertTrue(left_result.next_state.reality_graph)
        self.assertTrue(left_result.next_state.enterprise_memories)
        self.assertFalse(any(item.run_id == left.run_id for item in right.reality_graph.records))
        self.assertFalse(any(item.run_id == left.run_id for item in right.enterprise_memories))
        self.assertTrue(all(item.run_id == right.run_id for item in right.enterprise_memories))

    def test_reality_graph_never_contains_private_state_fields(self):
        engine = InvestmentEngine()
        state = engine.new_run("private-graph", ["company_a", "company_d"], seed=42)
        result = engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=StageId.S1))
        serialized = result.next_state.reality_graph.model_dump_json()
        private = engine.loader.enterprise_private_state("company_a", StageId.S1)
        self.assertNotIn("financial_private_state", serialized)
        self.assertNotIn(private.financial_private_state, serialized)
        self.assertNotIn("disclosure_boundary", serialized)

    def test_memory_belief_changes_enterprise_action_policy(self):
        engine = InvestmentEngine()
        state = engine.new_run("belief-action", ["company_a", "company_d"], seed=42)
        memory = next(item for item in state.enterprise_memories if item.company_id == "company_a")
        memory.beliefs = memory.beliefs.model_copy(update={
            "market_outlook": 0.10,
            "financing_continuity": 0.80,
            "delivery_feasibility": 0.80,
        })
        state.enterprise_memories = [memory if item.company_id == memory.company_id else item for item in state.enterprise_memories]
        result = engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=StageId.S1))
        action = next(item for item in result.company_actions if item.company_id == "company_a")
        self.assertEqual("contract", action.action.value)

    def test_memory_store_survives_restart_and_resumes_next_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(Path(tmp) / "memory.sqlite3")
            first_engine = InvestmentEngine(memory_store=store)
            state = first_engine.new_run("restartable", ["company_a", "company_d"], seed=42)
            s1 = first_engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=StageId.S1))
            before = next(item for item in s1.next_state.enterprise_memories if item.company_id == "company_a")

            restarted = InvestmentEngine(memory_store=MemoryStore(Path(tmp) / "memory.sqlite3"))
            restored = restarted.resume_run("restartable")
            restored_memory = next(item for item in restored.enterprise_memories if item.company_id == "company_a")
            self.assertEqual(before.model_dump(mode="json"), restored_memory.model_dump(mode="json"))
            s2 = restarted.run_stage(restored, StageInput(run_id="restartable", stage_id=StageId.S2))
            after = next(item for item in s2.next_state.enterprise_memories if item.company_id == "company_a")
            self.assertEqual(StageId.S2, after.current_stage)
            self.assertGreaterEqual(len(after.intent_history), 2)
            self.assertGreaterEqual(store.run_counts("restartable")["memory_snapshots"], 3)

    def test_persisted_graph_has_visibility_and_cutoff_filters(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(Path(tmp) / "memory.sqlite3")
            engine = InvestmentEngine(memory_store=store)
            state = engine.new_run("graph-query", ["company_a", "company_d"])
            result = engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=StageId.S1))
            graph = store.load_graph("graph-query", visibility={"government", "both"}, cutoff_at=result.cutoff_at)
            self.assertIsNotNone(graph)
            self.assertTrue(all(item.visibility in {"government", "both"} for item in graph.records))
            self.assertTrue(all(item.available_at <= result.cutoff_at for item in graph.records))
            private = store.load_graph("graph-query", visibility={"enterprise"}, cutoff_at=result.cutoff_at)
            self.assertTrue(private.records)
            self.assertTrue(all(item.visibility == "enterprise" for item in private.records))

    def test_replay_stage_does_not_write_future_graph_or_memory(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(Path(tmp) / "memory.sqlite3")
            engine = InvestmentEngine(memory_store=store)
            state = engine.new_run("replay-isolated", ["company_a", "company_d"])
            before = store.run_counts("replay-isolated")
            engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=StageId.S1, context_mode="replay"))
            self.assertEqual(before, store.run_counts("replay-isolated"))


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

    def test_s1_audit_withholds_decision_agreement_published_next_day(self):
        audit = self.repository.freeze_audit(
            StageId.S1, "2008-09-12", mode="audit", case_ids={"CASE-02"},
        )
        decisions = {item.evidence_id: item for item in audit.decisions}
        self.assertEqual("withheld", decisions["observation:boe_total_investment"].decision)
        self.assertEqual("published_after_cutoff", decisions["observation:boe_total_investment"].reason_code)
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

    def test_removing_visible_key_evidence_changes_a_department_position_or_condition(self):
        with sqlite3.connect(self.repository.db_path) as source, tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            copied = Path(tmp) / "without_key_evidence.sqlite3"
            with sqlite3.connect(copied) as target:
                source.backup(target)
            with sqlite3.connect(copied) as target:
                target.execute("DELETE FROM observation WHERE observation_id = 'hef_2007_secondary_value_added'")
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
