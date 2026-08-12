import unittest

from contracts.investment_simulation_v0_1 import StageId, StageInput
from policytown.investment import (
    HefeiContextBuilder,
    HefeiMvpLoader,
    HefeiRealDataRepository,
    InvestmentEngine,
)


class InvestmentRealDataTest(unittest.TestCase):
    def test_stage_budget_is_explicit_scenario_assumption(self):
        loader = HefeiMvpLoader()
        expected = {StageId.S1: 100, StageId.S2: 60, StageId.S3: 45, StageId.S4: 30}
        for stage, points in expected.items():
            assumption = loader.budget_assumption(stage)
            self.assertEqual(points, assumption.new_fiscal_capacity)
            self.assertEqual("scenario_assumption", assumption.value_type)
            self.assertEqual("insufficient", assumption.data_attempt_status)
            self.assertEqual("uncalibrated", assumption.calibration_status)
            self.assertTrue(assumption.attempted_source_ids)
            self.assertTrue(assumption.missing_fields)
            self.assertFalse(assumption.source_ids)

    def test_stage_budget_fallback_is_traceable_in_result(self):
        engine = InvestmentEngine()
        state = engine.new_run("budget-trace", ["company_a", "company_d"])
        result = engine.run_stage(state, StageInput(run_id="budget-trace", stage_id=StageId.S1))
        self.assertEqual("fiscal-gameplay-s1-v1", result.budget.assumption.assumption_id)
        self.assertEqual("hefei.fiscal.investable_capacity.S1", result.budget.assumption.replacement_key)
        self.assertIn("GAP-P0-FISCAL", result.budget.assumption.data_gap_ids)

    def test_repository_enforces_information_cutoff(self):
        repository = HefeiRealDataRepository()
        context = repository.context_at("2008-09-12")
        ids = {item.observation_id for item in context.observations}
        self.assertNotIn("boe_2008_revenue", ids)
        self.assertNotIn("hef_2008_fiscal_revenue_total", ids)
        self.assertTrue(all(item.information_available_date <= context.cutoff_at for item in context.observations))

    def test_later_context_contains_published_real_data(self):
        context = HefeiRealDataRepository().context_at("2009-04-21")
        ids = {item.observation_id for item in context.observations}
        self.assertIn("boe_2008_revenue", ids)
        self.assertIn("hef_2008_fiscal_revenue_total", ids)

    def test_rolling_reports_fill_2008_to_2015_fund_series_without_leakage(self):
        repository = HefeiRealDataRepository()
        early = {item.observation_id for item in repository.context_at("2008-09-30").observations}
        self.assertNotIn("hef_2008_fund_revenue", early)
        later = repository.context_at("2016-06-30")
        fund_ids = {item.observation_id for item in later.observations if item.indicator_id == "government_fund_revenue"}
        self.assertEqual({f"hef_{year}_fund_revenue" for year in range(2008, 2016)}, fund_ids)

    def test_engine_stage_exposes_raw_real_data_and_sources(self):
        engine = InvestmentEngine()
        state = engine.new_run("real-data", ["company_a", "company_d"])
        result = engine.run_stage(state, StageInput(run_id="real-data", stage_id=StageId.S1, seed=42))
        self.assertIsNotNone(result.real_data_context)
        self.assertTrue(result.real_data_context.observations)
        self.assertTrue(any(item.source_url for item in result.real_data_context.observations))
        self.assertTrue(any(item.source_sha256 for item in result.real_data_context.observations))
        self.assertTrue(any(item.evidence_id.startswith("observation:") for item in result.evidence_refs))
        self.assertTrue(all(any(eid.startswith("observation:") for eid in item.evidence_ids) for item in result.agent_assessments))

    def test_context_builder_uses_real_observations_for_initial_state(self):
        loader = HefeiMvpLoader()
        builder = HefeiContextBuilder(loader, HefeiRealDataRepository())
        projected = builder.project(["company_a", "company_d"], "2008-09-30")
        configured = loader.initial_city_metrics()
        self.assertNotEqual(configured.industrial_base, projected.city.industrial_base)
        industrial = next(
            item for item in projected.context.derivations
            if item.entity_id == "city" and item.metric_id == "industrial_base"
        )
        self.assertIn("observation:hef_2007_secondary_value_added", industrial.evidence_ids)
        company_a = next(item for item in projected.companies if item.company_id == "company_a")
        self.assertNotEqual(loader.load_companies(["company_a", "company_d"])[0].capital_intensity, company_a.capital_intensity)

    def test_observed_fiscal_data_does_not_claim_to_calibrate_gameplay_points(self):
        loader = HefeiMvpLoader()
        repository = HefeiRealDataRepository()
        for stage in StageId:
            assumption = loader.budget_assumption(stage)
            context = repository.context_at(loader.cutoff_at(stage))
            self.assertTrue(any(item.domain == "government" for item in context.observations))
            self.assertFalse(assumption.source_ids)

    def test_later_real_context_changes_state_and_deltas(self):
        engine = InvestmentEngine()
        state = engine.new_run("real-deltas", ["company_a", "company_d"])
        s1 = engine.run_stage(
            state,
            StageInput(run_id="real-deltas", stage_id=StageId.S1, seed=42),
        )
        s2 = engine.run_stage(
            s1.next_state,
            StageInput(run_id="real-deltas", stage_id=StageId.S2, seed=42),
        )
        real_deltas = [item for item in s2.state_deltas if item.reason_code == "real_context_update"]
        self.assertTrue(real_deltas)
        self.assertTrue(all(
            any(eid.startswith(("observation:", "policy:")) for eid in item.evidence_ids)
            for item in real_deltas
        ))
        self.assertTrue(any(item.entity_id == "company_d" and item.metric_id == "financial_health" for item in real_deltas))

    def test_agent_scores_change_when_real_context_changes(self):
        engine = InvestmentEngine()
        state = engine.new_run("score-change", ["company_a", "company_d"])
        s1 = engine.run_stage(
            state,
            StageInput(run_id="score-change", stage_id=StageId.S1, seed=42),
        )
        s2 = engine.run_stage(
            s1.next_state,
            StageInput(run_id="score-change", stage_id=StageId.S2, seed=42),
        )
        def score(stage, company, agent):
            return next(item.score for item in stage.agent_assessments if item.company_id == company and item.agent == agent)
        self.assertNotEqual(score(s1, "company_d", "market"), score(s2, "company_d", "market"))
        self.assertNotEqual(score(s1, "company_d", "industry"), score(s2, "company_d", "industry"))


if __name__ == "__main__":
    unittest.main()
