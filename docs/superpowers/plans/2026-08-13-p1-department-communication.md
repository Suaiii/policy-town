# P1 可审计部门通信（冲突识别 / 定向质询 / 立场修订 / 会议纪要）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现《产品文档》第 12 节 P1——四部门初审备忘录（P0 产物）经确定性冲突识别触发一轮定向 Challenge/Response，产出 PositionRevision（立场变化留痕）与 MeetingMinutes（共识/分歧/≥2 方案/少数意见），并接入编排器 `open_stage` 视图。

**Architecture:** 全部改动在 `policytown/investment/` 内。新增纯确定性模块 `core/meeting.py`（冲突识别、Challenge 构建、立场修订、会议纪要——同输入必同输出），质询回应走"LLM 可选 + 确定性 fallback"双轨（沿用 P0.5 企业 Agent 模式）：`agents/professional.py` 新增 `ChallengeResponderAgent`，无 `llm_fn` 或超时/校验失败时回退 `fallback/deterministic.py::challenge_response`。P1 只做记录与纪要：立场修订**不**回写引擎结算输入（`engine.settle` 仍读原始 `assessments`），"玩家采纳条件才进引擎"留到 P2。

**Tech Stack:** Python 3.9+（stdlib only）、unittest、既有 `contracts/*.schema.json` 契约目录。

**前置依赖:** P0（部门备忘录契约）与 P0.5 已完成，`open_stage()` 已输出 `department_memoranda`。

---

## 文件结构

```
policytown/investment/
├── core/
│   └── meeting.py                     # 新建：冲突识别 + Challenge 构建 + 立场修订 + 纪要（纯确定性）
├── agents/
│   └── professional.py                # 修改：ChallengeResponderAgent + run_challenge_responses
├── fallback/
│   └── deterministic.py               # 修改：challenge_response + position_revision fallback
├── contracts/
│   ├── challenge.schema.json          # 新建：Conflict + Challenge
│   ├── challenge_response.schema.json # 新建：质询回应
│   ├── position_revision.schema.json  # 新建：立场修订
│   └── meeting_minutes.schema.json    # 新建：会议纪要
├── core/
│   └── orchestrator.py                # 修改：open_stage/submit_decisions 输出 department_communication + meeting_minutes
└── tests/
    ├── test_meeting.py                # 新建：冲突/质询/修订/纪要测试
    └── test_departments.py            # 修改：LLM 质询回应 Prompt 测试 + 编排器接线回归
```

---

## Task 1: 确定性冲突识别 + Challenge 契约与校验器

**Files:**
- Create: `policytown/investment/contracts/challenge.schema.json`
- Create: `policytown/investment/core/meeting.py`（本任务只加：常量、`find_memorandum`、`_grouped`、`_ref`、`_claim_ref`、`detect_conflicts`、`validate_challenge`）
- Create: `policytown/investment/tests/test_meeting.py`

- [ ] **Step 1: 写失败测试（冲突识别三条规则 + 限流 + Challenge 校验器）**

```python
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
        self.assertTrue(c["question"].strip())
        self.assertTrue(c["conflict_id"].startswith("CF-S1-"))
        validate_challenge(dict(c, challenge_id="CH-S1-01", status="pending"))  # 不抛异常即通过

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
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: FAIL（ImportError：`core.meeting` 不存在）。

- [ ] **Step 3: 新建 contracts/challenge.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.3/challenge",
  "title": "Challenge v0.3 — 定向部门质询（文档 4.5 / 5.5）",
  "description": "冲突识别结果；每条冲突触发一次定向质询：from 质询 to，引用双方主张。",
  "type": "object",
  "required": ["conflict_id", "challenge_id", "stage_id", "company_id", "kind",
               "from", "to", "from_ref", "to_ref", "severity", "question",
               "evidence_ids", "status"],
  "properties": {
    "conflict_id": {"type": "string"},
    "challenge_id": {"type": "string"},
    "stage_id": {"type": "string"},
    "company_id": {"type": ["string", "null"]},
    "kind": {"type": "string",
             "enum": ["recommendation_gap", "missing_info_high", "redline_vs_condition"]},
    "from": {"type": "string", "enum": ["fiscal", "economy", "sci_tech", "development"]},
    "to": {"type": "string", "enum": ["fiscal", "economy", "sci_tech", "development"]},
    "from_ref": {"$ref": "#/definitions/ref"},
    "to_ref": {"$ref": "#/definitions/ref"},
    "severity": {"type": "string", "enum": ["high", "medium", "low"]},
    "question": {"type": "string"},
    "evidence_ids": {"type": "array", "items": {"type": "string"}},
    "status": {"type": "string", "enum": ["pending", "answered"]}
  },
  "definitions": {
    "ref": {
      "type": "object",
      "required": ["ref_id", "kind", "text", "evidence_ids"],
      "properties": {
        "ref_id": {"type": "string"},
        "kind": {"type": "string", "enum": ["claim", "red_line", "condition"]},
        "text": {"type": "string"},
        "evidence_ids": {"type": "array", "items": {"type": "string"}}
      }
    }
  }
}
```

- [ ] **Step 4: 新建 core/meeting.py（冲突识别部分）**

