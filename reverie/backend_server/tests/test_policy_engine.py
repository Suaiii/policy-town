import unittest
import json
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from policy.types import PersonaProfile, FirmLedger, PolicyState, CityMetrics

class TestTypes(unittest.TestCase):
    def test_persona_profile_roundtrip(self):
        p = PersonaProfile(name="张三", segment="A型", employer="星云科技",
                           salary=35, savings_months=6, risk_aversion=0.4,
                           family_tie="本地", job_searching=False, offer=None)
        d = p.to_dict()
        p2 = PersonaProfile.from_dict(d)
        self.assertEqual(p, p2)

    def test_firm_ledger_roundtrip(self):
        f = FirmLedger(firm="星云科技", stage="成熟期",
                       headcount={"A型": 3, "B型": 4, "C型": 2, "D型": 5},
                       salary_level={"A型": 35, "B型": 22, "C型": 18, "D型": 12},
                       profit=120, labor_cost=80,
                       skills_needed={"紧缺": 2, "一般": 1},
                       layoff_risk=0.3, recruiting=2,
                       expected_future_firing_cost=0.2)
        self.assertEqual(f, FirmLedger.from_dict(f.to_dict()))

    def test_city_metrics(self):
        m = CityMetrics(month=1, net_inflow=3, employment_rate=0.92,
                        segment_unemployment={"A型": 0.0, "B型": 0.05, "C型": 0.1, "D型": 0.2},
                        firm_gap={"星云科技": 2}, avg_salary=25, housing_index=100,
                        fiscal_spending=0.0)
        self.assertEqual(m.segment_unemployment["D型"], 0.2)

class TestPolicies(unittest.TestCase):
    def test_policy_library_has_real_world_policies(self):
        from policy.policies import POLICY_LIBRARY
        self.assertIn("housing_subsidy", POLICY_LIBRARY)
        self.assertIn("ai_talent_special", POLICY_LIBRARY)
        self.assertIn("layoff_control", POLICY_LIBRARY)
        for pid, p in POLICY_LIBRARY.items():
            self.assertTrue(p["source"], f"{pid} 缺出处")
            self.assertIn("type", p)
            self.assertIn("target_segments", p)

class TestElasticity(unittest.TestCase):
    def test_elasticity_lookup(self):
        from policy.elasticity import ElasticityTable
        et = ElasticityTable()
        val = et.effect("housing_subsidy", "A型", "跳槽意愿")
        self.assertIsInstance(val, float)
        self.assertEqual(et.effect("nonexistent", "A型", "跳槽意愿"), 0.0)
        self.assertEqual(et.effect("housing_subsidy", "X型", "跳槽意愿"), 0.0)

if __name__ == "__main__":
    unittest.main()
