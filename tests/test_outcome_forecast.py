import unittest

from contracts.investment_simulation_v0_1 import EnterpriseBeliefState, StageId
from policytown.investment.outcome_forecast import (
    FORECAST_WEIGHTS,
    derive_outcome_forecast,
    derive_p_success,
    evaluate_forecasts,
)


def _beliefs(**overrides):
    payload = {
        "company_id": "company_a",
        "run_id": "run",
        "stage_id": StageId.S4,
        "market_outlook": 0.5,
        "financing_continuity": 0.8,
        "delivery_feasibility": 0.6,
        "government_follow_through": 0.7,
        "confidence": 0.55,
        "evidence_ids": ["observation:hef_2007_gdp_growth"],
    }
    payload.update(overrides)
    return EnterpriseBeliefState.model_validate(payload)


class OutcomeForecastTest(unittest.TestCase):
    def test_weights_sum_to_one(self):
        self.assertAlmostEqual(sum(FORECAST_WEIGHTS.values()), 1.0, places=6)

    def test_derive_p_success_weighted_average(self):
        beliefs = _beliefs()
        expected = (
            0.35 * 0.8 + 0.35 * 0.6 + 0.20 * 0.5 + 0.10 * 0.7
        )
        self.assertAlmostEqual(derive_p_success(beliefs), expected, places=6)

    def test_derive_forecast_success_case(self):
        forecast = derive_outcome_forecast(
            case_id="CASE-02",
            company_id="company_a",
            cutoff_at="2008-09-12",
            beliefs=_beliefs(),
            ground_truth="success",
        )
        self.assertEqual("success", forecast.predicted_direction)
        self.assertTrue(forecast.is_correct_direction)
        self.assertAlmostEqual(forecast.brier_contribution, (forecast.p_success - 1.0) ** 2, places=6)
        self.assertTrue(forecast.evidence_ids)

    def test_derive_forecast_failure_case_correct(self):
        forecast = derive_outcome_forecast(
            case_id="CASE-04",
            company_id="company_d",
            cutoff_at="2010-08-30",
            beliefs=_beliefs(financing_continuity=0.2, delivery_feasibility=0.3),
            ground_truth="failure",
        )
        self.assertEqual("failure", forecast.predicted_direction)
        self.assertTrue(forecast.is_correct_direction)

    def test_derive_forecast_direction_mismatch(self):
        forecast = derive_outcome_forecast(
            case_id="CASE-04",
            company_id="company_d",
            cutoff_at="2010-08-30",
            beliefs=_beliefs(),
            ground_truth="failure",
        )
        self.assertEqual("success", forecast.predicted_direction)
        self.assertFalse(forecast.is_correct_direction)

    def test_evaluate_forecasts_reports_metrics_and_auc(self):
        forecasts = [
            derive_outcome_forecast(
                case_id="CASE-02", company_id="company_a", cutoff_at="2008-09-12",
                beliefs=_beliefs(), ground_truth="success",
            ),
            derive_outcome_forecast(
                case_id="CASE-04", company_id="company_d", cutoff_at="2010-08-30",
                beliefs=_beliefs(financing_continuity=0.2, delivery_feasibility=0.3),
                ground_truth="failure",
            ),
        ]
        report = evaluate_forecasts(forecasts, leakage_passed=True)
        self.assertEqual(2, report.calibrated_case_count)
        self.assertTrue(report.leakage_passed)
        self.assertIsNotNone(report.brier_score)
        self.assertIsNotNone(report.log_loss)
        self.assertIsNotNone(report.expected_calibration_error)
        self.assertIsNotNone(report.roc_auc)
        self.assertIsNotNone(report.direction_accuracy)
        self.assertEqual(2, len(report.forecasts))

    def test_evaluate_empty_forecasts(self):
        report = evaluate_forecasts([], leakage_passed=False)
        self.assertEqual(0, report.calibrated_case_count)
        self.assertFalse(report.leakage_passed)
        self.assertIsNone(report.brier_score)


if __name__ == "__main__":
    unittest.main()