```python
"""部门通信编排 — 冲突识别 / 定向质询 / 立场修订 / 会议纪要（文档 4.5 / 5.5）。

纯确定性：同 memoranda 输入 → 同冲突、同质询、同纪要。LLM 只负责质询回应
（agents.professional.ChallengeResponderAgent），超时/断网回退 deterministic.challenge_response。
不改任何数值；产出只进视图与纪要。规则引擎仍按玩家采纳的条件结算（P2 接入）。
"""
from __future__ import annotations

from typing import Dict, List, Optional

REC_LADDER = {"support": 0, "conditional_support": 1, "hold": 2, "oppose": 3}
_KIND_RANK = {"recommendation_gap": 3, "missing_info_high": 2, "redline_vs_condition": 1}
_DEPTS = ("fiscal", "economy", "sci_tech", "development")
_ROLE_NAMES = {"fiscal": "财政部门", "economy": "经信部门",
               "sci_tech": "科技部门", "development": "发改部门"}
_MAX_PER_COMPANY = 2
MAX_PER_STAGE = 6
_RECO_BANDS = ((55, "support"), (40, "conditional_support"), (30, "hold"))

_REQUIRED_CHALLENGE = ["conflict_id", "challenge_id", "stage_id", "company_id",
                       "kind", "from", "to", "from_ref", "to_ref", "severity",
                       "question", "evidence_ids", "status"]
_CHALLENGE_KINDS = ("recommendation_gap", "missing_info_high", "redline_vs_condition")
_SEVERITIES = ("high", "medium", "low")


def find_memorandum(memoranda: List[dict], agent: str,
                    company_id: Optional[str] = None) -> Optional[dict]:
    """按部门与企业取备忘录；财政全局一份，匹配任何企业。"""
    for m in memoranda:
        if m.get("agent") != agent:
            continue
        if agent == "fiscal":
            return m
        if m.get("company_id") == company_id:
            return m
    return None


def _grouped(memoranda: List[dict]) -> Dict[str, List[dict]]:
    """按企业分组；财政全局备忘录并入每组（每组 = 3 部门 + 财政）。"""
    groups: Dict[str, List[dict]] = {}
    fiscal = [m for m in memoranda if m.get("agent") == "fiscal"]
    for m in memoranda:
        cid = m.get("company_id")
        if cid is None:
            continue
        groups.setdefault(cid, []).append(m)
    for memos in groups.values():
        memos.extend(fiscal)
    return groups


def _ref(obj: dict, kind: str, text: str) -> dict:
    return {"ref_id": obj.get("claim_id") or obj.get("redline_id") or obj.get("condition_id")
            or obj.get("info_id") or "?",
            "kind": kind, "text": text, "evidence_ids": list(obj.get("evidence_ids", []))}


def _claim_ref(memo: dict, claim_type: str) -> dict:
    for claim in memo.get("core_claims", []):
        if claim.get("claim_type") == claim_type and claim.get("statement"):
            return _ref(claim, "claim", claim["statement"])
    if memo.get("core_claims"):
        c = memo["core_claims"][0]
        return _ref(c, "claim", c["statement"])
    return {"ref_id": "?", "kind": "claim", "text": memo.get("reasoning_summary", ""),
            "evidence_ids": []}


def _conflict_rules(a: dict, b: dict, cid: str) -> Optional[dict]:
    """按优先级返回该对部门的第一类冲突，无冲突返回 None。"""
    ra, rb = REC_LADDER[a["recommendation"]], REC_LADDER[b["recommendation"]]

    # 规则 1：建议分歧 ≥2 档（support/conditional_support/hold/oppose）
    if abs(ra - rb) >= 2:
        neg, pos = (a, b) if ra > rb else (b, a)
        return {
            "stage_id": "", "company_id": cid, "kind": "recommendation_gap",
            "from": neg["agent"], "to": pos["agent"],
            "from_ref": _claim_ref(neg, "risk"),
            "to_ref": _claim_ref(pos, "positive"),
            "severity": "high",
            "question": "你（%s）建议%s，而%s建议%s。请引用证据说明你支持的判断依据，"
                        "并回应对方主张。"
                        % (_ROLE_NAMES[pos["agent"]], pos["recommendation"],
                           _ROLE_NAMES[neg["agent"]], neg["recommendation"]),
            "evidence_ids": [e for e in pos.get("evidence_ids", [])][:3],
        }

    # 规则 2：存在 high 级缺失信息却仍建议支持
    high = [m for m in (a, b)
            if any(mi.get("severity") == "high" for mi in m.get("missing_info", []))]
    if high and high[0]["recommendation"] in ("support", "conditional_support"):
        h = high[0]
        o = b if h is a else a
        if REC_LADDER[o["recommendation"]] > REC_LADDER[h["recommendation"]]:
            desc = next((mi["description"] for mi in h.get("missing_info", [])
                         if mi["severity"] == "high"), "?")
            return {
                "stage_id": "", "company_id": cid, "kind": "missing_info_high",
                "from": o["agent"], "to": h["agent"],
                "from_ref": _claim_ref(o, "risk"),
                "to_ref": _claim_ref(h, "positive"),
                "severity": "medium",
                "question": "你（%s）存在 high 级缺失信息（%s）却建议%s。"
                            "请说明在缺失情况下仍支持的理由，或调整建议。"
                            % (_ROLE_NAMES[h["agent"]], desc, h["recommendation"]),
                "evidence_ids": [],
            }

    # 规则 3：一方红线与另一方可接受条件冲突（关键词：追加）
    holder = next((m for m in (a, b)
                   if any("追加" in rl.get("condition", "") for rl in m.get("red_lines", []))),
                  None)
    if holder is not None:
        other = b if holder is a else a
        conds = [c for c in other.get("acceptable_conditions", [])
                 if "追加" in c.get("condition", "")]
        if conds and other["recommendation"] in ("support", "conditional_support"):
            rl = next(r for r in holder.get("red_lines", []) if "追加" in r.get("condition", ""))
            return {
                "stage_id": "", "company_id": cid, "kind": "redline_vs_condition",
                "from": holder["agent"], "to": other["agent"],
                "from_ref": _ref(rl, "red_line", rl["condition"]),
                "to_ref": _ref(conds[0], "condition", conds[0]["condition"]),
                "severity": "low",
                "question": "你（%s）的条件“%s”与%s的红线“%s”冲突。"
                            "请说明追加承诺如何与财政暴露上限协调。"
                            % (_ROLE_NAMES[other["agent"]], conds[0]["condition"],
                               _ROLE_NAMES[holder["agent"]], rl["condition"]),
                "evidence_ids": [],
            }
    return None


def detect_conflicts(memoranda: List[dict], stage_id: str = "S1") -> List[dict]:
    """识别真实分歧：每对部门最高优先级一条；每企业最多 _MAX_PER_COMPANY 条。"""
    conflicts: List[dict] = []
    seq = 0
    for cid, memos in _grouped(memoranda).items():
        candidates: List[dict] = []
        seen_pairs = set()
        for i, a in enumerate(memos):
            for b in memos[i + 1:]:
                pair = frozenset((a["agent"], b["agent"]))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                conf = _conflict_rules(a, b, cid)
                if conf is not None:
                    candidates.append(conf)
        candidates.sort(key=lambda c: -_KIND_RANK[c["kind"]])
        for conf in candidates[:_MAX_PER_COMPANY]:
            seq += 1
            conf["stage_id"] = stage_id
            conf["conflict_id"] = "CF-%s-%02d" % (stage_id, seq)
            conflicts.append(conf)
    return conflicts[:MAX_PER_STAGE]


def validate_challenge(ch: dict) -> None:
    missing = [k for k in _REQUIRED_CHALLENGE if k not in ch]
    if missing:
        raise ValueError("challenge missing keys: %s" % missing)
    if ch.get("kind") not in _CHALLENGE_KINDS:
        raise ValueError("invalid challenge kind: %r" % ch.get("kind"))
    if ch.get("from") not in _DEPTS or ch.get("to") not in _DEPTS:
        raise ValueError("invalid challenge party: from=%r to=%r" % (ch.get("from"), ch.get("to")))
    if ch.get("severity") not in _SEVERITIES:
        raise ValueError("invalid severity: %r" % ch.get("severity"))
    if not ch.get("question", "").strip():
        raise ValueError("challenge without question")
    if ch.get("status") not in ("pending", "answered"):
        raise ValueError("invalid status: %r" % ch.get("status"))
```

