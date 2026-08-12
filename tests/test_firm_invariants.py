import unittest

from policytown.firm_reality import run_comparison
from policytown.firm_timeline import run_four_round_timeline
from policytown.invariants import validate_comparison, validate_timeline


class FirmInvariantHarnessTest(unittest.TestCase):
    def test_comparison_invariants(self):
        self.assertEqual([], validate_comparison(run_comparison()))

    def test_timeline_invariants(self):
        self.assertEqual([], validate_timeline(run_four_round_timeline()))


if __name__ == "__main__":
    unittest.main()
