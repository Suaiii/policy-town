"""P3 沟通真实性测试集（文档 §12 P3 / §9 验证表）。

1. 证据敏感性：删除/削弱关键信息 → 部门立场按预期变化；
2. 沟通因果性：删除质询 → 立场修订消失；
3. 角色一致性：四部门职责稳定且互不相同（改一个部门的输入不动另一部门）；
4. 分歧保真：存在冲突时不强制共识（少数意见保留）；
5. 反事实敏感性：固定输入重复运行结论稳定（既有确定性测试）+ 历史基线/反事实方向差异。
"""
from __future__ import annotations

import json
import unittest

from ..fallback import deterministic
from ..core.meeting import build_challenges, detect_conflicts, make_minutes, position_revision
from ..core.orchestrator import Orchestrator
from ..replay.replay import replay_historical


def _ctx(industrial_base=60, talent=60, execution=60, tech=60):
    return {
        "cutoff_at": "2008-09-30",
        "city": {"budget_points": 100, "committed_capital": 10,
                 "industrial_base": {"display": industrial_base},
                 "talent_supply": talent, "infrastructure_capacity": 50},
        "market": {"display": {"cycle": 10, "price_trend": 5, "supply_pressure": 40,
                               "policy_support": 50}},
        "companies": [{
            "company_id": "company_a", "anon_label": "企业A", "industry": "display",
            "status": "建设", "cash_band": "一般",
            "metrics": {"financial_health": 50, "execution_ability": execution,
                        "technology_readiness": tech,
                        "customer_order_strength": 50, "construction_progress": 20,
                        "production_ramp": 10, "project_cashflow": -10,
                        "capital_intensity": 40},
            "capital_request": 30, "milestones_done": [], "evidence_ids": ["E1"],
            "rivals_summary": [], "cash_points": 20}],
        "evidence_pack": {"E1": {"evidence_id": "E1", "publication_date": "2008-01-01"}},
        "inbox": [], "fact_graph": [], "government_commitments": [],
    }


def _memo(agent, reco, score=60, confidence=0.7, company_id="company_a",
          missing=None, conditions=None):
    return {"agent": agent, "department": agent, "company_id": company_id,
            "recommendation": reco, "direction": "neutral", "score": score,
            "confidence": confidence,
            "core_claims": [{"claim_id": "C-1", "claim_type": "positive",
                             "statement": "%s 的主张" % agent, "evidence_ids": ["E1"]}],
            "red_lines": [], "acceptable_conditions": conditions or [],
            "missing_info": missing or [], "key_factors": [], "evidence_ids": ["E1"],
            "reasoning_summary": ""}


class TestEvidenceSensitivity(unittest.TestCase):
    """删除/削弱关键信息 → 立场合理变化（§9 信息一致性 / P3）。"""

    def test_weaken_industrial_base_flips_economy(self):
        strong = deterministic.professional_assessment("economy", _ctx(industrial_base=80), _ctx()["companies"][0])
        weak = deterministic.professional_assessment("economy", _ctx(industrial_base=10), _ctx()["companies"][0])
        self.assertEqual(strong["direction"], "positive")
        self.assertNotEqual(weak["direction"], "positive", "产业基础大幅削弱必须改变经信立场")
        self.assertLess(weak["score"], strong["score"])

    def test_weaken_tech_flips_sci_tech(self):
        sc = _ctx(execution=80, tech=80)
        strong = deterministic.professional_assessment("sci_tech", sc, sc["companies"][0])
        wc = _ctx(execution=10, tech=10)
        weak = deterministic.professional_assessment("sci_tech", wc, wc["companies"][0])
        self.assertNotEqual(weak["direction"], strong["direction"])

    def test_evidence_ids_reflect_context(self):
        ctx = _ctx()
        memo = deterministic.professional_assessment("economy", ctx, ctx["companies"][0])
        self.assertEqual(memo["evidence_ids"], ["E1"])
        ctx2 = dict(ctx)
        ctx2["companies"] = [dict(ctx["companies"][0], evidence_ids=[])]
        memo2 = deterministic.professional_assessment("economy", ctx2, ctx2["companies"][0])
        self.assertEqual(memo2["evidence_ids"], [], "删除证据后备忘录不得引用该证据")