- [ ] **Step 5: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: PASS（10 例：TestConflictDetection 7 例 + TestChallengeValidator 3 例）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment/core/meeting.py policytown/investment/contracts/challenge.schema.json policytown/investment/tests/test_meeting.py
git commit -m "feat(p1): deterministic conflict detection rules + challenge contract"
```

---

## Task 2: 定向质询构建 + 确定性回应 + 立场修订

**Files:**
- Modify: `policytown/investment/core/meeting.py`（追加：`build_challenges`、`validate_challenge_response`、`_reco_by_score`、`position_revision`、`validate_position_revision`）
- Modify: `policytown/investment/fallback/deterministic.py`（追加：`challenge_response`）
- Create: `policytown/investment/contracts/challenge_response.schema.json`
- Create: `policytown/investment/contracts/position_revision.schema.json`
- Modify: `policytown/investment/tests/test_meeting.py`（追加测试）

- [ ] **Step 1: 写失败测试（质询构建、四种回应路径、立场修订规则）**

在 `test_meeting.py` 末尾追加：

```python
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
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: FAIL（`build_challenges` / `position_revision` 等不存在；`deterministic.challenge_response` 不存在）。

- [ ] **Step 3: meeting.py 追加质询构建、回应校验器与立场修订**

注意：`build_challenges` 用 `dict(c)` 浅拷贝并只覆盖 `challenge_id` / `status`，不得覆盖 `stage_id`（Task 1 起冲突已携带真实 stage_id）。

```python
def build_challenges(conflicts: List[dict], stage_id: str = "S1") -> List[dict]:
    """每条冲突 → 一次定向质询（一轮，不追问不闲聊）。"""
    out = []
    for i, c in enumerate(conflicts, 1):
        ch = dict(c)
        ch["challenge_id"] = "CH-%s-%02d" % (stage_id, i)
        ch["status"] = "pending"
        out.append(ch)
    return out


_REQUIRED_RESPONSE = ["response_id", "challenge_id", "stage_id", "from", "to",
                      "response_type", "statement", "evidence_ids", "confidence"]
_RESPONSE_TYPES = ("maintain", "soften", "change", "concede_insufficient")


def validate_challenge_response(out: dict) -> None:
    missing = [k for k in _REQUIRED_RESPONSE if k not in out]
    if missing:
        raise ValueError("challenge response missing keys: %s" % missing)
    if out.get("response_type") not in _RESPONSE_TYPES:
        raise ValueError("invalid response_type: %r" % out.get("response_type"))
    if not out.get("statement", "").strip():
        raise ValueError("response without statement")
    if out.get("from") not in _DEPTS or out.get("to") not in _DEPTS:
        raise ValueError("invalid response party: from=%r to=%r" % (out.get("from"), out.get("to")))


def _reco_by_score(score: float) -> str:
    for band, reco in _RECO_BANDS:
        if score >= band:
            return reco
    return "oppose"


_REQUIRED_REVISION = ["revision_id", "stage_id", "agent", "company_id",
                      "trigger_challenge_id", "trigger_evidence_ids",
                      "before", "after", "reason"]


def position_revision(challenge: dict, memo: dict, challenger_memo: dict,
                      response: dict) -> Optional[dict]:
    """立场变化留痕：maintain → None；soften/change/concede → 记录变化前后与触发证据。"""
    rtype = response["response_type"]
    if rtype == "maintain":
        return None
    before = {"recommendation": memo["recommendation"], "score": memo["score"],
              "red_lines": [dict(r) for r in memo.get("red_lines", [])],
              "acceptable_conditions": [dict(c) for c in memo.get("acceptable_conditions", [])]}
    delta = {"soften": -12, "change": -25, "concede_insufficient": -30}[rtype]
    score = round(max(0.0, memo["score"] + delta), 1)
    reco = "hold" if rtype == "concede_insufficient" else _reco_by_score(score)
    conds = [dict(c) for c in before["acceptable_conditions"]]
    extra = next(iter(challenger_memo.get("acceptable_conditions", [])), None)
    if extra and extra["condition"] not in {c["condition"] for c in conds} and len(conds) < 4:
        conds.append(dict(extra))
    return {
        "revision_id": "REV-%s" % response["challenge_id"].replace("CH-", ""),
        "stage_id": challenge.get("stage_id", ""),
        "agent": memo["agent"],
        "company_id": memo.get("company_id"),
        "trigger_challenge_id": challenge["challenge_id"],
        "trigger_evidence_ids": [e for e in
                                 challenge.get("evidence_ids", []) + response.get("evidence_ids", [])],
        "before": before,
        "after": {"recommendation": reco, "score": score,
                  "red_lines": before["red_lines"],
                  "acceptable_conditions": conds},
        "reason": "%s：%s" % (rtype, response["statement"]),
    }


def validate_position_revision(rev: dict) -> None:
    missing = [k for k in _REQUIRED_REVISION if k not in rev]
    if missing:
        raise ValueError("position revision missing keys: %s" % missing)
    if rev.get("agent") not in _DEPTS:
        raise ValueError("invalid revision agent: %r" % rev.get("agent"))
    for side in ("before", "after"):
        for k in ("recommendation", "score"):
            if k not in rev.get(side, {}):
                raise ValueError("revision %s missing key: %s" % (side, k))
```

