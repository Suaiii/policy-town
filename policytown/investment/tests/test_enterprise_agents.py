"""企业Agent 阶段化Context注入测试。

核心不变量：
1. 第一阶段（enter_stage）只有 system_prompt，不注入任何阶段Context；
2. 进入后续阶段才注入该阶段 stage_contexts，且不得出现未来阶段的Context；
3. 每个注入项 as_of <= 该阶段 cutoff_at（数据层 + runtime 二次过滤）；
4. 真实企业名只存在于企业Agent私有 prompt，公开Context保持匿名。
"""
from __future__ import annotations

import json
import os
import unittest

from ..agents.company import CompanyAgent
from ..core.orchestrator import Orchestrator

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "data", "hefei_mvp")
STAGES = {s["stage_id"]: s for s in
          json.load(open(os.path.join(DATA_DIR, "stages.json"), encoding="utf-8"))["stages"]}
ENTERPRISES = json.load(open(os.path.join(DATA_DIR, "enterprise_agents.json"),
                             encoding="utf-8"))["enterprises"]
_ORDER = ("S1", "S2", "S3", "S4")

REAL_NAMES = ("京东方", "长鑫", "赛维", "熔安", "熔盛", "未名", "鑫昊", "合肥智聚")


class _CapturingLlm:
    def __init__(self) -> None:
        self.prompts: list = []

    def __call__(self, prompt: str) -> dict:
        self.prompts.append(prompt)
        return {"company_id": "company_x", "action": "wait",
                "capital_request_next_round": 0.0,
                "resource_allocation": {"construction": 0.2, "research": 0.2,
                                        "market": 0.2, "cash_buffer": 0.4},
                "milestone_target": "construction_done", "risk_response": "observe",
                "competition_response": "wait", "evidence_ids": [], "confidence": 0.5}


def _mini_ctx(cutoff: str) -> dict:
    return {"cutoff_at": cutoff, "market": {}, "city": {}, "companies": [],
            "evidence_pack": {}}


def _all_context_texts(enterprise: dict, stage_id: str) -> list:
    return [c["text"] for c in enterprise.get("stage_contexts", {}).get(stage_id, [])]


def _prompt_for(enterprise: dict, stage_id: str, llm: _CapturingLlm) -> str:
    agent = CompanyAgent("company_x", enterprise=enterprise, llm_fn=llm)
    cutoff = STAGES[stage_id]["cutoff_at"]
    company_view = {"company_id": "company_x", "anon_label": "企业X",
                    "industry": enterprise["industry"], "status": "建设",
                    "metrics": {"financial_health": 50, "execution_ability": 50,
                                "technology_readiness": 50, "customer_order_strength": 50,
                                "construction_progress": 20, "production_ramp": 0,
                                "project_cashflow": -10, "capital_intensity": 40},
                    "cash_band": "一般", "capital_request": 30,
                    "milestones_done": [], "evidence_ids": []}
    agent.plan(company_view, _mini_ctx(cutoff), 0.0, stage_id)
    assert llm.prompts, "plan() 必须触发 LLM（capturing）"
    return llm.prompts[-1]


class TestEnterpriseAgentData(unittest.TestCase):
    def test_six_enterprises_defined(self):
        self.assertEqual(len(ENTERPRISES), 6)
        with open(os.path.join(DATA_DIR, "prototypes.json"), encoding="utf-8") as f:
            prototypes = {p["prototype_id"] for p in json.load(f)["prototypes"]}
        seen = set()
        for e in ENTERPRISES:
            self.assertIn(e["prototype_id"], prototypes, e["name"])
            self.assertIn(e["enter_stage"], _ORDER, e["name"])
            self.assertTrue(e["system_prompt"].strip(), e["name"])
            self.assertIn(e["industry"], ("display", "semiconductor", "equipment",
                                          "pv", "heavy", "biotech"), e["name"])
            seen.add(e["prototype_id"])
        self.assertEqual(seen, prototypes, "六个原型必须各有企业档案")

    def test_stage_context_as_of_within_cutoff(self):
        for e in ENTERPRISES:
            for stage_id, items in e.get("stage_contexts", {}).items():
                cutoff = STAGES[stage_id]["cutoff_at"]
                for c in items:
                    self.assertLessEqual(
                        c["as_of"], cutoff,
                        "%s %s 注入项 %s 晚于阶段截止日" % (e["name"], stage_id, c["context_id"]))
                    self.assertTrue(c["text"].strip())

    def test_enter_stage_has_no_context(self):
        for e in ENTERPRISES:
            self.assertEqual(e.get("stage_contexts", {}).get(e["enter_stage"], []),
                             [], "%s 第一阶段不应有阶段Context" % e["name"])

    def test_candidate_pool_matches_enter_stages(self):
        for s in STAGES.values():
            pool = s.get("candidate_pool", [])
            self.assertTrue(pool, "%s 缺少 candidate_pool" % s["stage_id"])
            for e in ENTERPRISES:
                entered = _ORDER.index(e["enter_stage"]) <= _ORDER.index(s["stage_id"])
                if entered:
                    self.assertIn(e["prototype_id"], pool,
                                  "%s 应出现在 %s 候选池" % (e["name"], s["stage_id"]))


