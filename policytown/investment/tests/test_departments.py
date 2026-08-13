"""四部门契约测试（产品文档 4.4 / 5.1）。

部门固定为：财政 fiscal / 经信 economy / 科技 sci_tech / 发改 development。
"""
from __future__ import annotations

import unittest

from ..agents.professional import KINDS, _ROLE_NAMES


from ..agents.professional import validate_memorandum


class TestDepartmentIdentity(unittest.TestCase):
    def test_four_departments_named(self):
        self.assertEqual(KINDS, ("fiscal", "economy", "sci_tech", "development"))
        self.assertEqual(set(_ROLE_NAMES), set(KINDS))
        self.assertIn("财政", _ROLE_NAMES["fiscal"])
        self.assertIn("经信", _ROLE_NAMES["economy"])
        self.assertIn("科技", _ROLE_NAMES["sci_tech"])
        self.assertIn("发改", _ROLE_NAMES["development"])


class TestMemorandumValidator(unittest.TestCase):
    def test_valid_memorandum_passes(self):
        memo = {
            "agent": "economy", "department": "经信部门", "company_id": "company_a",
            "recommendation": "conditional_support", "direction": "neutral",
            "score": 62, "confidence": 0.7,
            "core_claims": [{"claim_id": "EC-1", "claim_type": "positive",
                             "statement": "本地产业基础可承接", "evidence_ids": ["E1"]}],
            "red_lines": [{"redline_id": "EC-R1", "condition": "出资不超40%", "reason": "防锁定"}],
            "acceptable_conditions": [{"condition_id": "EC-C1", "condition": "分期拨付",
                                       "reason": "控节奏"}],
            "missing_info": [{"info_id": "EC-M1", "severity": "medium",
                              "description": "供应链测算缺失", "impact": "协同高估"}],
            "key_factors": [{"metric_id": "industrial_base", "effect": "positive"}],
            "evidence_ids": ["E1"], "reasoning_summary": "一句话理由",
        }
        validate_memorandum(memo)  # 不抛异常即通过

    def test_bad_recommendation_rejected(self):
        from ..agents.professional import _memorandum_fixture
        memo = _memorandum_fixture()
        memo["recommendation"] = "maybe"
        with self.assertRaises(ValueError):
            validate_memorandum(memo)

    def test_bad_claim_type_rejected(self):
        from ..agents.professional import _memorandum_fixture
        memo = _memorandum_fixture()
        memo["core_claims"][0]["claim_type"] = "nonsense"
        with self.assertRaises(ValueError):
            validate_memorandum(memo)

    def test_red_line_without_condition_rejected(self):
        from ..agents.professional import _memorandum_fixture
        memo = _memorandum_fixture()
        memo["red_lines"][0].pop("condition")
        with self.assertRaises(ValueError):
            validate_memorandum(memo)


# ---------- Task 3：确定性 fallback 产出完整部门备忘录 ----------

import json
import os

from ..core.orchestrator import Orchestrator
from ..fallback import deterministic


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "data", "hefei_mvp")
STAGES = {s["stage_id"]: s for s in
          json.load(open(os.path.join(DATA_DIR, "stages.json"), encoding="utf-8"))["stages"]}


def _open_view(company_ids):
    orch = Orchestrator(seed=42)
    orch.start(company_ids, "S1")
    return orch.open_stage()


class TestMemorandumFallback(unittest.TestCase):
    def test_fallback_emits_full_memorandum(self):
        view = _open_view(["proto_a", "proto_d"])
        memos = view["agent_assessments"]
        self.assertEqual(len(memos), 1 + 2 * 3, "财政全局1份 + 三部门×2企业")
        for memo in memos:
            validate_memorandum(memo)
            self.assertIn("财政", deterministic.DEPARTMENT_LABELS["fiscal"])

    def test_fiscal_is_global(self):
        view = _open_view(["proto_a"])
        memos = [m for m in view["agent_assessments"] if m["agent"] == "fiscal"]
        self.assertEqual(len(memos), 1)
        self.assertIsNone(memos[0]["company_id"])

    def test_recommendation_mapping(self):
        self.assertEqual(deterministic._recommendation("positive"), "support")
        self.assertEqual(deterministic._recommendation("neutral"), "conditional_support")
        self.assertEqual(deterministic._recommendation("negative"), "oppose")
        self.assertEqual(deterministic._recommendation("negative", missing_count=2), "hold")


if __name__ == "__main__":
    unittest.main()