- [ ] **Step 4: fallback/deterministic.py 追加确定性质询回应**

在 `counter_proposal` 函数之后、`_dir` 之前追加：

```python
def challenge_response(challenge: dict, memo: dict, ctx: dict) -> dict:
    """被质询部门按自身置信度与证据强度回应（文档 4.5 / 5.5）。

    路径：high 级缺失且无证据 → 承认材料不足；高置信高评分 → 维持；
    低评分 → 改变立场；其余 → 软化并接受对方条件约束。
    """
    kind = challenge.get("kind", "")
    ev = memo.get("evidence_ids", [])
    if kind == "missing_info_high" and not ev:
        rtype, statement = "concede_insufficient", \
            "承认该信息缺失且暂无直接证据，将缺失影响写入条件并建议暂缓全额投入"
    elif memo.get("confidence", 0.5) >= 0.75 and memo.get("score", 0) >= 55:
        rtype, statement = "maintain", "维持原立场：主张有证据支撑，并说明缺失信息的处理方式"
    elif memo.get("score", 0) < 40:
        rtype, statement = "change", "接受质询：原判断依据不足，调整为审慎立场并补充条件"
    else:
        rtype, statement = "soften", "部分接受质询：维持基本立场，但接受对方条件约束并更新可接受条件"
    return {
        "response_id": "RESP-%s" % challenge["challenge_id"].replace("CH-", ""),
        "challenge_id": challenge["challenge_id"],
        "stage_id": challenge.get("stage_id", ""),
        "from": memo["agent"],
        "to": challenge.get("from", ""),
        "response_type": rtype,
        "statement": statement,
        "evidence_ids": ev,
        "confidence": memo.get("confidence", 0.5),
    }
```

- [ ] **Step 5: 新建 contracts/challenge_response.schema.json 与 contracts/position_revision.schema.json**

`challenge_response.schema.json`：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.3/challenge_response",
  "title": "ChallengeResponse v0.3 — 被质询部门回应（文档 4.5）",
  "description": "被质询部门引用证据回应，可维持/软化/改变立场或承认材料不足。",
  "type": "object",
  "required": ["response_id", "challenge_id", "stage_id", "from", "to",
               "response_type", "statement", "evidence_ids", "confidence"],
  "properties": {
    "response_id": {"type": "string"},
    "challenge_id": {"type": "string"},
    "stage_id": {"type": "string"},
    "from": {"type": "string", "enum": ["fiscal", "economy", "sci_tech", "development"]},
    "to": {"type": "string", "enum": ["fiscal", "economy", "sci_tech", "development"]},
    "response_type": {"type": "string",
                      "enum": ["maintain", "soften", "change", "concede_insufficient"]},
    "statement": {"type": "string"},
    "evidence_ids": {"type": "array", "items": {"type": "string"}},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1}
  }
}
```

`position_revision.schema.json`：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.3/position_revision",
  "title": "PositionRevision v0.3 — 立场变化留痕（文档 4.5 / 5.5）",
  "description": "每次立场变化保存变化前后、触发证据、触发质询与原因。",
  "type": "object",
  "required": ["revision_id", "stage_id", "agent", "company_id",
               "trigger_challenge_id", "trigger_evidence_ids", "before", "after", "reason"],
  "properties": {
    "revision_id": {"type": "string"},
    "stage_id": {"type": "string"},
    "agent": {"type": "string", "enum": ["fiscal", "economy", "sci_tech", "development"]},
    "company_id": {"type": ["string", "null"]},
    "trigger_challenge_id": {"type": "string"},
    "trigger_evidence_ids": {"type": "array", "items": {"type": "string"}},
    "reason": {"type": "string"},
    "before": {"$ref": "#/definitions/position"},
    "after": {"$ref": "#/definitions/position"}
  },
  "definitions": {
    "position": {
      "type": "object",
      "required": ["recommendation", "score", "red_lines", "acceptable_conditions"],
      "properties": {
        "recommendation": {"type": "string",
                           "enum": ["support", "conditional_support", "hold", "oppose"]},
        "score": {"type": "number", "minimum": 0, "maximum": 100},
        "red_lines": {"type": "array"},
        "acceptable_conditions": {"type": "array"}
      }
    }
  }
}
```

- [ ] **Step 6: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: PASS（新增 13 例全过）。

- [ ] **Step 7: 提交**

```bash
git add policytown/investment/core/meeting.py policytown/investment/fallback/deterministic.py policytown/investment/contracts policytown/investment/tests/test_meeting.py
git commit -m "feat(p1): directed challenge build + deterministic response + position revision"
```

---

## Task 3: 会议纪要（共识 / 分歧 / 方案 / 少数意见）

**Files:**
- Modify: `policytown/investment/core/meeting.py`（追加：`make_minutes`、`validate_minutes`、内部助手）
- Create: `policytown/investment/contracts/meeting_minutes.schema.json`
- Modify: `policytown/investment/tests/test_meeting.py`（追加测试）

- [ ] **Step 1: 写失败测试（纪要结构、≥2 方案、条件带来源部门、确定性）**

在 `test_meeting.py` 末尾追加：

