import unittest

from policytown.firm_gateway import FirmDecisionGateway, IntentValidationError


VALID = {
    "strategy_priority": "ai_reorganization",
    "layoff_direction": "maintain",
    "internal_transfer_direction": "expand",
    "relocation_direction": "offer",
    "outsource_direction": "moderate",
    "magnitude": "moderate",
    "reasoning_summary": "先内部转岗，再处理技能与地域门槛。",
    "worry": "传统技能和地域迁移导致转岗失败。",
}


class FirmDecisionGatewayTest(unittest.TestCase):
    def test_accepts_directional_intent(self):
        self.assertEqual("expand", FirmDecisionGateway().parse(VALID).internal_transfer_direction)

    def test_rejects_llm_headcounts_at_any_depth(self):
        payload = {**VALID, "debug": {"layoff_formal": 500}}
        with self.assertRaises(IntentValidationError):
            FirmDecisionGateway().parse(payload)

    def test_invalid_payload_falls_back_without_blocking(self):
        intent, degraded, reason = FirmDecisionGateway().parse_or_fallback("not-json")
        self.assertTrue(degraded)
        self.assertIsNotNone(reason)
        self.assertEqual("ai_reorganization", intent.strategy_priority)


if __name__ == "__main__":
    unittest.main()
