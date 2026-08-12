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

class TestFirms(unittest.TestCase):
    def test_firm_decision_deterministic(self):
        from policy.firms import decide_firm_month
        from policy.types import FirmLedger
        f = FirmLedger(firm="星云科技", stage="成熟期",
                       headcount={"A型": 3, "B型": 4, "C型": 2, "D型": 5},
                       salary_level={"A型": 35, "B型": 22, "C型": 18, "D型": 12},
                       profit=120, labor_cost=80,
                       skills_needed={"紧缺": 2, "一般": 1},
                       layoff_risk=0.3, recruiting=2)
        policies = {}
        r1 = decide_firm_month(f, policies, seed=42)
        r2 = decide_firm_month(f, policies, seed=42)
        self.assertEqual(r1, r2)  # 可复现
        self.assertIn("recruiting", r1)
        self.assertIn("layoffs", r1)

    def test_regulation_reduces_hiring(self):
        from policy.firms import decide_firm_month
        from policy.types import FirmLedger
        f = FirmLedger(firm="智联软件", stage="转型期",
                       headcount={"A型": 0, "B型": 2, "C型": 1, "D型": 3},
                       salary_level={"A型": 40, "B型": 25, "C型": 20, "D型": 12},
                       profit=60, labor_cost=45,
                       skills_needed={"紧缺": 1, "一般": 1},
                       layoff_risk=0.3, recruiting=1,
                       expected_future_firing_cost=0.0)
        policies = {"layoff_control": {"params": {"enforcement": 0.8, "type": "regulation"}}}
        base = decide_firm_month(f, {}, seed=7)["recruiting"]
        reg = decide_firm_month(f, policies, seed=7)["recruiting"]
        self.assertLessEqual(reg, base)  # 监管悖论：管制越严招聘越少

class TestSettlement(unittest.TestCase):
    def test_full_month_settlement_deterministic(self):
        from policy.engine import settle_month
        profiles = [
            {"name": "张三", "segment": "A型", "employer": "星云科技", "salary": 35,
             "savings_months": 6, "risk_aversion": 0.4, "family_tie": "本地",
             "job_searching": False, "offer": None},
            {"name": "李四", "segment": "D型", "employer": None, "salary": 0,
             "savings_months": 2, "risk_aversion": 0.6, "family_tie": "外地",
             "job_searching": True, "offer": None},
        ]
        firms = [
            {"firm": "星云科技", "stage": "成熟期",
             "headcount": {"A型": 1, "B型": 0, "C型": 0, "D型": 0},
             "salary_level": {"A型": 35, "B型": 22, "C型": 18, "D型": 12},
             "profit": 100, "labor_cost": 50,
             "skills_needed": {"紧缺": 1, "一般": 0},
             "layoff_risk": 0.2, "recruiting": 1},
        ]
        policies = {}
        r1 = settle_month(1, profiles, firms, policies, seed=1)
        r2 = settle_month(1, profiles, firms, policies, seed=1)
        self.assertEqual(r1["profiles"], r2["profiles"])  # 可复现
        self.assertEqual(r1["metrics"]["month"], 1)
        self.assertEqual(r1["profiles"][0]["employer"], "星云科技")
        self.assertIn("employment_rate", r1["metrics"])

    def test_segment_unemployment_metrics(self):
        from policy.engine import settle_month
        profiles = [
            {"name": f"p{i}", "segment": "D型",
             "employer": None if i % 2 == 0 else "星河重工",
             "salary": 0 if i % 2 == 0 else 12,
             "savings_months": 3, "risk_aversion": 0.5,
             "family_tie": "本地", "job_searching": i % 2 == 0, "offer": None}
            for i in range(4)
        ]
        firms = []
        policies = {}
        r = settle_month(1, profiles, firms, policies, seed=3)
        self.assertEqual(r["metrics"]["segment_unemployment"]["D型"], 0.5)

class TestActivate(unittest.TestCase):
    def test_activate_shapes_library_entry(self):
        from policy.policies import activate
        a = activate("housing_subsidy", months_left=6)
        self.assertEqual(a["months_left"], 6)
        self.assertEqual(a["params"]["type"], "talent_cash")
        self.assertIn("A型", a["params"]["target_segments"])
        self.assertEqual(a["params"]["amount_wan"], 30)

    def test_activate_default_months_from_params(self):
        from policy.policies import activate
        a = activate("housing_subsidy")
        self.assertEqual(a["months_left"], 12)

    def test_activated_policy_drives_inflow_in_settlement(self):
        """真实路径：激活后的政策必须真的影响结算结果（回归 C1）"""
        from policy.engine import settle_month
        from policy.policies import activate
        profiles = [
            {"name": f"p{i}", "segment": "B型",
             "employer": None if i % 2 == 0 else "华芯半导体",
             "salary": 0 if i % 2 == 0 else 24,
             "savings_months": 3, "risk_aversion": 0.5,
             "family_tie": "外地", "job_searching": i % 2 == 0, "offer": None}
            for i in range(4)
        ]
        firms = []
        policies = {"housing_subsidy": activate("housing_subsidy")}
        r = settle_month(1, profiles, firms, policies, seed=1)
        # B型 housing_subsidy 外地流入系数 0.15 → 应产生流入
        self.assertGreater(r["metrics"]["net_inflow"], 0)

    def test_activated_regulation_affects_firm_hiring(self):
        from policy.engine import settle_month
        from policy.policies import activate
        firms = [{"firm": "智联软件", "stage": "转型期",
                  "headcount": {"A型": 0, "B型": 2, "C型": 1, "D型": 3},
                  "salary_level": {"A型": 40, "B型": 25, "C型": 20, "D型": 12},
                  "profit": 60, "labor_cost": 45,
                  "skills_needed": {"紧缺": 1, "一般": 1},
                  "layoff_risk": 0.3, "recruiting": 1,
                  "expected_future_firing_cost": 0.0}]
        no_policy = settle_month(1, [], [dict(f) for f in firms], {}, seed=7)["firms"]
        with_policy = settle_month(1, [], [dict(f) for f in firms],
                                   {"layoff_control": activate("layoff_control")}, seed=7)["firms"]
        self.assertLessEqual(with_policy[0]["recruiting"], no_policy[0]["recruiting"])

if __name__ == "__main__":
    unittest.main()
