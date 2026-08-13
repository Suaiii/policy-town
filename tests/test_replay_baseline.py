import sqlite3
import tempfile
import unittest
from pathlib import Path

import yaml
from pydantic import ValidationError

from contracts.investment_simulation_v0_1 import PlayerAction, StageId, StageInput
from policytown.investment import (
    HefeiRealDataRepository,
    InvestmentEngine,
    ReplayBaselineRepository,
    load_decision_baseline,
)


ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = (
    ROOT / "data" / "historical_cases" / "hefei_boe_2008" / "decision_baseline.yaml"
)


class ReplayDecisionBaselineTest(unittest.TestCase):
    def test_boe_s1_baseline_passes_five_element_gate(self):
        baseline = load_decision_baseline(BASELINE_PATH)
        self.assertEqual("CASE-02", baseline.case_id)
        self.assertEqual(StageId.S1, baseline.stage_id)
        self.assertEqual(1.0, baseline.completeness)
        self.assertEqual(
            60,
            baseline.government_action.government_registered_capital_commitment.value,
        )
        self.assertEqual(81, baseline.government_action.initial_government_equity_share.value)
        self.assertEqual(9, len(baseline.conditions))
        self.assertEqual(3, len(baseline.milestones))

    def test_all_source_ids_exist_with_archives_and_hashes(self):
        baseline = ReplayBaselineRepository().for_case("CASE-02")
        self.assertIsNotNone(baseline)
        self.assertEqual(3, len(baseline.sources))

    def test_framework_action_is_not_in_decision_day_blind_context(self):
        repository = HefeiRealDataRepository()
        context_ids = {
            item.observation_id for item in repository.context_at("2008-09-12").observations
        }
        self.assertNotIn("boe_total_investment", context_ids)
        self.assertNotIn("boe_planned_capacity", context_ids)
        self.assertNotIn("boe_6g_project_capital", context_ids)
        self.assertNotIn("boe_6g_government_capital_commitment", context_ids)

        audit = repository.freeze_audit(
            StageId.S1, "2008-09-12", mode="audit", case_ids={"CASE-02"}
        )
        decision = next(
            item for item in audit.decisions if item.evidence_id == "milestone:boe_agreement"
        )
        self.assertEqual("withheld", decision.decision)
        self.assertEqual("published_after_cutoff", decision.reason_code)

    def test_replay_compares_action_but_never_points_to_reality_money(self):
        engine = InvestmentEngine()
        state = engine.new_run("baseline-match", ["company_a", "company_d"])
        plan = {
            StageId.S1: [
                PlayerAction(company_id="company_a", action="invest", capital_points=55)
            ],
            StageId.S2: [],
            StageId.S3: [],
            StageId.S4: [],
        }
        for stage_id in StageId:
            state = engine.run_stage(
                state,
                StageInput(run_id=state.run_id, stage_id=stage_id, actions=plan[stage_id]),
            ).next_state
        baseline = engine.finalize(state).historical_replay.decision_baselines[0]
        self.assertTrue(baseline.action_match)
        self.assertTrue(baseline.timing_match)
        capital = next(
            item for item in baseline.comparisons
            if item.field == "government_action.capital_and_equity"
        )
        self.assertEqual("not_evaluable", capital.status)
        self.assertIsNone(capital.simulated_value)
        self.assertIn("不直接换算", capital.reason)

    def test_missing_money_or_source_fails_gate(self):
        payload = yaml.safe_load(BASELINE_PATH.read_text(encoding="utf-8"))
        del payload["government_action"]["project_capital"]
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            broken = Path(tmp) / "missing_money.yaml"
            broken.write_text(
                yaml.safe_dump(payload, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )
            with self.assertRaises(ValidationError):
                load_decision_baseline(broken)

        payload = yaml.safe_load(BASELINE_PATH.read_text(encoding="utf-8"))
        payload["sources"][0]["source_id"] = "missing-source"
        with tempfile.TemporaryDirectory() as tmp:
            case_dir = Path(tmp) / "case"
            case_dir.mkdir()
            (case_dir / "decision_baseline.yaml").write_text(
                yaml.safe_dump(payload, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                ReplayBaselineRepository(root=Path(tmp)).all()

    def test_database_source_removal_fails_traceability_gate(self):
        source_db = ROOT / "data" / "hefei_industry_simulation.sqlite3"
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            copied = Path(tmp) / "baseline.sqlite3"
            with sqlite3.connect(source_db) as source, sqlite3.connect(copied) as target:
                source.backup(target)
            with sqlite3.connect(copied) as target:
                target.execute(
                    "DELETE FROM source WHERE source_id='src_boe_hefei_6g_framework_2008'"
                )
            with self.assertRaises(ValueError):
                ReplayBaselineRepository(db_path=copied).all()


if __name__ == "__main__":
    unittest.main()
