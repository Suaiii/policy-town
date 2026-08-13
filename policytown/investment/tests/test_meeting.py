"""部门通信契约测试：冲突识别 / 定向质询 / 立场修订 / 会议纪要（产品文档 4.5 / 5.5）。

铁律：
1. 冲突识别是纯函数：同 memoranda → 同冲突（确定性）；
2. 每对部门只保留最高优先级冲突；每企业每轮最多 2 个冲突；
3. 冲突/质询/回应/修订/纪要均为只读记录，不修改任何数值。
"""
from __future__ import annotations

import unittest

from ..core.meeting import (_KIND_RANK, _MAX_PER_COMPANY, REC_LADDER,
                            _grouped, detect_conflicts, find_memorandum,
                            validate_challenge)


def _memo(agent, reco, score=60, confidence=0.7, claims=None, red_lines=None,
          conditions=None, missing=None, company_id="company_a", evidence=None):
    """evidence=None → 默认 ["E1"]；evidence=[] → 明确无证据（None/空列表语义区分）。"""
    ev = ["E1"] if evidence is None else evidence
    return {
        "agent": agent, "department": {"fiscal": "财政部门", "economy": "经信部门",
                                       "sci_tech": "科技部门", "development": "发改部门"}[agent],
        "company_id": company_id, "recommendation": reco, "direction": "neutral",
        "score": score, "confidence": confidence,
        "core_claims": claims or [{"claim_id": "C-1", "claim_type": "positive",
                                   "statement": "%s 的主张" % agent, "evidence_ids": ["E1"]}],
        "red_lines": red_lines or [{"redline_id": "R-1", "condition": "红线",
                                    "reason": "原因"}],
        "acceptable_conditions": conditions or [{"condition_id": "C-1", "condition": "条件",
                                                 "reason": "原因"}],
        "missing_info": missing or [], "key_factors": [], "evidence_ids": ev,
        "reasoning_summary": "理由",
    }


class TestConflictDetection(unittest.TestCase):
    def test_recommendation_gap_conflict(self):
        memos = [_memo("economy", "oppose", score=30),
                 _memo("sci_tech", "support", score=70)]
        conflicts = detect_conflicts(memos, "S1")
        self.assertEqual(len(conflicts), 1)
        c = conflicts[0]
        self.assertEqual(c["kind"], "recommendation_gap")
        self.assertEqual(c["from"], "economy")    # 更不支持的部门发起
        self.assertEqual(c["to"], "sci_tech")     # 更支持的部门被质询
        self.assertEqual(c["severity"], "high")
        self.assertEqual(c["stage_id"], "S1")
        self.assertTrue(c["question"].strip())
        self.assertTrue(c["conflict_id"].startswith("CF-S1-"))
        validate_challenge(dict(c, challenge_id="CH-S1-01", status="pending"))  # 不抛异常即通过

    def test_conflicts_deterministic(self):
        import json
        memos = [_memo("economy", "oppose", score=30),
                 _memo("sci_tech", "support", score=70)]
        v1 = json.dumps(detect_conflicts(memos, "S1"), sort_keys=True)
        v2 = json.dumps(detect_conflicts(memos, "S1"), sort_keys=True)
        self.assertEqual(v1, v2)

    def test_small_gap_does_not_conflict(self):
        memos = [_memo("sci_tech", "support", score=70),
                 _memo("development", "conditional_support", score=55)]
        self.assertEqual(detect_conflicts(memos, "S1"), [])

    def test_missing_info_high_conflict(self):
        # 建议只差 1 档（不触发 recommendation_gap），才能命中缺失信息规则
        tech = _memo("sci_tech", "support", score=70,
                     missing=[{"info_id": "T-M1", "severity": "high",
                               "description": "量产数据缺失", "impact": "未证实"}])
        econ = _memo("economy", "conditional_support", score=55)
        conflicts = detect_conflicts([tech, econ], "S1")
        kinds = [c["kind"] for c in conflicts]
        self.assertIn("missing_info_high", kinds)
        c = next(c for c in conflicts if c["kind"] == "missing_info_high")
        self.assertEqual(c["from"], "economy")
        self.assertEqual(c["to"], "sci_tech")

    def test_redline_vs_condition_conflict(self):
        fiscal = _memo("fiscal", "conditional_support", company_id=None,
                       red_lines=[{"redline_id": "F-R2",
                                   "condition": "企业资金来源未证实前不承诺后续追加上限",
                                   "reason": "防暴露"}])
        dev = _memo("development", "conditional_support",
                    conditions=[{"condition_id": "D-C1",
                                 "condition": "按市场窗口分阶段投入，保留暂停追加条款",
                                 "reason": "管理周期风险"}])
        conflicts = detect_conflicts([fiscal, dev], "S1")
        kinds = [c["kind"] for c in conflicts]
        self.assertIn("redline_vs_condition", kinds)
        c = next(c for c in conflicts if c["kind"] == "redline_vs_condition")
        self.assertEqual(c["from"], "fiscal")
        self.assertEqual(c["to"], "development")

    def test_pair_dedup_and_per_company_cap(self):
        # 同一对部门多条规则命中时只保留最高优先级一条
        tech = _memo("sci_tech", "support", score=70,
                     missing=[{"info_id": "T-M1", "severity": "high",
                               "description": "量产数据缺失", "impact": "未证实"}])
        econ = _memo("economy", "oppose", score=30)
        self.assertEqual(len(detect_conflicts([tech, econ], "S1")), 1)
        # 同一企业多部门两两冲突时每企业最多 2 个
        fiscal = _memo("fiscal", "support", company_id=None)
        memos = [fiscal, econ, tech, _memo("development", "oppose", score=25)]
        self.assertLessEqual(len(detect_conflicts(memos, "S1")), _MAX_PER_COMPANY)

    def test_fiscal_attached_to_every_company_group(self):
        memos = [_memo("fiscal", "support", company_id=None),
                 _memo("economy", "oppose", score=30, company_id="company_a"),
                 _memo("economy", "support", score=60, company_id="company_d")]
        groups = _grouped(memos)
        self.assertEqual(len(groups), 2)
        self.assertTrue(all(any(m["agent"] == "fiscal" for m in g) for g in groups.values()))

    def test_find_memorandum_fiscal_global(self):
        memos = [_memo("fiscal", "support", company_id=None),
                 _memo("economy", "oppose", score=30, company_id="company_a")]
        self.assertEqual(find_memorandum(memos, "fiscal", "company_a")["agent"], "fiscal")
        self.assertEqual(find_memorandum(memos, "economy", "company_a")["agent"], "economy")
        self.assertIsNone(find_memorandum(memos, "economy", "company_d"))


class TestChallengeValidator(unittest.TestCase):
    def _challenge(self):
        c = detect_conflicts([_memo("economy", "oppose", score=30),
                              _memo("sci_tech", "support", score=70)], "S1")[0]
        return dict(c, challenge_id="CH-S1-01", status="pending")

    def test_bad_kind_rejected(self):
        c = self._challenge()
        c["kind"] = "nonsense"
        with self.assertRaises(ValueError):
            validate_challenge(c)

    def test_bad_from_rejected(self):
        c = self._challenge()
        c["from"] = "finance"
        with self.assertRaises(ValueError):
            validate_challenge(c)

    def test_empty_question_rejected(self):
        c = self._challenge()
        c["question"] = ""
        with self.assertRaises(ValueError):
            validate_challenge(c)


if __name__ == "__main__":
    unittest.main()