```python
from ..core.meeting import make_minutes, validate_minutes


def _stage_memos():
    return [_memo("fiscal", "support", company_id=None,
                  red_lines=[{"redline_id": "F-R2",
                              "condition": "企业资金来源未证实前不承诺后续追加上限",
                              "reason": "防暴露"}]),
            _memo("economy", "oppose", score=30,
                  red_lines=[{"redline_id": "E-R1", "condition": "配套不足时不一次性全额投入",
                              "reason": "落地依赖配套"}]),
            _memo("sci_tech", "support", score=65, confidence=0.65,
                  conditions=[{"condition_id": "T-C1", "condition": "里程碑绑定放款",
                               "reason": "按阶段验证"}]),
            _memo("development", "conditional_support", score=50, confidence=0.7,
                  conditions=[{"condition_id": "D-C1", "condition": "保留暂停追加条款",
                               "reason": "管理周期风险"}])]


class TestMeetingMinutes(unittest.TestCase):
    def test_minutes_structure_and_two_proposals(self):
        memos = _stage_memos()
        conflicts = detect_conflicts(memos, "S1")
        challenges = build_challenges(conflicts, "S1")
        responses = [deterministic.challenge_response(c, find_memorandum(memos, c["to"],
                                                                         c["company_id"]), {})
                     for c in challenges]
        revisions = [r for r in (position_revision(c, find_memorandum(memos, c["to"], c["company_id"]),
                                                   find_memorandum(memos, c["from"], c["company_id"]), resp)
                                 for c, resp in zip(challenges, responses))
                     if r is not None]
        minutes = make_minutes(memos, challenges, responses, revisions, "S1")
        self.assertEqual(minutes["stage_id"], "S1")
        self.assertIn("consensus", minutes)
        self.assertIn("disagreements", minutes)
        self.assertIn("minority_opinions", minutes)
        self.assertIn("open_questions", minutes)
        self.assertGreaterEqual(len(minutes["proposals"]), 2)
        for p in minutes["proposals"]:
            self.assertTrue(p["proposal_id"])
            self.assertTrue(p["title"])
            self.assertTrue(p["conditions"])
        self.assertEqual(minutes["revision_count"], len(revisions))
        validate_minutes(minutes)

    def test_support_plan_merges_conditions_with_department(self):
        memos = _stage_memos()
        conflicts = detect_conflicts(memos, "S1")
        challenges = build_challenges(conflicts, "S1")
        responses = [deterministic.challenge_response(c, find_memorandum(memos, c["to"],
                                                                         c["company_id"]), {})
                     for c in challenges]
        revisions = [r for r in (position_revision(c, find_memorandum(memos, c["to"], c["company_id"]),
                                                   find_memorandum(memos, c["from"], c["company_id"]), resp)
                                 for c, resp in zip(challenges, responses))
                     if r is not None]
        minutes = make_minutes(memos, challenges, responses, revisions, "S1")
        plan_a = next(p for p in minutes["proposals"] if p["proposal_id"] == "PLAN-A")
        conds = [(c["condition"], c["proposing_department"]) for c in plan_a["conditions"]]
        self.assertIn(("里程碑绑定放款", "sci_tech"), conds)
        self.assertIn(("保留暂停追加条款", "development"), conds)
        plan_b = next(p for p in minutes["proposals"] if p["proposal_id"] == "PLAN-B")
        self.assertTrue(any(c["proposing_department"] == "economy" for c in plan_b["conditions"]))

    def test_minority_and_disagreements(self):
        memos = _stage_memos()
        conflicts = detect_conflicts(memos, "S1")
        challenges = build_challenges(conflicts, "S1")
        responses = [deterministic.challenge_response(c, find_memorandum(memos, c["to"],
                                                                         c["company_id"]), {})
                     for c in challenges]
        revisions = []
        minutes = make_minutes(memos, challenges, responses, revisions, "S1")
        self.assertTrue(minutes["minority_opinions"],
                        "oppose 的经信部门必须是少数意见")
        self.assertEqual(minutes["minority_opinions"][0]["agent"], "economy")
        self.assertTrue(minutes["disagreements"])

    def test_minutes_deterministic(self):
        import json
        def _minutes():
            memos = _stage_memos()
            conflicts = detect_conflicts(memos, "S1")
            challenges = build_challenges(conflicts, "S1")
            responses = [deterministic.challenge_response(
                c, find_memorandum(memos, c["to"], c["company_id"]), {}) for c in challenges]
            revisions = [r for r in (position_revision(
                c, find_memorandum(memos, c["to"], c["company_id"]),
                find_memorandum(memos, c["from"], c["company_id"]), resp)
                for c, resp in zip(challenges, responses)) if r is not None]
            return make_minutes(memos, challenges, responses, revisions, "S1")
        self.assertEqual(json.dumps(_minutes(), sort_keys=True),
                         json.dumps(_minutes(), sort_keys=True))
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: FAIL（`make_minutes` / `validate_minutes` 不存在）。

- [ ] **Step 3: meeting.py 追加会议纪要**

在 `validate_position_revision` 之后追加：

```python
def _shared_evidence(memoranda: List[dict]) -> List[str]:
    """在任一组内被 ≥3 个部门引用的证据视为共享证据。"""
    counts: Dict[str, int] = {}
    for memos in _grouped(memoranda).values():
        for m in memos:
            for eid in set(m.get("evidence_ids", [])):
                counts[eid] = counts.get(eid, 0) + 1
    return sorted(eid for eid, n in counts.items() if n >= 3)


