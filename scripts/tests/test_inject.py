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

if __name__ == "__main__":
    unittest.main()
