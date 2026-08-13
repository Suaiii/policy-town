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


from ..core.meeting import (build_challenges, position_revision, validate_challenge_response,
                            validate_position_revision, _reco_by_score)
from ..fallback import deterministic


class TestChallengeBuild(unittest.TestCase):
    def test_build_challenges_assigns_ids_and_pending(self):
        conflicts = detect_conflicts([_memo("economy", "oppose", score=30),
                                      _memo("sci_tech", "support", score=70)], "S1")
        challenges = build_challenges(conflicts, "S1")
        self.assertEqual(len(challenges), 1)
        ch = challenges[0]
        self.assertTrue(ch["challenge_id"].startswith("CH-S1-"))
        self.assertEqual(ch["status"], "pending")
        self.assertEqual(ch["conflict_id"], conflicts[0]["conflict_id"])
        self.assertEqual(ch["stage_id"], "S1")   # 不得覆盖 stage_id
        validate_challenge(ch)


class TestDeterministicResponse(unittest.TestCase):
    def _ch(self, i, kind="recommendation_gap"):
        return {"challenge_id": "CH-S1-%02d" % i, "stage_id": "S1", "kind": kind,
                "from": "economy", "to": "sci_tech", "evidence_ids": ["E1"]}

    def test_maintain_when_confident_and_high_score(self):
        memo = _memo("sci_tech", "support", score=70, confidence=0.8)
        r = deterministic.challenge_response(self._ch(1), memo, {})
        self.assertEqual(r["response_type"], "maintain")
        self.assertEqual(r["from"], "sci_tech")   # 回应方 = 被质询方
        self.assertEqual(r["to"], "economy")      # 回应给质询方
        self.assertEqual(r["challenge_id"], "CH-S1-01")

    def test_soften_mid_confidence(self):
        memo = _memo("sci_tech", "support", score=65, confidence=0.65)
        self.assertEqual(deterministic.challenge_response(self._ch(2), memo, {})["response_type"],
                         "soften")

    def test_change_when_low_score(self):
        memo = _memo("sci_tech", "support", score=35, confidence=0.65)
        self.assertEqual(deterministic.challenge_response(self._ch(3), memo, {})["response_type"],
                         "change")

    def test_concede_when_high_missing_and_no_evidence(self):
        memo = _memo("sci_tech", "support", score=70, evidence=[])
        r = deterministic.challenge_response(self._ch(4, "missing_info_high"), memo, {})
        self.assertEqual(r["response_type"], "concede_insufficient")
        self.assertEqual(r["evidence_ids"], [])

    def test_all_responses_valid(self):
        for i, (s, c) in enumerate([(70, 0.8), (65, 0.65), (35, 0.65)]):
            memo = _memo("sci_tech", "support", score=s, confidence=c)
            validate_challenge_response(deterministic.challenge_response(self._ch(i + 1), memo, {}))


