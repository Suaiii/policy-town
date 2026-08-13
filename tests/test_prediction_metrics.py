import unittest

from policytown.investment.prediction_metrics import (
    brier_score,
    direction_accuracy,
    expected_calibration_error,
    log_loss,
    roc_auc_score,
)


class PredictionMetricsTest(unittest.TestCase):
    def test_brier_score_hand_computed(self):
        # ((0.9-1)^2 + (0.2-0)^2 + (0.8-1)^2)/3 = (0.01+0.04+0.04)/3 = 0.03
        self.assertAlmostEqual(brier_score([1, 0, 1], [0.9, 0.2, 0.8]), 0.03, places=6)

    def test_brier_score_perfect(self):
        self.assertEqual(brier_score([1, 0], [1.0, 0.0]), 0.0)

    def test_log_loss_is_nonnegative_and_finite(self):
        self.assertGreaterEqual(log_loss([1, 0, 1], [0.9, 0.2, 0.8]), 0.0)

    def test_log_loss_punishes_overconfidence(self):
        # 更自信但方向错，损失必须大于不自信但方向对
        confident_wrong = log_loss([0], [0.99])
        timid_right = log_loss([1], [0.6])
        self.assertGreater(confident_wrong, timid_right)

    def test_direction_accuracy(self):
        self.assertEqual(direction_accuracy([1, 0, 1], [0.9, 0.2, 0.8]), 1.0)
        self.assertEqual(direction_accuracy([1, 0], [0.4, 0.6]), 0.0)

    def test_ece_perfect_and_biased(self):
        self.assertEqual(expected_calibration_error([1, 0], [1.0, 0.0], n_bins=2), 0.0)
        # y=[1,0], p=[0.9,0.1] -> 两箱各偏 0.1，权重各 1/2 -> 0.1
        self.assertAlmostEqual(
            expected_calibration_error([1, 0], [0.9, 0.1], n_bins=2), 0.1, places=6
        )

    def test_roc_auc_perfect_separation(self):
        self.assertEqual(roc_auc_score([1, 0, 1, 0], [0.9, 0.1, 0.8, 0.2]), 1.0)

    def test_roc_auc_ties_give_random(self):
        self.assertEqual(roc_auc_score([1, 0], [0.5, 0.5]), 0.5)

    def test_roc_auc_requires_both_classes(self):
        with self.assertRaises(ValueError):
            roc_auc_score([1, 1], [0.8, 0.9])

    def test_empty_and_mismatched_inputs_rejected(self):
        with self.assertRaises(ValueError):
            brier_score([], [])
        with self.assertRaises(ValueError):
            brier_score([1, 0], [0.5])


if __name__ == "__main__":
    unittest.main()
