import unittest

from policytown.detectors import detect
from policytown.models import RunRequest
from policytown.orchestrator import SimulationOrchestrator
from policytown.reporting import build_report
from policytown.scenario import ScenarioCatalog
from policytown.store import FileSnapshotStore


class KernelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = ScenarioCatalog()
        cls.store = FileSnapshotStore(cls.catalog.root)
        cls.base = [cls.store.load_round(cls.catalog.get("base"), i) for i in range(1, 9)]
        cls.draft = [cls.store.load_round(cls.catalog.get("draft"), i) for i in range(1, 9)]

    def test_catalog_and_replay(self):
        self.assertEqual([], self.catalog.validate_files())
        result = SimulationOrchestrator(self.catalog, self.store).run(RunRequest(scenario_id="draft", rounds=2))
        self.assertEqual(2, len(result.snapshot_paths))

    def test_detectors_are_mechanical(self):
        ids = {item.detector_id for item in detect(self.base, self.draft)}
        self.assertIn("threshold_clustering", ids)
        self.assertIn("untargeted_hiring_contraction", ids)
        self.assertIn("hidden_exit", ids)

    def test_report_contains_closed_loop_recommendations(self):
        report = build_report("base", self.base, "draft", self.draft)
        self.assertTrue(report.recommendations)
        self.assertTrue(all(item.parameter_patch and item.validation_metric for item in report.recommendations))


if __name__ == "__main__":
    unittest.main()
