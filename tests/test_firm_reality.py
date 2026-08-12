import json
import tempfile
import unittest
from pathlib import Path

from policytown.firm_reality import FirmIntent, RuleLedger, SCENARIOS, default_profile, run_comparison
from policytown.reality_detectors import detect_firm_reality


class FirmRealityHarnessTest(unittest.TestCase):
    def test_llm_intent_schema_has_no_headcount_fields(self):
        forbidden = {"layoff_formal", "internal_transfer_accepted", "channel_outsource", "net_unemployment"}
        self.assertFalse(forbidden & set(FirmIntent.model_fields))

    def test_rule_ledger_reconciles_every_scenario(self):
        profile = default_profile()
        for spec in SCENARIOS:
            result = RuleLedger().settle(profile, spec)
            self.assertEqual(profile.affected_workers, result.internal_transfer_accepted + result.channel_outsource + result.government_bridged + result.layoff_formal)

    def test_counterfactuals_reduce_net_unemployment(self):
        traces = run_comparison()
        values = [x.settlement.net_unemployment for x in traces]
        self.assertEqual(values, sorted(values, reverse=True))
        self.assertGreater(values[0], values[-1])

    def test_reality_detectors_explain_transfer_failure(self):
        ids = {x.detector_id for x in detect_firm_reality(run_comparison())}
        self.assertIn("internal_transfer_failure", ids)
        self.assertIn("tool_disease_mismatch", ids)
        self.assertIn("policy_timing_gap", ids)
        self.assertNotIn("counterfactual_order_violation", ids)

    def test_harness_writes_replayable_trace(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "trace.json"
            run_comparison(target)
            payload = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(["A0", "A1", "A2", "A3"], [x["settlement"]["scenario_id"] for x in payload])
            self.assertTrue(all(x["settlement"]["evidence_chain"] for x in payload))

    def test_a3_exposes_policy_timing_gap(self):
        a3 = run_comparison()[-1].settlement
        self.assertGreater(a3.workers_waiting_for_training, 0)
        self.assertGreater(a3.workers_without_savings_buffer, 0)
        self.assertGreater(a3.timing_gap_months, 0)


if __name__ == "__main__":
    unittest.main()
