import unittest

from policytown.case_registry import load_case_package
from policytown.firm_reality import run_comparison
from policytown.firm_reporting import build_firm_reality_report


class FirmRealityReportTest(unittest.TestCase):
    def test_case_package_cross_references(self):
        case = load_case_package("data/real_world/cases/tencent_docs_2026")
        self.assertEqual(4, len(case.facts))
        self.assertEqual(3, len(case.mechanisms))

    def test_report_has_judge_facing_experimental_logic(self):
        report = build_firm_reality_report(load_case_package("data/real_world/cases/tencent_docs_2026"), run_comparison())
        self.assertEqual(7, len(report.judge_questions))
        self.assertEqual(3, len(report.results))
        self.assertTrue(report.experiment_purpose and report.comparison_method)
        self.assertTrue(all(item.validation_metric for item in report.policy_patches))

    def test_a3_has_largest_improvement(self):
        report = build_firm_reality_report(load_case_package("data/real_world/cases/tencent_docs_2026"), run_comparison())
        self.assertEqual("A3", min(report.results, key=lambda x: x.candidate_value).candidate)


if __name__ == "__main__":
    unittest.main()