def _majority(memos: List[dict]) -> str:
    """组内建议的中位档（保守方向）作为多数意见。"""
    ladder = sorted(REC_LADDER[m["recommendation"]] for m in memos)
    med = ladder[len(ladder) // 2]
    return _reco_by_score({0: 99, 1: 50, 2: 35, 3: 20}[med])


def _dedup_conditions(items: List[dict]) -> List[dict]:
    seen = set()
    out = []
    for it in items:
        key = (it["condition"], it["company_id"])
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def _build_proposals(memoranda: List[dict]) -> List[dict]:
    support, cautious = [], []
    for cid, memos in _grouped(memoranda).items():
        for m in memos:
            if m["recommendation"] in ("support", "conditional_support"):
                for c in m.get("acceptable_conditions", []):
                    support.append({"condition": c["condition"], "reason": c["reason"],
                                    "proposing_department": m["agent"], "company_id": cid})
            else:
                for rl in m.get("red_lines", []):
                    cautious.append({"condition": rl["condition"], "reason": rl["reason"],
                                     "proposing_department": m["agent"], "company_id": cid})
    return [
        {"proposal_id": "PLAN-A", "title": "进取支持方案",
         "basis": "支持与有条件支持部门的合并条件",
         "conditions": _dedup_conditions(support)},
        {"proposal_id": "PLAN-B", "title": "审慎风控方案",
         "basis": "反对/暂缓部门红线转化及财政暴露上限",
         "conditions": _dedup_conditions(cautious)},
    ]


def make_minutes(memoranda: List[dict], challenges: List[dict], responses: List[dict],
                 revisions: List[dict], stage_id: str = "S1") -> dict:
    """联席会议纪要：共识 / 未解决分歧 / ≥2 方案 / 少数意见 / 待调查问题。"""
    resp_by_ch = {r["challenge_id"]: r for r in responses}
    disagreements = []
    for ch in challenges:
        r = resp_by_ch.get(ch["challenge_id"])
        rtype = r["response_type"] if r else "pending"
        disagreements.append({
            "conflict_id": ch["conflict_id"], "kind": ch["kind"],
            "from": ch["from"], "to": ch["to"], "company_id": ch["company_id"],
            "question": ch["question"],
            "response_type": rtype,
            "resolved": rtype in ("change", "concede_insufficient"),
            "summary": r["statement"] if r else "未回应",
        })
    per_company = _grouped(memoranda)
    consensus = {
        "shared_evidence_ids": _shared_evidence(memoranda),
        "majority_by_company": {cid: _majority(memos) for cid, memos in per_company.items()},
    }
    minority = []
    for cid, memos in per_company.items():
        maj = consensus["majority_by_company"][cid]
        for m in memos:
            if m["recommendation"] != maj:
                minority.append({"company_id": cid, "agent": m["agent"],
                                 "recommendation": m["recommendation"],
                                 "reasoning_summary": m.get("reasoning_summary", "")})
    open_questions = [
        {"challenge_id": ch["challenge_id"], "from": ch["from"], "to": ch["to"],
         "company_id": ch["company_id"], "question": ch["question"]}
        for ch in challenges
        if resp_by_ch.get(ch["challenge_id"], {}).get("response_type") in ("maintain", "soften", None)
    ]
    return {
        "stage_id": stage_id,
        "consensus": consensus,
        "disagreements": disagreements,
        "proposals": _build_proposals(memoranda),
        "minority_opinions": minority,
        "open_questions": open_questions,
        "revision_count": len(revisions),
    }


_REQUIRED_MINUTES = ["stage_id", "consensus", "disagreements", "proposals",
                     "minority_opinions", "open_questions", "revision_count"]


def validate_minutes(minutes: dict) -> None:
    missing = [k for k in _REQUIRED_MINUTES if k not in minutes]
    if missing:
        raise ValueError("minutes missing keys: %s" % missing)
    if len(minutes.get("proposals", [])) < 2:
        raise ValueError("minutes must contain at least 2 proposals")
    for p in minutes.get("proposals", []):
        if not p.get("proposal_id") or not p.get("title"):
            raise ValueError("proposal missing id/title")
        for c in p.get("conditions", []):
            if not c.get("proposing_department"):
                raise ValueError("proposal condition without proposing_department")
```

- [ ] **Step 4: 新建 contracts/meeting_minutes.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.3/meeting_minutes",
  "title": "MeetingMinutes v0.3 — 联席会议纪要（文档 4.5）",
  "description": "共识、未解决分歧、至少两个方案、少数意见与待调查问题。",
  "type": "object",
  "required": ["stage_id", "consensus", "disagreements", "proposals",
               "minority_opinions", "open_questions", "revision_count"],
  "properties": {
    "stage_id": {"type": "string"},
    "consensus": {
      "type": "object",
      "required": ["shared_evidence_ids", "majority_by_company"],
      "properties": {
        "shared_evidence_ids": {"type": "array", "items": {"type": "string"}},
        "majority_by_company": {"type": "object"}
      }
    },
    "disagreements": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["conflict_id", "kind", "from", "to", "company_id", "question",
                     "response_type", "resolved", "summary"]
      }
    },
    "proposals": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["proposal_id", "title", "basis", "conditions"],
        "properties": {
          "proposal_id": {"type": "string"},
          "title": {"type": "string"},
          "basis": {"type": "string"},
          "conditions": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["condition", "reason", "proposing_department", "company_id"]
            }
          }
        }
      }
    },
    "minority_opinions": {"type": "array"},
    "open_questions": {
      "type": "array",
      "items": {"type": "object", "required": ["challenge_id", "from", "to", "question"]}
    },
    "revision_count": {"type": "integer", "minimum": 0}
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: PASS（新增 4 例全过，测试文件合计 25 例）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment/core/meeting.py policytown/investment/contracts/meeting_minutes.schema.json policytown/investment/tests/test_meeting.py
git commit -m "feat(p1): meeting minutes with consensus, disagreements, proposals, minority opinions"
```

---

## Task 4: 部门质询回应 Agent（LLM 路径）

**Files:**
- Modify: `policytown/investment/agents/professional.py`（追加：`ChallengeResponderAgent`、`build_challenge_prompt`、`make_challenge_responders`、`run_challenge_responses`）
- Modify: `policytown/investment/tests/test_meeting.py`（追加 LLM 路径测试）

- [ ] **Step 1: 写失败测试（质询回应 Prompt 契约 + LLM 输出校验）**

在 `test_meeting.py` 末尾追加：

```python
from ..agents.professional import make_challenge_responders, run_challenge_responses


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
        llm = _CapturingLlm()
        responders = make_challenge_responders(llm)
        ch = {"challenge_id": "CH-S1-01", "stage_id": "S1", "company_id": "company_a",
              "kind": "recommendation_gap", "from": "economy", "to": "sci_tech",
              "question": "请说明支持依据", "evidence_ids": []}
        responses = run_challenge_responses(
            responders, [ch],
            [_memo("economy", "oppose", score=30, company_id="company_a"),
             _memo("sci_tech", "support", score=65, company_id="company_a")],
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
        class _BogusLlm:
            def __call__(self, prompt: str, validator=None) -> dict:
                return {"response_type": "nonsense"}

        responders = make_challenge_responders(_BogusLlm())
        ch = {"challenge_id": "CH-S1-02", "stage_id": "S1", "company_id": "company_a",
              "kind": "recommendation_gap", "from": "economy", "to": "sci_tech",
              "question": "请说明支持依据", "evidence_ids": []}
        memo = _memo("sci_tech", "support", score=65, confidence=0.65, company_id="company_a")
        responses = run_challenge_responses(
            responders, [ch], [_memo("economy", "oppose", score=30, company_id="company_a"), memo],
            {"market": {}, "city": {"budget_points": 100}})
        self.assertEqual(responses[0]["response_type"], "soften")   # 走确定性 fallback
        validate_challenge_response(responses[0])
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: FAIL（`make_challenge_responders` / `run_challenge_responses` 不存在）。

- [ ] **Step 3: agents/professional.py 追加质询回应 Agent**

在文件末尾追加：

```python
def build_challenge_prompt(payload: dict, role: str) -> str:
    import json as _json
    ch = payload["challenge"]
    facts = _json.dumps({"challenge": ch, "memo": payload["memo"]},
                        ensure_ascii=False, default=str)
    example = {
        "response_id": "RESP-01", "challenge_id": ch["challenge_id"],
        "stage_id": ch["stage_id"], "from": ch["to"], "to": ch["from"],
        "response_type": "soften",
        "statement": "部分接受质询：维持基本立场，但接受对方条件约束",
        "evidence_ids": ["EVID-001"], "confidence": 0.6,
    }
    return (
        "【角色与边界】你是%s。你是被质询部门，只能输出结构化质询回应 JSON 对象。\n"
        "你可以维持（maintain）、软化（soften）、改变（change）立场，"
        "或承认材料不足（concede_insufficient）；回应必须引用证据或明确声明缺失；"
        "禁止修改任何数值；禁止使用截止日之后的信息；禁止发明示例之外的其他字段。\n"
        "【当前事实（只读，禁止修改）】%s\n"
        "【输出契约】只输出一个 JSON 对象，必须严格遵循以下结构（response_type 只能是 "
        "maintain / soften / change / concede_insufficient）：\n%s"
        % (role, facts, _json.dumps(example, ensure_ascii=False, indent=1))
    )


class ChallengeResponderAgent(BaseAgent):
    """被质询部门 Agent：固定质询回应契约 + 质询 Prompt（只读，不改数值）。"""

    def __init__(self, role: str,
                 llm_fn: Optional[Callable[[str], dict]] = None) -> None:
        super().__init__(role=role, llm_fn=llm_fn,
                         required_keys=["response_id", "challenge_id", "stage_id",
                                        "from", "to", "response_type", "statement",
                                        "evidence_ids", "confidence"],
                         deep_validator=validate_challenge_response)

    def build_prompt(self, payload: dict) -> str:
        return build_challenge_prompt(payload, self.role)


def make_challenge_responders(llm_fn: Optional[Callable[[str], dict]] = None) -> dict:
    return {k: ChallengeResponderAgent(role=_ROLE_NAMES[k] + "（被质询回应）", llm_fn=llm_fn)
            for k in KINDS}


def run_challenge_responses(responders: dict, challenges: List[dict],
                            memoranda: List[dict], ctx: dict) -> List[dict]:
    """每个挑战触发一次定向质询回应：LLM 优先，超时/校验失败回退确定性规则。"""
    from ..core.meeting import find_memorandum
    from ..core.context import slim_context
    from ..fallback import deterministic as _det

    def _respond(ch: dict) -> dict:
        memo = find_memorandum(memoranda, ch["to"], ch["company_id"]) or {}
        slim = slim_context(ctx, ch["to"], ch["company_id"] or "")
        out = responders[ch["to"]].run(
            {"challenge": ch, "memo": memo, "ctx": slim},
            lambda: _det.challenge_response(ch, memo, ctx),
            validator=validate_challenge_response)
        # 身份以挑战为准：回应方 = 被质询方
        out["from"] = ch["to"]
        out["to"] = ch["from"]
        return out

    with ThreadPoolExecutor(max_workers=min(4, len(challenges))) as pool:
        return list(pool.map(_respond, challenges))
```

并在文件顶部 import 追加 `validate_challenge_response`：

```python
from ..core.meeting import validate_challenge_response
```

- [ ] **Step 4: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: PASS（新增 2 例）。

- [ ] **Step 5: 全量回归**

Run: `python3 -m unittest discover -s policytown/investment/tests -t .`
Expected: 全部 PASS（既有 40+ 例不受影响）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment/agents/professional.py policytown/investment/tests/test_meeting.py
git commit -m "feat(p1): challenge responder agent with llm + deterministic fallback"
```

---

## Task 5: 编排器接线（open_stage/submit_decisions 输出）+ 回归

**Files:**
- Modify: `policytown/investment/core/orchestrator.py`
- Modify: `policytown/investment/tests/test_meeting.py`（追加编排器集成测试）

- [ ] **Step 1: 写失败测试（视图键、真实 S1 数据冲突非空、确定性）**

在 `test_meeting.py` 末尾追加：

```python
from ..core.orchestrator import Orchestrator
import json as _json
import os

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "hefei_mvp")
_STAGES = {s["stage_id"]: s for s in
           _json.load(open(os.path.join(_DATA_DIR, "stages.json"), encoding="utf-8"))["stages"]}


def _open_view(company_ids):
    orch = Orchestrator(seed=42)
    orch.start(company_ids, "S1")
    return orch.open_stage()


class TestOrchestratorCommunication(unittest.TestCase):
    def test_open_stage_has_communication_and_minutes(self):
        view = _open_view(["proto_a", "proto_d"])
        self.assertIn("department_communication", view)
        self.assertIn("meeting_minutes", view)
        comm = view["department_communication"]
        self.assertIn("conflicts", comm)
        self.assertIn("challenges", comm)
        self.assertIn("responses", comm)
        self.assertIn("position_revisions", comm)
        minutes = view["meeting_minutes"]
        validate_minutes(minutes)
        self.assertGreaterEqual(len(minutes["proposals"]), 2)

    def test_real_s1_data_produces_conflicts(self):
        view = _open_view(["proto_a", "proto_d"])
        challenges = view["department_communication"]["challenges"]
        self.assertTrue(challenges, "真实 S1 数据必须产生定向质询")
        for ch in challenges:
            validate_challenge(ch)
        self.assertLessEqual(len(challenges), 6)
        # 冲突只存在于部门之间，无第五部门
        parties = {ch["from"] for ch in challenges} | {ch["to"] for ch in challenges}
        self.assertLessEqual(parties, {"fiscal", "economy", "sci_tech", "development"})

    def test_communication_deterministic(self):
        v1 = _open_view(["proto_a", "proto_d"])
        v2 = _open_view(["proto_a", "proto_d"])
        for key in ("department_communication", "meeting_minutes"):
            self.assertEqual(_json.dumps(v1[key], sort_keys=True),
                             _json.dumps(v2[key], sort_keys=True), key)

    def test_submit_decisions_keeps_communication(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        view = orch.open_stage()
        decisions = [{"company_id": "company_a", "action": "invest",
                      "capital_points": 30.0}]
        result = orch.submit_decisions(decisions)
        self.assertIn("department_communication", result)
        self.assertIn("meeting_minutes", result)
        self.assertEqual(result["meeting_minutes"]["stage_id"], "S1")
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_meeting -v`
Expected: FAIL（`department_communication` 键不存在）。

- [ ] **Step 3: 修改 core/orchestrator.py**

**3a.** 顶部 import 追加：

```python
from .meeting import (build_challenges, detect_conflicts, find_memorandum,
                      make_minutes, position_revision)
from ..agents.professional import (make_challenge_responders, make_professional_agents,
                                   run_assessments, run_challenge_responses)
```

（替换现有的 `from ..agents.professional import make_professional_agents, run_assessments` 一行。）

**3b.** `__init__` 中新增 responder agents：

```python
self.pro_agents = make_professional_agents(llm_fn)
self.responder_agents = make_challenge_responders(llm_fn)
```

**3c.** 新增私有方法 `_communicate`（放在 `_state` 之前）：

```python
def _communicate(self, assessments: List[dict], ctx: dict) -> dict:
    """P1：冲突识别 → 一轮定向质询 → 立场修订 → 会议纪要（全部只读记录）。"""
    st = self._state()
    conflicts = detect_conflicts(assessments, st.stage_id)
    challenges = build_challenges(conflicts, st.stage_id)
    responses = run_challenge_responses(self.responder_agents, challenges,
                                        assessments, ctx)
    revisions = []
    for ch, resp in zip(challenges, responses):
        rev = position_revision(
            ch, find_memorandum(assessments, ch["to"], ch["company_id"]) or {},
            find_memorandum(assessments, ch["from"], ch["company_id"]) or {},
            resp)
        if rev is not None:
            revisions.append(rev)
    minutes = make_minutes(assessments, challenges, responses, revisions, st.stage_id)
    return {"conflicts": conflicts, "challenges": challenges,
            "responses": responses, "position_revisions": revisions,
            "minutes": minutes}
```

**3d.** `open_stage` 改为：

```python
def open_stage(self) -> dict:
    st = self._state()
    stage = self.stages[st.stage_id]
    ctx = build_context(st, self.inbox, stage["events"])
    assessments = run_assessments(self.pro_agents, ctx)
    communication = self._communicate(assessments, ctx)
    graph = project(st, self.inbox, stage["events"])
    self._pending_view = {"context": ctx, "assessments": assessments,
                          "communication": communication}
    return {"stage": {"stage_id": st.stage_id, "label": stage["label"],
                      "window": stage["window"], "core_tension": stage["core_tension"]},
            "context": ctx, "department_memoranda": assessments,
            "department_communication": communication,
            "meeting_minutes": communication["minutes"],
            "graph_view": graph}
```

**3e.** `submit_decisions` 改为（视图重建路径补 communication）：

```python
def submit_decisions(self, decisions: List[dict]) -> dict:
    st = self._state()
    stage = self.stages[st.stage_id]
    view = self._pending_view or {"context": build_context(st, self.inbox, stage["events"]),
                                  "assessments": run_assessments(self.pro_agents, self._ctx())}
    if "communication" not in view:
        view["communication"] = self._communicate(view["assessments"], view["context"])
    ctx = view["context"]
    ...
```

并在返回 output 中追加两个键（`"department_memoranda"` 之后）：

```python
        "department_communication": view["communication"],
        "meeting_minutes": view["communication"]["minutes"],
```

- [ ] **Step 4: 运行确认通过 + 全量回归 + 端到端演示**

Run:
```bash
python3 -m unittest discover -s policytown/investment/tests -t .
cd policytown/investment && python3 run_demo.py
```
Expected: 全部 PASS；`run_demo.py` 正常跑完四轮（预算守恒、终局评分正常，P1 改动不影响结算数值：`position_revisions` 不进入 `engine.settle`）。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment/core/orchestrator.py policytown/investment/tests/test_meeting.py
git commit -m "feat(p1): wire auditable department communication into orchestrator view"
```

---

## 自检清单（对照《产品文档》§12 P1 与 §9 验证表）

| 产品要求 | 落地任务 |
| --- | --- |
| 建立冲突识别规则 | Task 1：`detect_conflicts` 三条规则 + 每企业限 2 + 全局限 6 |
| 定向 Challenge / Response | Task 2/4：`build_challenges` + 确定性回应 + LLM 回应 Agent |
| PositionRevision 保存立场变化原因 | Task 2：`position_revision`（before/after/触发证据/原因） |
| 含多方案和少数意见的会议纪要 | Task 3：`make_minutes`（共识/分歧/≥2 方案/少数意见/待查问题） |
| 一轮质询、部门间不自由聊天 | 每冲突恰一条挑战，无多轮追问 |
| 不强制共识（分歧保真） | `minority_opinions` 保留与多数不同的立场 |
| 沟通因果性（§9） | 回应→修订→纪要链路可解释；测试覆盖四种回应路径 |
| 确定性/可复现（§9） | 冲突/质询/修订/纪要全为纯函数，集成测试断言 JSON 相等 |

**明确不做（P2 范围）：** 玩家选择/修改/拒绝联席方案；采纳条件进入规则引擎；结算页展示部门条件影响。