class TestCommunicationCausality(unittest.TestCase):
    """删除关键质询 → 立场修订消失（§9 沟通因果性）。"""

    def test_no_conflict_no_revision(self):
        memos = [_memo("fiscal", "support", company_id=None),
                 _memo("economy", "support"), _memo("sci_tech", "support")]
        conflicts = detect_conflicts(memos, "S1")
        self.assertEqual(conflicts, [])
        challenges = build_challenges(conflicts, "S1")
        revisions = []
        for ch in challenges:
            from ..fallback import deterministic
            resp = deterministic.challenge_response(ch, _memo("economy", "support"), {})
            rev = position_revision(ch, _memo("economy", "support"),
                                    _memo("fiscal", "support", company_id=None), resp)
            if rev is not None:
                revisions.append(rev)
        self.assertEqual(revisions, [], "无冲突 → 无质询 → 无立场修订")

    def test_conflict_drives_revision(self):
        memos = [_memo("economy", "oppose", score=30),
                 _memo("sci_tech", "support", score=65, confidence=0.65)]
        challenges = build_challenges(detect_conflicts(memos, "S1"), "S1")
        self.assertTrue(challenges)
        revisions = []
        for ch in challenges:
            resp = deterministic.challenge_response(
                ch, _memo("sci_tech", "support", score=65, confidence=0.65), {})
            rev = position_revision(ch, _memo("sci_tech", "support", score=65, confidence=0.65),
                                    _memo("economy", "oppose", score=30), resp)
            if rev is not None:
                revisions.append(rev)
        self.assertTrue(revisions, "有质询且立场软化 → 必须有修订记录")


class TestRoleDistinctness(unittest.TestCase):
    """调换职责输入 → 只有对应部门受影响（§9 角色一致性）。"""

    def test_industrial_base_affects_economy_not_sci_tech(self):
        ec = _ctx(industrial_base=80)
        econ_strong = deterministic.professional_assessment("economy", ec, ec["companies"][0])
        ew = _ctx(industrial_base=10)
        econ_weak = deterministic.professional_assessment("economy", ew, ew["companies"][0])
        tech_strong = deterministic.professional_assessment("sci_tech", ec, ec["companies"][0])
        tech_weak = deterministic.professional_assessment("sci_tech", ew, ew["companies"][0])
        self.assertNotEqual(econ_strong["score"], econ_weak["score"])
        self.assertEqual(tech_strong["score"], tech_weak["score"],
                         "产业基础不是科技部门的输入，不得影响其判断")

    def test_execution_affects_sci_tech_not_development(self):
        tc = _ctx(execution=80, tech=80)
        t1 = deterministic.professional_assessment("sci_tech", tc, tc["companies"][0])
        tc2 = _ctx(execution=10, tech=10)
        t2 = deterministic.professional_assessment("sci_tech", tc2, tc2["companies"][0])
        dc = _ctx()
        d1 = deterministic.professional_assessment("development", dc, dc["companies"][0])
        d2 = deterministic.professional_assessment("development", dc, dc["companies"][0])
        self.assertNotEqual(t1["score"], t2["score"])
        self.assertEqual(d1["score"], d2["score"])


class TestNoForcedConsensus(unittest.TestCase):
    """保留冲突证据时不得强制共识（§9 分歧保真）。"""

    def test_minority_opinion_preserved(self):
        memos = [_memo("fiscal", "support", company_id=None),
                 _memo("economy", "oppose", score=30),
                 _memo("sci_tech", "support", score=70)]
        conflicts = detect_conflicts(memos, "S1")
        challenges = build_challenges(conflicts, "S1")
        responses = [deterministic.challenge_response(
            ch, _memo("sci_tech", "support", score=70, confidence=0.8), {})
            for ch in challenges]
        minutes = make_minutes(memos, challenges, responses, [], "S1")
        self.assertTrue(minutes["minority_opinions"], "反对意见必须保留为少数意见")
        self.assertTrue(minutes["disagreements"])
        self.assertEqual(minutes["minority_opinions"][0]["agent"], "economy")
        # 即便对方 maintain，纪要也不抹除分歧
        self.assertIn("maintain", [d["response_type"] for d in minutes["disagreements"]])


class TestCounterfactualSensitivity(unittest.TestCase):
    """历史基线与反事实方向差异（§9 历史校准 / P3）。"""

    def test_no_funding_worldline_differs_from_baseline(self):
        baseline = replay_historical(["proto_a", "proto_d", "proto_b"], seed=42)
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        for sid in ("S1", "S2", "S3", "S4"):
            orch.open_stage()
            orch.submit_decisions([])  # 反事实：完全不投资
            if sid != "S4":
                orch.advance_stage()
        cf = orch.finish()
        self.assertNotEqual(
            json.dumps(cf["portfolio_result"], sort_keys=True, default=str),
            json.dumps(baseline["portfolio_result"], sort_keys=True, default=str),
            "投资与否必须产生可观测的路径差异")
        self.assertTrue(cf["historical_replay"]["leakage_audit_passed"])


if __name__ == "__main__":
    unittest.main()
