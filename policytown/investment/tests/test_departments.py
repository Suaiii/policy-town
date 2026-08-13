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
        memos = view["department_memoranda"]
        self.assertEqual(len(memos), 1 + 2 * 3, "财政全局1份 + 三部门×2企业")
        for memo in memos:
            validate_memorandum(memo)
            self.assertIn("财政", deterministic.DEPARTMENT_LABELS["fiscal"])

    def test_fiscal_is_global(self):
        view = _open_view(["proto_a"])
        memos = [m for m in view["department_memoranda"] if m["agent"] == "fiscal"]
        self.assertEqual(len(memos), 1)
        self.assertIsNone(memos[0]["company_id"])

    def test_recommendation_mapping(self):
        self.assertEqual(deterministic._recommendation("positive"), "support")
        self.assertEqual(deterministic._recommendation("neutral"), "conditional_support")
        self.assertEqual(deterministic._recommendation("negative"), "oppose")
        self.assertEqual(deterministic._recommendation("negative", missing_count=2), "hold")


# ---------- Task 4：部门 LLM 路径输出备忘录契约 ----------


class _CapturingLlm:
    def __init__(self) -> None:
        self.prompts: list = []

    def __call__(self, prompt: str, validator=None) -> dict:
        self.prompts.append(prompt)
        return {
            "agent": "fiscal", "department": "财政部门", "company_id": None,
            "recommendation": "support", "direction": "positive",
            "score": 70, "confidence": 0.8,
            "core_claims": [{"claim_id": "F-1", "claim_type": "positive",
                             "statement": "财政余量充足", "evidence_ids": []}],
            "red_lines": [{"redline_id": "F-R1", "condition": "不超预算", "reason": "守恒"}],
            "acceptable_conditions": [{"condition_id": "F-C1", "condition": "分期",
                                       "reason": "控节奏"}],
            "missing_info": [], "key_factors": [], "evidence_ids": [],
            "reasoning_summary": "测试",
        }


class TestMemorandumPrompt(unittest.TestCase):
    def test_prompt_contains_memorandum_contract(self):
        from ..agents.professional import make_professional_agents
        llm = _CapturingLlm()
        agents = make_professional_agents(llm)
        from ..core.context import build_context
        from ..core.state import WorldState, CityState, CompanyState, MarketConditions
        from ..core.message import Inbox
        comp = CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                            metrics={"financial_health": 50, "execution_ability": 60,
                                     "technology_readiness": 55, "customer_order_strength": 50,
                                     "construction_progress": 10, "production_ramp": 0,
                                     "project_cashflow": -10, "capital_intensity": 50},
                            cash_points=20, debt_points=10)
        state = WorldState(run_id="t", seed=1, stage_id="S1", cutoff_at="2008-09-30",
                           round_index=0, city=CityState(),
                           market={"display": MarketConditions()},
                           companies={"company_a": comp})
        ctx = build_context(state, Inbox(), [])
        from ..agents.professional import run_assessments
        run_assessments(agents, ctx)
        self.assertTrue(llm.prompts, "部门 Agent 必须触发 LLM")
        blob = "\n".join(llm.prompts)
        for token in ("recommendation", "red_lines", "acceptable_conditions",
                      "missing_info", "core_claims"):
            self.assertIn(token, blob, "部门 Prompt 必须包含备忘录契约字段 %s" % token)


# ---------- Task 5：编排器视图接线 ----------


class TestOrchestratorView(unittest.TestCase):
    def test_open_stage_has_memoranda_for_every_company(self):
        view = _open_view(["proto_a", "proto_d", "proto_b"])
        memos = view["department_memoranda"]
        self.assertIn("department_memoranda", view)
        self.assertNotIn("agent_assessments", view)
        by_agent = {}
        for memo in memos:
            by_agent.setdefault(memo["agent"], []).append(memo)
        self.assertEqual(set(by_agent), {"fiscal", "economy", "sci_tech", "development"})
        self.assertEqual(len(by_agent["fiscal"]), 1)
        for kind in ("economy", "sci_tech", "development"):
            self.assertEqual({m["company_id"] for m in by_agent[kind]},
                             {"company_a", "company_d", "company_b"})

    def test_memoranda_deterministic(self):
        v1 = _open_view(["proto_a", "proto_d", "proto_b"])
        v2 = _open_view(["proto_a", "proto_d", "proto_b"])
        self.assertEqual(json.dumps(v1["department_memoranda"], sort_keys=True),
                         json.dumps(v2["department_memoranda"], sort_keys=True))


# ---------- Task 5 跟进：身份以任务为准 ----------


class TestIdentityStamping(unittest.TestCase):
    def test_identity_stamped_regardless_of_llm_output(self):
        from ..agents.professional import make_professional_agents, run_assessments
        from ..core.context import build_context
        from ..core.state import WorldState, CityState, CompanyState, MarketConditions
        from ..core.message import Inbox

        class _BogusLlm:
            def __init__(self) -> None:
                self.calls = 0

            def __call__(self, prompt: str, validator=None) -> dict:
                self.calls += 1
                return {
                    "agent": "tech_dept", "department": "自定义部门",
                    "company_id": "company_z", "recommendation": "support",
                    "direction": "positive", "score": 60, "confidence": 0.7,
                    "core_claims": [], "red_lines": [], "acceptable_conditions": [],
                    "missing_info": [], "key_factors": [], "evidence_ids": [],
                    "reasoning_summary": "测试",
                }

        comp_a = CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                              metrics={"financial_health": 50, "execution_ability": 60,
                                       "technology_readiness": 55, "customer_order_strength": 50,
                                       "construction_progress": 10, "production_ramp": 0,
                                       "project_cashflow": -10, "capital_intensity": 50},
                              cash_points=20, debt_points=10)
        comp_d = CompanyState(company_id="company_d", anon_label="企业D", industry="pv",
                              metrics={"financial_health": 50, "execution_ability": 60,
                                       "technology_readiness": 55, "customer_order_strength": 50,
                                       "construction_progress": 10, "production_ramp": 0,
                                       "project_cashflow": -10, "capital_intensity": 50},
                              cash_points=20, debt_points=10)
        state = WorldState(run_id="t", seed=1, stage_id="S1", cutoff_at="2008-09-30",
                           round_index=0, city=CityState(),
                           market={"display": MarketConditions(), "pv": MarketConditions()},
                           companies={"company_a": comp_a, "company_d": comp_d})
        ctx = build_context(state, Inbox(), [])
        llm = _BogusLlm()
        memos = run_assessments(make_professional_agents(llm), ctx)
        # 7 = 财政全局1 + 三部门×2企业；身份全部由任务盖戳
        self.assertEqual(len(memos), 1 + 2 * 3)
        for memo in memos:
            self.assertIn(memo["agent"], ("fiscal", "economy", "sci_tech", "development"))
            self.assertIn("部门", memo["department"])
        fiscal = [m for m in memos if m["agent"] == "fiscal"]
        self.assertEqual(len(fiscal), 1)
        self.assertIsNone(fiscal[0]["company_id"])
        self.assertEqual({m["company_id"] for m in memos}, {None, "company_a", "company_d"})
        # 身份错乱的 LLM 输出必须被校验器拒绝 → 每任务 初始尝试 + 1 次重试 均被拒
        # → 走确定性 fallback（confidence=0），身份仍由任务盖戳
        self.assertEqual(llm.calls, 2 * (1 + 2 * 3))
        self.assertTrue(all(m["confidence"] == 0.0 for m in memos))


if __name__ == "__main__":
    unittest.main()