class TestPositionRevision(unittest.TestCase):
    def _ch(self, i):
        return {"challenge_id": "CH-S1-%02d" % i, "stage_id": "S1",
                "from": "economy", "to": "sci_tech", "evidence_ids": ["E1"]}

    def test_no_revision_on_maintain(self):
        ch = self._ch(1)
        memo = _memo("sci_tech", "support", score=70, confidence=0.8)
        resp = deterministic.challenge_response(ch, memo, {})
        self.assertIsNone(position_revision(ch, memo, _memo("economy", "oppose", score=30), resp))

    def test_soften_merges_challenger_condition(self):
        ch = self._ch(2)
        memo = _memo("sci_tech", "support", score=65, confidence=0.65)
        challenger = _memo("economy", "oppose", score=30,
                           conditions=[{"condition_id": "E-C1", "condition": "分期拨付",
                                        "reason": "控节奏"}])
        resp = deterministic.challenge_response(ch, memo, {})
        rev = position_revision(ch, memo, challenger, resp)
        self.assertIsNotNone(rev)
        self.assertEqual(rev["agent"], "sci_tech")
        self.assertEqual(rev["after"]["score"], 53.0)          # 65 - 12
        self.assertEqual(rev["after"]["recommendation"], "conditional_support")
        self.assertEqual(rev["trigger_challenge_id"], "CH-S1-02")
        conds = [c["condition"] for c in rev["after"]["acceptable_conditions"]]
        self.assertIn("分期拨付", conds)                        # 质询方条件并入
        self.assertEqual(rev["before"]["recommendation"], "support")
        self.assertTrue(rev["reason"])
        validate_position_revision(rev)

    def test_change_lowers_by_25(self):
        ch = self._ch(3)
        memo = _memo("sci_tech", "support", score=35, confidence=0.65)
        resp = deterministic.challenge_response(ch, memo, {})
        rev = position_revision(ch, memo, _memo("economy", "oppose", score=30), resp)
        self.assertEqual(rev["after"]["score"], 10.0)
        self.assertEqual(rev["after"]["recommendation"], "oppose")

    def test_score_bands(self):
        self.assertEqual(_reco_by_score(60), "support")
        self.assertEqual(_reco_by_score(53), "conditional_support")
        self.assertEqual(_reco_by_score(38), "hold")
        self.assertEqual(_reco_by_score(20), "oppose")


if __name__ == "__main__":
    unittest.main()


# ---------- P1 Task 2-5：质询回应 / 立场修订 / 纪要 / 编排器接线 ----------

from ..core.orchestrator import Orchestrator
from ..core.meeting import (build_challenges, make_minutes, position_revision,
                            validate_challenge_response, validate_minutes,
                            validate_position_revision)
from ..fallback import deterministic


class TestMeetingMinutes2(unittest.TestCase):
    def _memos(self):
        return [_memo("fiscal", "support", company_id=None,
                      red_lines=[{"redline_id": "F-R2",
                                  "condition": "企业资金来源未证实前不承诺后续追加上限",
                                  "reason": "防暴露"}]),
                _memo("economy", "oppose", score=30),
                _memo("sci_tech", "support", score=65, confidence=0.65,
                      conditions=[{"condition_id": "T-C1", "condition": "里程碑绑定放款",
                                   "reason": "按阶段验证"}]),
                _memo("development", "conditional_support", score=50, confidence=0.7,
                      conditions=[{"condition_id": "D-C1", "condition": "保留暂停追加条款",
                                   "reason": "管理周期风险"}])]

    def _minutes(self, memos=None):
        memos = memos or self._memos()
        conflicts = detect_conflicts(memos, "S1")
        challenges = build_challenges(conflicts, "S1")
        responses = [deterministic.challenge_response(
            c, find_memorandum(memos, c["to"], c["company_id"]) or {}, {}) for c in challenges]
        revisions = [r for r in (position_revision(
            c, find_memorandum(memos, c["to"], c["company_id"]) or {},
            find_memorandum(memos, c["from"], c["company_id"]) or {}, resp)
            for c, resp in zip(challenges, responses)) if r is not None]
        return make_minutes(memos, challenges, responses, revisions, "S1")

    def test_minutes_structure(self):
        minutes = self._minutes()
        validate_minutes(minutes)
        self.assertGreaterEqual(len(minutes["proposals"]), 2)
        self.assertTrue(minutes["minority_opinions"], "oppose 的经信部门必须是少数意见")
        self.assertEqual(minutes["minority_opinions"][0]["agent"], "economy")
        self.assertTrue(minutes["disagreements"])

    def test_minutes_deterministic(self):
        import json as _j
        self.assertEqual(_j.dumps(self._minutes(), sort_keys=True),
                         _j.dumps(self._minutes(), sort_keys=True))


