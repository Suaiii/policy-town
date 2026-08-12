import unittest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from inject_agents import parse_persona, derive_segment, validate_persona

class TestParse(unittest.TestCase):
    def test_derive_segment_matrix(self):
        cases = [
            (("名校", "紧缺"), "A型"),
            (("普通", "紧缺"), "B型"),
            (("名校", "一般"), "C型"),
            (("普通", "一般"), "D型"),
        ]
        for (edu, major), seg in cases:
            self.assertEqual(derive_segment(edu, major), seg)

    def test_validate_missing_field_raises(self):
        p = {"name": "张三", "age": 28}
        with self.assertRaises(ValueError):
            validate_persona(p)

    def test_parse_yaml_persona(self):
        p = parse_persona("""
name: 李四
age: 30
education_tier: 普通
major_type: 紧缺
innate: 踏实
learned: 背景
lifestyle: 早睡早起
daily_plan_req: 上班
employer: 华芯半导体
salary: 24
savings_months: 4
risk_aversion: 0.5
family_tie: 外地
""")
        self.assertEqual(p["segment"], "B型")
        self.assertEqual(p["employer"], "华芯半导体")

class TestGen(unittest.TestCase):
    def test_gen_scratch_includes_talent_fields(self):
        from inject_agents import gen_scratch
        p = parse_persona("""
name: 李四
age: 30
education_tier: 普通
major_type: 紧缺
innate: 踏实
learned: 背景故事
lifestyle: 早睡早起
daily_plan_req: 上班
employer: 华芯半导体
salary: 24
savings_months: 4
risk_aversion: 0.5
family_tie: 外地
""")
        scratch = gen_scratch(p)
        self.assertEqual(scratch["name"], "李四")
        self.assertEqual(scratch["segment"], "B型")
        self.assertEqual(scratch["employer"], "华芯半导体")
        self.assertEqual(scratch["salary"], 24)

    def test_gen_memory_nodes(self):
        from inject_agents import gen_memory_files
        p = parse_persona("""
name: 王五
age: 25
education_tier: 名校
major_type: 一般
innate: 开朗
learned: 背景
lifestyle: 正常
daily_plan_req: 上班
employer: 恒信银行
salary: 18
savings_months: 6
risk_aversion: 0.5
family_tie: 本地
initial_memories:
  - "去年拿了年终奖"
  - "想买房"
""")
        nodes, embeddings, kw = gen_memory_files(p, seed=1)
        self.assertEqual(len(nodes), 2)
        self.assertIn("node_2", nodes)
        self.assertEqual(nodes["node_1"]["subject"], "王五")
        self.assertIn("王五", nodes["node_1"]["description"])

class TestInject(unittest.TestCase):
    def test_inject_writes_all_targets(self):
        from inject_agents import inject_all, TREE
        import tempfile, json, os
        with tempfile.TemporaryDirectory() as tmp:
            sim = os.path.join(tmp, "sim")
            os.makedirs(os.path.join(sim, "personas"))
            os.makedirs(os.path.join(sim, "environment"))
            os.makedirs(os.path.join(sim, "reverie"))
            os.makedirs(os.path.join(sim, "policy"))
            with open(os.path.join(sim, "reverie", "meta.json"), "w") as f:
                json.dump({"persona_names": [], "step": 0}, f)
            with open(os.path.join(sim, "environment", "0.json"), "w") as f:
                json.dump({}, f)
            with open(os.path.join(sim, "policy", "state.json"), "w") as f:
                json.dump({"profiles": [], "firms": [], "policies": {}, "month": 0}, f)
            p = parse_persona("""
name: 赵六
age: 26
education_tier: 普通
major_type: 一般
innate: 稳重
learned: 背景
lifestyle: 正常
daily_plan_req: 上班
employer: 星河重工
salary: 12
savings_months: 3
risk_aversion: 0.6
family_tie: 外地
""")
            firms = [{"name": "星河重工", "stage": "制造型",
                      "salary_level": {"A型": 30, "B型": 20, "C型": 15, "D型": 12},
                      "profit": 60, "labor_cost": 40,
                      "skills_needed": {"紧缺": 1, "一般": 2},
                      "layoff_risk": 0.4, "recruiting": 1}]
            inject_all([p], firms, sim, start_step=0)
            meta = json.load(open(os.path.join(sim, "reverie", "meta.json")))
            self.assertIn("赵六", meta["persona_names"])
            env = json.load(open(os.path.join(sim, "environment", "0.json")))
            self.assertIn("赵六", env)
            st = json.load(open(os.path.join(sim, "policy", "state.json")))
            self.assertEqual(st["profiles"][0]["name"], "赵六")
            self.assertEqual(st["firms"][0]["firm"], "星河重工")
            # persona 三件套存在
            pdir = os.path.join(sim, "personas", "赵六", "bootstrap_memory")
            self.assertTrue(os.path.exists(os.path.join(pdir, "scratch.json")))
            self.assertTrue(os.path.exists(os.path.join(pdir, "spatial_memory.json")))
            self.assertTrue(os.path.exists(os.path.join(pdir, "associative_memory", "nodes.json")))

    def test_inject_employer_not_in_firms_is_warning(self):
        from inject_agents import inject_all
        import tempfile, json, os
        with tempfile.TemporaryDirectory() as tmp:
            sim = os.path.join(tmp, "sim")
            os.makedirs(os.path.join(sim, "personas"))
            os.makedirs(os.path.join(sim, "environment"))
            os.makedirs(os.path.join(sim, "reverie"))
            os.makedirs(os.path.join(sim, "policy"))
            with open(os.path.join(sim, "reverie", "meta.json"), "w") as f:
                json.dump({"persona_names": [], "step": 0}, f)
            with open(os.path.join(sim, "environment", "0.json"), "w") as f:
                json.dump({}, f)
            with open(os.path.join(sim, "policy", "state.json"), "w") as f:
                json.dump({"profiles": [], "firms": [], "policies": {}, "month": 0}, f)
            p = parse_persona("""
name: 集成测试
age: 29
education_tier: 普通
major_type: 紧缺
innate: 坚韧
learned: 背景
lifestyle: 正常
daily_plan_req: 上班
employer: 华芯半导体
salary: 24
savings_months: 8
risk_aversion: 0.6
family_tie: 外地
""")
            firms = [{"name": "星云科技", "stage": "成熟期"}]
            result = inject_all([p], firms, sim, start_step=0)
            self.assertEqual(result["personas"], 1)
            st = json.load(open(os.path.join(sim, "policy", "state.json")))
            self.assertEqual(st["profiles"][0]["employer"], "华芯半导体")

if __name__ == "__main__":
    unittest.main()