class TestPhasedPrompt(unittest.TestCase):
    def test_phase1_prompt_only_system(self):
        for e in ENTERPRISES:
            llm = _CapturingLlm()
            prompt = _prompt_for(e, e["enter_stage"], llm)
            self.assertIn("【企业身份】", prompt, "%s 必须注入 system_prompt" % e["name"])
            for stage_id, items in e.get("stage_contexts", {}).items():
                for c in items:
                    self.assertNotIn(c["text"], prompt,
                                     "%s 第一阶段泄漏了 %s 的Context" % (e["name"], c["context_id"]))

    def test_later_stage_injects_context(self):
        for e in ENTERPRISES:
            start = _ORDER.index(e["enter_stage"])
            for idx in range(start + 1, len(_ORDER)):
                stage_id = _ORDER[idx]
                items = _all_context_texts(e, stage_id)
                if not items:
                    continue
                llm = _CapturingLlm()
                prompt = _prompt_for(e, stage_id, llm)
                for text in items:
                    self.assertIn(text, prompt,
                                  "%s %s 未注入 %s" % (e["name"], stage_id, text[:12]))

    def test_no_future_stage_leak(self):
        for e in ENTERPRISES:
            for stage_id in _ORDER:
                llm = _CapturingLlm()
                prompt = _prompt_for(e, stage_id, llm)
                cur = _ORDER.index(stage_id)
                for future in _ORDER[cur + 1:]:
                    for text in _all_context_texts(e, future):
                        self.assertNotIn(text, prompt,
                                         "%s %s 泄漏了未来阶段 %s 的Context"
                                         % (e["name"], stage_id, future))

    def test_runtime_cutoff_filter(self):
        e = dict(ENTERPRISES[0])
        late = {"context_id": "LATE", "as_of": "2099-01-01", "label": "未来",
                "text": "这是晚于截止日的未来信息"}
        e["stage_contexts"] = {"S2": [late]}
        llm = _CapturingLlm()
        prompt = _prompt_for(e, "S2", llm)
        self.assertNotIn("这是晚于截止日的未来信息", prompt,
                         "runtime 必须过滤掉晚于阶段截止日的注入项")

    def test_public_context_anonymized(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        view = orch.open_stage()
        blob = json.dumps(view["context"], ensure_ascii=False)
        for token in REAL_NAMES:
            self.assertNotIn(token, blob, "公开Context泄漏真实企业名：%s" % token)


class TestDecisionBaseline(unittest.TestCase):
    """决策底色 = 固定身份配置，不属于动态 Memory（文档 5.4）。"""

    def test_baseline_defined_for_all(self):
        for e in ENTERPRISES:
            bl = e.get("decision_baseline")
            self.assertTrue(bl and bl.get("management_objectives"), e["name"])
            self.assertTrue(0.0 <= bl["expansion_appetite"] <= 1.0, e["name"])
            self.assertTrue(0.0 <= bl["risk_preference"] <= 1.0, e["name"])
            self.assertIn(bl["negotiation_stance"],
                          ("cooperative", "guarded", "aggressive"), e["name"])
            self.assertTrue(bl["financing_constraints"], e["name"])


if __name__ == "__main__":
    unittest.main()