class TestOrchestratorCommunication(unittest.TestCase):
    def _view(self, company_ids=("proto_a", "proto_d")):
        orch = Orchestrator(seed=42)
        orch.start(list(company_ids), "S1")
        return orch.open_stage()

    def test_view_has_communication_and_minutes(self):
        view = self._view()
        self.assertIn("department_communication", view)
        self.assertIn("meeting_minutes", view)
        comm = view["department_communication"]
        for k in ("conflicts", "challenges", "responses", "position_revisions"):
            self.assertIn(k, comm)
        validate_minutes(view["meeting_minutes"])

    def test_real_s1_data_produces_challenges(self):
        view = self._view()
        challenges = view["department_communication"]["challenges"]
        self.assertTrue(challenges, "真实 S1 数据必须产生定向质询")
        self.assertLessEqual(len(challenges), 6)
        for ch in challenges:
            validate_challenge(ch)   # 真实链路产出的每条质询都必须满足契约
        parties = {ch["from"] for ch in challenges} | {ch["to"] for ch in challenges}
        self.assertLessEqual(parties, {"fiscal", "economy", "sci_tech", "development"})

    def test_communication_deterministic(self):
        v1 = self._view()
        v2 = self._view()
        import json as _j
        for k in ("department_communication", "meeting_minutes"):
            self.assertEqual(_j.dumps(v1[k], sort_keys=True),
                             _j.dumps(v2[k], sort_keys=True), k)

    def test_submit_decisions_keeps_communication(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        orch.open_stage()
        result = orch.submit_decisions([{"company_id": "company_a", "action": "invest",
                                         "capital_points": 30.0}])
        self.assertIn("department_communication", result)
        self.assertEqual(result["meeting_minutes"]["stage_id"], "S1")


class TestMeetingMinutesProvenance(unittest.TestCase):
    """纪要方案条件的部门来源可追溯（Task 3：proposing_department 归属正确）。"""

    def _minutes(self):
        from ..core.meeting import (build_challenges, detect_conflicts,
                                    find_memorandum, make_minutes, position_revision)
        from ..fallback import deterministic
        memos = [_memo("fiscal", "support", company_id=None,
                       red_lines=[{"redline_id": "F-R2",
                                   "condition": "企业资金来源未证实前不承诺后续追加上限",
                                   "reason": "防暴露"}]),
                 _memo("economy", "oppose", score=30,
                       red_lines=[{"redline_id": "E-R1",
                                   "condition": "配套不足时不一次性全额投入",
                                   "reason": "落地依赖配套"}]),
                 _memo("sci_tech", "support", score=65, confidence=0.65,
                       conditions=[{"condition_id": "T-C1", "condition": "里程碑绑定放款",
                                    "reason": "按阶段验证"}]),
                 _memo("development", "conditional_support", score=50, confidence=0.7,
                       conditions=[{"condition_id": "D-C1", "condition": "保留暂停追加条款",
                                    "reason": "管理周期风险"}])]
        conflicts = detect_conflicts(memos, "S1")
        challenges = build_challenges(conflicts, "S1")
        responses = [deterministic.challenge_response(
            c, find_memorandum(memos, c["to"], c["company_id"]) or {}, {})
            for c in challenges]
        revisions = []
        for c, r in zip(challenges, responses):
            rev = position_revision(c, find_memorandum(memos, c["to"], c["company_id"]) or {},
                                    find_memorandum(memos, c["from"], c["company_id"]) or {}, r)
            if rev is not None:
                revisions.append(rev)
        return make_minutes(memos, challenges, responses, revisions, "S1")

    def test_support_plan_merges_conditions_with_department(self):
        minutes = self._minutes()
        plan_a = next(p for p in minutes["proposals"] if p["proposal_id"] == "PLAN-A")
        conds = [(c["condition"], c["proposing_department"]) for c in plan_a["conditions"]]
        self.assertIn(("里程碑绑定放款", "sci_tech"), conds)
        self.assertIn(("保留暂停追加条款", "development"), conds)
        plan_b = next(p for p in minutes["proposals"] if p["proposal_id"] == "PLAN-B")
        self.assertTrue(any(c["proposing_department"] == "economy" for c in plan_b["conditions"]))
        validate_minutes(minutes)


class _CapturingLlm:
    def __init__(self) -> None:
        self.prompts: list = []

    def __call__(self, prompt: str, validator=None) -> dict:
        self.prompts.append(prompt)
        return {
            "response_id": "RESP-01", "challenge_id": "CH-S1-01", "stage_id": "S1",
            "from": "sci_tech", "to": "economy", "response_type": "soften",
            "statement": "接受质询，补充资金证明条件", "evidence_ids": ["E1"],
            "confidence": 0.6,
        }


class TestChallengeResponderAgent(unittest.TestCase):
    def test_prompt_contains_challenge_contract(self):
        from ..agents.professional import make_challenge_responders, run_challenge_responses
        llm = _CapturingLlm()
        responders = make_challenge_responders(llm)
        ch = {"conflict_id": "CF-S1-01", "challenge_id": "CH-S1-01", "stage_id": "S1",
              "company_id": "company_a", "kind": "recommendation_gap",
              "from": "economy", "to": "sci_tech",
              "from_ref": {"ref_id": "E-R1", "kind": "claim", "text": "反对", "evidence_ids": []},
              "to_ref": {"ref_id": "T-1", "kind": "claim", "text": "支持", "evidence_ids": ["E1"]},
              "severity": "high", "question": "请说明支持依据", "evidence_ids": [],
              "status": "pending"}
        memos = [_memo("economy", "oppose", score=30, company_id="company_a"),
                 _memo("sci_tech", "support", score=65, company_id="company_a")]
        responses = run_challenge_responses(
            responders, [ch], memos,
            {"market": {}, "city": {"budget_points": 100}})
        self.assertEqual(len(responses), 1)
        self.assertEqual(responses[0]["response_type"], "soften")
        self.assertEqual(responses[0]["from"], "sci_tech")
        validate_challenge_response(responses[0])
        self.assertTrue(llm.prompts, "质询回应必须触发 LLM")
        blob = "\n".join(llm.prompts)
        for token in ("challenge_id", "response_type", "question", "evidence_ids"):
            self.assertIn(token, blob, "质询回应 Prompt 必须包含契约字段 %s" % token)

    def test_llm_bogus_output_falls_back(self):
        from ..agents.professional import make_challenge_responders, run_challenge_responses

        class _BogusLlm:
            def __call__(self, prompt: str, validator=None) -> dict:
                return {"response_type": "nonsense"}

        responders = make_challenge_responders(_BogusLlm())
        ch = {"conflict_id": "CF-S1-02", "challenge_id": "CH-S1-02", "stage_id": "S1",
              "company_id": "company_a", "kind": "recommendation_gap",
              "from": "economy", "to": "sci_tech",
              "from_ref": {"ref_id": "E-R2", "kind": "claim", "text": "反对", "evidence_ids": []},
              "to_ref": {"ref_id": "T-2", "kind": "claim", "text": "支持", "evidence_ids": ["E1"]},
              "severity": "high", "question": "请说明支持依据", "evidence_ids": [],
              "status": "pending"}
        memo = _memo("sci_tech", "support", score=65, confidence=0.65, company_id="company_a")
        responses = run_challenge_responses(
            responders, [ch],
            [_memo("economy", "oppose", score=30, company_id="company_a"), memo],
            {"market": {}, "city": {"budget_points": 100}})
        self.assertEqual(responses[0]["response_type"], "soften")   # 走确定性 fallback
        validate_challenge_response(responses[0])

    def test_empty_challenges_returns_empty(self):
        from ..agents.professional import make_challenge_responders, run_challenge_responses
        responders = make_challenge_responders()
        memos = [_memo("economy", "oppose", score=30, company_id="company_a"),
                 _memo("sci_tech", "support", score=70, company_id="company_a")]
        responses = run_challenge_responses(
            responders, [], memos,
            {"market": {}, "city": {"budget_points": 100}})
        self.assertEqual(responses, [])
