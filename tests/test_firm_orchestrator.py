import tempfile
import unittest
from pathlib import Path

from policytown.firm_orchestrator import FirmRealityOrchestrator
from policytown.models import FirmRealityRunRequest


class FirmRealityOrchestratorTest(unittest.TestCase):
    def test_single_entrypoint_emits_all_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = FirmRealityOrchestrator().run(FirmRealityRunRequest(output_dir=tmp))
            self.assertEqual("pass", result.status)
            for path in (result.comparison_path, result.timeline_path, result.report_path, result.harness_path):
                self.assertTrue(Path(path).is_file())

    def test_timeline_can_be_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = FirmRealityOrchestrator().run(FirmRealityRunRequest(output_dir=tmp, include_timeline=False))
            self.assertIsNone(result.timeline_path)


if __name__ == "__main__":
    unittest.main()
