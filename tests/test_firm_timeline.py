import tempfile
import unittest
from pathlib import Path

from policytown.evidence import validate_evidence_package
from policytown.firm_timeline import BeliefStore, FirmTimelineEngine, FirmTimelineState, run_four_round_timeline


class FirmTimelineHarnessTest(unittest.TestCase):
    def test_evidence_package_is_complete_and_safe(self):
        self.assertEqual([], validate_evidence_package("data/real_world/cases/tencent_docs_2026"))

    def test_belief_store_has_exactly_six_decision_beliefs(self):
        self.assertEqual(6, len(BeliefStore.initial().beliefs))

    def test_four_round_timeline_is_replayable(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "timeline.json"
            traces = run_four_round_timeline(output)
            self.assertEqual([1, 2, 3, 4], [x.round for x in traces])
            self.assertTrue(output.is_file())
            self.assertTrue(all(len(x.belief_snapshot) == 6 for x in traces))

    def test_tools_change_boundaries_not_strategy(self):
        traces = run_four_round_timeline()
        self.assertEqual(1, len({x.intent.strategy_priority for x in traces}))
        self.assertGreater(traces[0].settlement["net_unemployment"], traces[-1].settlement["net_unemployment"])

    def test_timeline_can_resume_from_serialized_state(self):
        engine = FirmTimelineEngine()
        state = engine.advance(engine.advance(engine.initial_state()))
        restored = FirmTimelineState.model_validate_json(state.model_dump_json())
        restored = engine.advance(engine.advance(restored))
        self.assertEqual(4, restored.last_completed_round)
        self.assertEqual([1, 2, 3, 4], [item.round for item in restored.traces])


if __name__ == "__main__":
    unittest.main()
