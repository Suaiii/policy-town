# P1.5 + P2 紧凑政企协商与玩家决策接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现《产品文档》第 12 节 P1.5（紧凑政企协商：核验问题卡 → 企业策略性回应 → 政府条件单 → 一次性反提案 → 承诺账写入）与 P2（联席研判接入玩家决策：方案选择/修改/拒绝 → 仅采纳的结构化条件进入规则引擎 → 结算页展示部门条件影响）。

**Architecture:** 全部改动在 `policytown/investment/` 内。新增纯确定性模块 `core/questions.py`（问题卡生成）与 `core/negotiation.py`（条件分类器、方案→条件单映射、判断账更新、校验器）；协商编排挂在 `core/orchestrator.py` 新增方法上（`request_verification` / `submit_conditions` / `finalize_negotiation` / `apply_plan`），企业回应与反提案复用 P0.5 的 `CompanyAgent.respond_to_verification` / `make_counter_proposal`（LLM + 确定性 fallback 双轨已就绪）。承诺账写入 `WorldState.government_commitments`（政方）+ 企业 `memory.commitments`（企方），判断账按协商结果更新（bounded_evidence_blend_v1）。P2 的"采纳门禁"由 `finalize_negotiation` 独占引擎入口保证：未确认的方案/条件单不产生任何 decisions。

**Tech Stack:** Python 3.9+（stdlib only）、unittest、既有 `contracts/*.schema.json` 契约目录。

**前置依赖（P1 另一会话计划完成后）：** `core/meeting.py`（`detect_conflicts` / `build_challenges` / `position_revision` / `make_minutes` / `validate_minutes`）、`agents/professional.py`（`ChallengeResponderAgent` / `run_challenge_responses`）、`orchestrator.open_stage()` 已输出 `department_communication`（conflicts/challenges/responses/position_revisions/minutes）与 `meeting_minutes`（`proposals` ≥2，条件形如 `{condition, reason, proposing_department, company_id}`）；P0.5 已就绪：`CompanyAgent.respond_to_verification` / `make_counter_proposal`、`EnterpriseMemory`（beliefs/commitments）、`key_proposition.verification_questions`。

---

## 文件结构

```
policytown/investment/
├── core/
│   ├── questions.py                 # 新建：核验问题卡生成（纯确定性）
│   ├── negotiation.py               # 新建：条件分类器 + 方案→条件单 + 判断账更新 + 校验器
│   ├── state.py                     # 修改：WorldState 挂 government_commitments（CommitmentLedger）
│   ├── context.py                   # 修改：Context 暴露 government_commitments
│   └── orchestrator.py              # 修改：协商四方法 + 方案适配 + 承诺写入 + 协商轨迹
├── contracts/
│   ├── question_card.schema.json    # 新建
│   ├── condition_sheet.schema.json  # 新建
│   └── context.schema.json          # 修改：government_commitments
├── run_demo_negotiation.py          # 新建：政企协商端到端演示
└── tests/
    ├── test_questions.py            # 新建：问题卡生成测试
    ├── test_negotiation_flow.py     # 新建：协商回合 + 承诺账 + 判断账测试
    ├── test_plan_selection.py       # 新建：P2 方案选择/门禁/影响映射测试
    └── test_smoke.py                # 修改：全链路玩家循环回归
```

---

## Part B（P1.5）紧凑政企协商

### Task 1: 核验问题卡生成（question cards）

**Files:**
- Create: `policytown/investment/core/questions.py`
- Create: `policytown/investment/contracts/question_card.schema.json`
- Create: `policytown/investment/tests/test_questions.py`

- [ ] **Step 1: 写失败测试（关键命题卡片优先、部门缺口兜底、每企业限 2、确定性）**

```python
"""核验问题卡生成测试（文档 4.6 / 8.6）。

铁律：
1. 核心案例优先用关键未穿透项问题（key_proposition.verification_questions）；
2. 非核心/缺口补充用部门备忘录 missing_info severity=high 生成兜底卡片；
3. 每企业每轮最多 2 张；同 memoranda + enterprises → 同卡片序列（确定性）。
"""
from __future__ import annotations

import json
import os
import unittest

from ..core.questions import build_question_cards, validate_question_card, _MAX_PER_COMPANY


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "data", "hefei_mvp")
ENTERPRISES = {e["prototype_id"]: e for e in
               json.load(open(os.path.join(DATA_DIR, "enterprise_agents.json"),
                              encoding="utf-8"))["enterprises"]}


def _memo(agent, company_id="company_a", missing=None):
    return {"agent": agent, "department": agent, "company_id": company_id,
            "recommendation": "conditional_support", "direction": "neutral",
            "score": 50, "confidence": 0.6,
            "core_claims": [], "red_lines": [], "acceptable_conditions": [],
            "missing_info": missing or [], "key_factors": [], "evidence_ids": [],
            "reasoning_summary": ""}


class TestQuestionCards(unittest.TestCase):
    def test_core_case_uses_key_proposition(self):
        cards = build_question_cards([_memo("sci_tech")], ENTERPRISES, "S1")
        mine = [c for c in cards if c["company_id"] == "company_a"]
        self.assertEqual(len(mine), 2)
        self.assertTrue(all(c["source"] == "key_proposition" for c in mine))
        self.assertEqual(mine[0]["question"],
                         ENTERPRISES["proto_a"]["key_proposition"]["verification_questions"][0]["question"])
        for c in cards:
            validate_question_card(c)

    def test_gap_card_from_high_missing(self):
        memos = [_memo("sci_tech", "company_d",
                       missing=[{"info_id": "T-M1", "severity": "high",
                                 "description": "量产数据缺失", "impact": "未证实"}])]
        cards = build_question_cards(memos, ENTERPRISES, "S1")
        mine = [c for c in cards if c["company_id"] == "company_d"]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["source"], "department_gap")
        self.assertIn("量产数据缺失", mine[0]["question"])

    def test_medium_missing_does_not_spawn_card(self):
        memos = [_memo("economy", "company_d",
                       missing=[{"info_id": "E-M1", "severity": "medium",
                                 "description": "供应链测算缺失", "impact": "高估"}])]
        self.assertEqual(build_question_cards(memos, ENTERPRISES, "S1"), [])

    def test_per_company_cap(self):
        # 3 家 high 缺失 + 2 张关键命题卡 → 每企业仍最多 2 张
        memos = [_memo("sci_tech", "company_a",
                       missing=[{"info_id": "X", "severity": "high",
                                 "description": "缺口1", "impact": "i"}]),
                 _memo("sci_tech", "company_d",
                       missing=[{"info_id": "X", "severity": "high",
                                 "description": "缺口1", "impact": "i"}]),
                 _memo("sci_tech", "company_b",
                       missing=[{"info_id": "X", "severity": "high",
                                 "description": "缺口1", "impact": "i"}])]
        cards = build_question_cards(memos, ENTERPRISES, "S1")
        for cid in ("company_a", "company_d", "company_b"):
            self.assertLessEqual(len([c for c in cards if c["company_id"] == cid]),
                                 _MAX_PER_COMPANY)

    def test_deterministic(self):
        memos = [_memo("sci_tech", "company_d",
                       missing=[{"info_id": "T-M1", "severity": "high",
                                 "description": "量产数据缺失", "impact": "未证实"}]),
                 _memo("economy", "company_a")]
        a = json.dumps(build_question_cards(memos, ENTERPRISES, "S1"), sort_keys=True)
        b = json.dumps(build_question_cards(memos, ENTERPRISES, "S1"), sort_keys=True)
        self.assertEqual(a, b)

    def test_card_ids_are_stage_scoped(self):
        cards = build_question_cards([_memo("sci_tech")], ENTERPRISES, "S2")
        self.assertTrue(all(c["card_id"].startswith("CARD-S2-") for c in cards))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_questions -v`
Expected: FAIL（`core.questions` 不存在）。

- [ ] **Step 3: 新建 core/questions.py**

```python
"""核验问题卡生成（文档 4.6 / P1.5）。

卡片来源（按优先级）：
1. 核心案例关键未穿透项（enterprise_agents.json key_proposition.verification_questions）；
2. 部门备忘录 missing_info severity=high 的兜底问题（非核心案例/额外缺口）。
纯确定性：同 memoranda + enterprises → 同卡片序列。每企业每轮最多 2 张。
"""
from __future__ import annotations

from typing import Dict, List

_MAX_PER_COMPANY = 2
_CARD_SOURCES = ("key_proposition", "department_gap")

_REQUIRED_CARD = ["card_id", "company_id", "question", "targets", "source"]


def build_question_cards(memoranda: List[dict], enterprises: Dict[str, dict],
                         stage_id: str = "S1") -> List[dict]:
    """为每家企业生成核验问题卡：关键命题问题优先，缺失信息问题兜底。"""
    cards: List[dict] = []
    seq = 0
    by_company: Dict[str, List[dict]] = {}
    for m in memoranda:
        cid = m.get("company_id")
        if cid:
            by_company.setdefault(cid, []).append(m)
    for cid in sorted(by_company):
        proto_id = "proto_%s" % cid.split("_")[-1]
        ent = enterprises.get(proto_id) or {}
        kp = ent.get("key_proposition") or {}
        for q in kp.get("verification_questions", []):
            if len([c for c in cards if c["company_id"] == cid]) >= _MAX_PER_COMPANY:
                break
            seq += 1
            cards.append({
                "card_id": "CARD-%s-%02d" % (stage_id, seq),
                "company_id": cid,
                "question": q["question"],
                "targets": list(q.get("targets", [])),
                "source": "key_proposition",
                "proposition_id": kp.get("proposition_id", ""),
            })
        if len([c for c in cards if c["company_id"] == cid]) >= _MAX_PER_COMPANY:
            continue
        for m in by_company[cid]:
            for mi in m.get("missing_info", []):
                if mi.get("severity") != "high":
                    continue
                if len([c for c in cards if c["company_id"] == cid]) >= _MAX_PER_COMPANY:
                    break
                seq += 1
                cards.append({
                    "card_id": "CARD-%s-%02d" % (stage_id, seq),
                    "company_id": cid,
                    "question": "请说明「%s」的核实情况与影响评估（部门关注）。"
                                % mi["description"],
                    "targets": [],
                    "source": "department_gap",
                    "department": m["agent"],
                })
    return cards


def validate_question_card(card: dict) -> None:
    missing = [k for k in _REQUIRED_CARD if k not in card]
    if missing:
        raise ValueError("question card missing keys: %s" % missing)
    if card.get("source") not in _CARD_SOURCES:
        raise ValueError("invalid card source: %r" % card.get("source"))
    if not card.get("question", "").strip():
        raise ValueError("card without question")
```

- [ ] **Step 4: 新建 contracts/question_card.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.3/question_card",
  "title": "QuestionCard v0.3 — 关键核验问题卡（文档 4.6）",
  "description": "玩家每轮选择一张；卡片来自关键未穿透项或部门 high 级缺失信息。",
  "type": "object",
  "required": ["card_id", "company_id", "question", "targets", "source"],
  "properties": {
    "card_id": {"type": "string"},
    "company_id": {"type": "string"},
    "question": {"type": "string"},
    "targets": {"type": "array", "items": {"type": "string"}},
    "source": {"type": "string", "enum": ["key_proposition", "department_gap"]},
    "proposition_id": {"type": "string"},
    "department": {"type": "string"}
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_questions -v`
Expected: PASS（6 例）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment/core/questions.py policytown/investment/contracts/question_card.schema.json policytown/investment/tests/test_questions.py
git commit -m "feat(p1.5): verification question card generation"
```

---

### Task 2: 政府条件单契约 + 条件关键词分类器

**Files:**
- Create: `policytown/investment/core/negotiation.py`（本任务加：`_KEYWORDS`、`classify_conditions`、`_REQUIRED_SHEET`、`_SUPPORT_FOCUS`、`_RISK_ITEMS`、`validate_condition_sheet`）
- Create: `policytown/investment/contracts/condition_sheet.schema.json`
- Create: `policytown/investment/tests/test_negotiation_flow.py`

- [ ] **Step 1: 写失败测试（条件分类 + 条件单校验）**

```python
"""政企协商回合测试（P1.5：问题卡 → 回应 → 条件单 → 反提案 → 承诺账）。

铁律：
1. 条件分类器是纯函数：同条件文本 → 同风险条件集合；
2. 条件单是结构化契约：自由文本意见不能直接改数值（文档 4.6）；
3. 承诺写入后机器可读（CommitmentRecord），判断账按 bounded_evidence_blend_v1 更新。
"""
from __future__ import annotations

import json
import unittest

from ..core.negotiation import (classify_conditions, validate_condition_sheet)


class TestConditionClassifier(unittest.TestCase):
    def test_tranches_and_milestones(self):
        conds = ["分期拨付，首期不超过 50%", "按建设里程碑绑定放款"]
        self.assertEqual(classify_conditions(conds), ["tranches", "milestones"])

    def test_exit_and_follow_on_cap(self):
        conds = ["保留退出条款", "追加不超过财政上限"]
        self.assertEqual(classify_conditions(conds), ["exit_terms", "follow_on_cap"])

    def test_empty_and_unknown(self):
        self.assertEqual(classify_conditions([]), [])
        self.assertEqual(classify_conditions(["正常推进"]), [])

    def test_dedup(self):
        self.assertEqual(classify_conditions(["分期拨付", "首期先付 30%"]), ["tranches"])


class TestConditionSheetValidator(unittest.TestCase):
    def _sheet(self):
        return {"sheet_id": "CS-S1-001", "company_id": "company_a",
                "capital_points": 40, "support_focus": "infrastructure",
                "milestone_due": "S2",
                "risk_conditions": ["tranches", "milestones"]}

    def test_valid_sheet_passes(self):
        validate_condition_sheet(self._sheet())  # 不抛异常即通过

    def test_bad_focus_rejected(self):
        s = self._sheet()
        s["support_focus"] = "magic"
        with self.assertRaises(ValueError):
            validate_condition_sheet(s)

    def test_bad_risk_item_rejected(self):
        s = self._sheet()
        s["risk_conditions"] = ["nonsense"]
        with self.assertRaises(ValueError):
            validate_condition_sheet(s)

    def test_negative_capital_rejected(self):
        s = self._sheet()
        s["capital_points"] = -5
        with self.assertRaises(ValueError):
            validate_condition_sheet(s)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation_flow -v`
Expected: FAIL（`core.negotiation` 不存在）。

- [ ] **Step 3: 新建 core/negotiation.py（本任务部分）**

```python
"""政企协商纯逻辑（文档 4.6 / P1.5 / P2）。

- classify_conditions：把会议纪要/条件单中的自由文本条件映射为结构化风险条件；
- build_sheets_from_plan：联席方案（meeting_minutes.proposals）→ 政府条件单草稿；
- update_beliefs_*：协商结果按 bounded_evidence_blend_v1 更新企业判断账；
- validate_*：条件单/确认/方案适配的契约校验器。

纯确定性：同输入 → 同输出；协商层不修改任何数值，数值只由规则引擎结算。
"""
from __future__ import annotations

from typing import Dict, List, Optional

_SUPPORT_FOCUS = ("infrastructure", "talent", "supply_chain", "financing")
_RISK_ITEMS = ("tranches", "milestones", "audit", "exit_terms", "follow_on_cap", "fund_proof")

_REQUIRED_SHEET = ["sheet_id", "company_id", "capital_points",
                   "support_focus", "risk_conditions"]

_KEYWORDS = {
    "tranches": ("分期", "首期"),
    "milestones": ("里程碑", "节点", "放款"),
    "audit": ("审计", "资金证明", "同比例"),
    "exit_terms": ("退出", "暂停追加"),
    "follow_on_cap": ("追加", "上限"),
    "fund_proof": ("资金证明", "同比例出资"),
}


def classify_conditions(conditions: List[str]) -> List[str]:
    """自由文本条件 → 结构化风险条件（去重，按 _KEYWORDS 声明顺序稳定）。"""
    out: List[str] = []
    for cond in conditions:
        for key, kws in _KEYWORDS.items():
            if key not in out and any(k in cond for k in kws):
                out.append(key)
    return out


def validate_condition_sheet(sheet: dict) -> None:
    missing = [k for k in _REQUIRED_SHEET if k not in sheet]
    if missing:
        raise ValueError("condition sheet missing keys: %s" % missing)
    if sheet.get("support_focus") not in _SUPPORT_FOCUS:
        raise ValueError("invalid support_focus: %r" % sheet.get("support_focus"))
    if float(sheet.get("capital_points", 0)) < 0:
        raise ValueError("negative capital_points")
    for item in sheet.get("risk_conditions", []):
        if item not in _RISK_ITEMS:
            raise ValueError("invalid risk_condition: %r" % item)
```

- [ ] **Step 4: 新建 contracts/condition_sheet.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.3/condition_sheet",
  "title": "ConditionSheet v0.3 — 政府条件单（文档 4.6）",
  "description": "玩家结构化政府方案：投入、城市支持与风险条件。自由文本意见不能直接修改数值。",
  "type": "object",
  "required": ["sheet_id", "company_id", "capital_points", "support_focus", "risk_conditions"],
  "properties": {
    "sheet_id": {"type": "string"},
    "company_id": {"type": "string"},
    "capital_points": {"type": "number", "minimum": 0},
    "support_focus": {"type": "string",
                      "enum": ["infrastructure", "talent", "supply_chain", "financing"]},
    "milestone_due": {"type": "string"},
    "risk_conditions": {
      "type": "array",
      "items": {"type": "string",
                "enum": ["tranches", "milestones", "audit", "exit_terms",
                         "follow_on_cap", "fund_proof"]}
    },
    "exit_terms": {
      "type": ["object", "null"],
      "properties": {
        "trigger": {"type": "string"},
        "recovery": {"type": "number", "minimum": 0, "maximum": 1}
      }
    }
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation_flow -v`
Expected: PASS（8 例）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment/core/negotiation.py policytown/investment/contracts/condition_sheet.schema.json policytown/investment/tests/test_negotiation_flow.py
git commit -m "feat(p1.5): condition sheet contract + keyword classifier"
```

---

### Task 3: 协商回合编排（request_verification / submit_conditions / finalize 骨架）

**Files:**
- Modify: `policytown/investment/core/orchestrator.py`
- Modify: `policytown/investment/tests/test_negotiation_flow.py`

- [ ] **Step 1: 写失败测试（open_stage 含问题卡；三方法链路：回应→反提案→确认）**

在 `test_negotiation_flow.py` 末尾追加：

```python
from ..core.orchestrator import Orchestrator


def _start(company_ids=("proto_a", "proto_d")):
    orch = Orchestrator(seed=42)
    orch.start(list(company_ids), "S1")
    view = orch.open_stage()
    return orch, view


class TestNegotiationRound(unittest.TestCase):
    def test_open_stage_has_question_cards(self):
        orch, view = _start()
        cards = view["question_cards"]
        self.assertTrue(cards, "S1 必须生成问题卡")
        by_company = {c["company_id"] for c in cards}
        self.assertLessEqual(by_company, {"company_a", "company_d"})
        self.assertIn("company_a", by_company, "核心案例关键命题卡必须在场")

    def test_request_verification_returns_response(self):
        from ..core.negotiation import validate_condition_sheet
        orch, view = _start()
        card = next(c for c in view["question_cards"] if c["company_id"] == "company_a")
        out = orch.request_verification(card["card_id"])
        self.assertEqual(out["card"]["card_id"], card["card_id"])
        resp = out["verification_response"]
        self.assertEqual(resp["company_id"], "company_a")
        self.assertEqual(resp["question_id"], card["card_id"])
        self.assertIn(resp["response_type"],
                      ("full_disclosure", "partial_disclosure", "range",
                       "refusal", "condition_offer"))

    def test_submit_conditions_returns_counter_proposals(self):
        orch, view = _start()
        sheets = [{"sheet_id": "CS-S1-001", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "milestone_due": "S2", "risk_conditions": ["tranches"]}]
        out = orch.submit_conditions(sheets)
        prop = out["counter_proposals"]["company_a"]
        self.assertIsNotNone(prop)
        self.assertEqual(prop["company_id"], "company_a")
        self.assertTrue(prop["proposal_id"].startswith("CP-"))

    def test_finalize_negotiation_settles(self):
        orch, view = _start()
        sheets = [{"sheet_id": "CS-S1-001", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "milestone_due": "S2", "risk_conditions": ["tranches"]}]
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation(
            {"company_a": {"action": "accept"}})
        self.assertEqual(result["stage_id"], "S1")
        self.assertIn("negotiation", result)
        self.assertGreaterEqual(result["budget"]["spent"], 0)
        # 引擎只看到确认后的条件
        self.assertEqual(result["negotiation"]["company_a"]["final_action"], "accept")
        self.assertNotIn("company_d", result["negotiation"])

    def test_unknown_card_rejected(self):
        orch, _ = _start()
        with self.assertRaises(ValueError):
            orch.request_verification("CARD-S1-99")
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation_flow -v`
Expected: FAIL（`question_cards` 键与 `request_verification` 等不存在）。

- [ ] **Step 3: 修改 core/orchestrator.py**

**3a.** 顶部 import 追加：

```python
from .questions import build_question_cards, validate_question_card
from .negotiation import validate_condition_sheet
from ..memory.commitment_ledger import CommitmentRecord
```

**3b.** `__init__` 追加状态字段：

```python
        self._verifications: Dict[str, dict] = {}
        self._pending_sheets: List[dict] = []
        self._last_deltas: List[dict] = []
```

**3c.** `open_stage`：在返回 dict 中追加 `"question_cards"`，并把卡片存进 `_pending_view`：

```python
        cards = build_question_cards(assessments, self.enterprises, st.stage_id)
        for c in cards:
            validate_question_card(c)
        self._pending_view = {"context": ctx, "assessments": assessments,
                              "communication": communication,
                              "question_cards": cards}
        return {"stage": ..., "context": ctx, "department_memoranda": assessments,
                "department_communication": communication,
                "meeting_minutes": communication["minutes"],
                "question_cards": cards,
                "graph_view": graph}
```

**3d.** 新增三个协商方法（放在 `submit_decisions` 之后）：

```python
    # ---------- P1.5：紧凑政企协商 ----------

    def request_verification(self, card_id: str) -> dict:
        """玩家选择一张问题卡 → 企业实时回应（一次 LLM 调用；断网走 fallback）。"""
        st = self._state()
        view = self._pending_view or self._stage_view(st)
        card = next((c for c in view["question_cards"] if c["card_id"] == card_id), None)
        if card is None:
            raise ValueError("unknown question card: %s" % card_id)
        agent = self.company_agents[card["company_id"]]
        company_view = next(c for c in view["context"]["companies"]
                            if c["company_id"] == card["company_id"])
        question = {"question_id": card["card_id"], "question": card["question"],
                    "targets": card.get("targets", [])}
        resp = agent.respond_to_verification(question, company_view, view["context"])
        self._verifications[st.stage_id] = resp
        return {"card": card, "verification_response": resp}

    def submit_conditions(self, sheets: List[dict]) -> dict:
        """玩家提交政府条件单 → 每家企业一次性反提案（一次 LLM 调用/家）。"""
        st = self._state()
        view = self._pending_view or self._stage_view(st)
        for s in sheets:
            validate_condition_sheet(s)
        proposals: Dict[str, Optional[dict]] = {}
        for sheet in sheets:
            cid = sheet["company_id"]
            agent = self.company_agents[cid]
            company_view = next(c for c in view["context"]["companies"]
                                if c["company_id"] == cid)
            conditions = {"capital_points": sheet["capital_points"],
                          "milestone_due": sheet.get("milestone_due", ""),
                          "risk_conditions": sheet.get("risk_conditions", [])}
            proposals[cid] = agent.make_counter_proposal(
                conditions, company_view, view["context"], st.stage_id)
        self._pending_sheets = sheets
        return {"counter_proposals": proposals}

    def finalize_negotiation(self, confirmations: Dict[str, dict]) -> dict:
        """玩家确认/修改/放弃反提案 → 写承诺账 → 转引擎结算。

        门禁：只有 confirmations 中 action=accept/modify 的条件单生成 decisions；
        reject 或未提及的企业不产生任何数值效果。
        """
        st = self._state()
        sheets_by_cid = {s["company_id"]: s for s in self._pending_sheets or []}
        final_sheets: List[dict] = []
        for cid, conf in confirmations.items():
            action = conf.get("action")
            if action == "accept":
                final_sheets.append(sheets_by_cid.get(cid))
            elif action == "modify":
                ms = conf.get("modified_sheet")
                validate_condition_sheet(ms)
                final_sheets.append(ms)
        final_sheets = [s for s in final_sheets if s is not None]
        decisions = [{"company_id": s["company_id"], "action": "invest",
                      "capital_points": s["capital_points"],
                      "support_focus": s["support_focus"]}
                     for s in final_sheets]
        self._write_commitments(final_sheets, st.stage_id)
        result = self.submit_decisions(decisions)
        self._last_deltas = result.get("state_deltas", [])
        result["negotiation"] = self._negotiation_trace(final_sheets, confirmations)
        return result
```

**3e.** 私有助手（`_stage_view`、`_write_commitments`、`_negotiation_trace`，放在 `_state` 之前）：

```python
    def _stage_view(self, st) -> dict:
        stage = self.stages[st.stage_id]
        ctx = build_context(st, self.inbox, stage["events"])
        assessments = run_assessments(self.pro_agents, ctx)
        communication = self._communicate(assessments, ctx)
        cards = build_question_cards(assessments, self.enterprises, st.stage_id)
        return {"context": ctx, "assessments": assessments,
                "communication": communication, "question_cards": cards}

    def _write_commitments(self, sheets: List[dict], stage_id: str) -> None:
        """政企双方承诺写入（政方 → WorldState 账，企方 → 企业 Memory 账）。"""
        st = self._state()
        idx = _STAGE_ORDER.index(stage_id)
        due = _STAGE_ORDER[idx + 1] if idx + 1 < len(_STAGE_ORDER) else stage_id
        for s in sheets:
            cid = s["company_id"]
            sheet_id = s["sheet_id"]
            cond = s.get("milestone_due") or (
                s["risk_conditions"][0] if s["risk_conditions"] else "agreement")
            st.government_commitments.add(CommitmentRecord(
                commitment_id="GOV-%s" % sheet_id, party="government",
                promise="provide_capital", due_stage=due, condition=cond,
                source_ids=[sheet_id]))
            agent = self.company_agents[cid]
            agent.memory.commitments.add(CommitmentRecord(
                commitment_id="CO-%s" % sheet_id, party=cid,
                promise="meet_conditions", due_stage=due, condition=cond,
                source_ids=[sheet_id]))
            agent.memory.beliefs.update(
                "government_fulfillment", signal=0.85, signal_weight=0.4,
                stage_id=stage_id, evidence_ids=[sheet_id])

    def _negotiation_trace(self, final_sheets: List[dict],
                           confirmations: Dict[str, dict]) -> dict:
        by_cid = {s["company_id"]: s for s in final_sheets}
        trace: Dict[str, dict] = {}
        for cid, conf in confirmations.items():
            sheet = by_cid.get(cid)
            if sheet is None:
                trace[cid] = {"final_action": "reject", "sheet": None,
                              "commitments": [], "condition_impact": []}
                continue
            deltas = [d for d in self._last_deltas if d.get("company_id") == cid]
            impacts = []
            for cond in sheet.get("risk_conditions", []):
                impacts.append({"condition": cond,
                                "affected_metrics": sorted({d["metric_id"] for d in deltas}),
                                "reason_codes": sorted({d["reason_code"] for d in deltas})[:5]})
            trace[cid] = {"final_action": conf.get("action", "accept"), "sheet": sheet,
                          "commitments": [c.to_dict() for c in
                                          self._state().government_commitments.records
                                          if sheet["sheet_id"] in c.source_ids],
                          "condition_impact": impacts}
        return trace
```

注意：`_last_deltas` 必须在 `_negotiation_trace` 之前回填（见 3d 最终顺序：先 `submit_decisions` → 再 `self._last_deltas = result.get("state_deltas", [])` → 最后 `result["negotiation"] = self._negotiation_trace(...)`），否则 trace 中的 condition_impact 为空。

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run:
```bash
python3 -m unittest policytown.investment.tests.test_negotiation_flow policytown.investment.tests.test_smoke policytown.investment.tests.test_departments policytown.investment.tests.test_enterprise_agents policytown.investment.tests.test_private_state policytown.investment.tests.test_enterprise_memory policytown.investment.tests.test_questions -v
```
Expected: 全部 PASS（旧测试不受影响——`submit_decisions` 与 `open_stage` 既有键保持不变）。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment/core/orchestrator.py policytown/investment/tests/test_negotiation_flow.py
git commit -m "feat(p1.5): negotiation round orchestration (verify / conditions / finalize)"
```

---

### Task 4: 承诺账接线 + 判断账更新（政方账目 + Context 暴露）

**Files:**
- Modify: `policytown/investment/core/state.py`
- Modify: `policytown/investment/core/context.py`
- Modify: `policytown/investment/contracts/context.schema.json`
- Modify: `policytown/investment/core/negotiation.py`（追加判断账更新函数）
- Modify: `policytown/investment/tests/test_negotiation_flow.py`

- [ ] **Step 1: 写失败测试（政方账目入 WorldState、Context 可见、判断账随回应更新）**

在 `test_negotiation_flow.py` 末尾追加：

```python
from ..core.negotiation import update_beliefs_from_verification


class TestCommitmentAndBeliefs(unittest.TestCase):
    def test_government_commitments_in_state_and_context(self):
        orch, view = _start()
        sheets = [{"sheet_id": "CS-S1-007", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "milestone_due": "S2", "risk_conditions": ["tranches"]}]
        orch.submit_conditions(sheets)
        orch.finalize_negotiation({"company_a": {"action": "accept"}})
        st = orch._state()
        gov_records = [r for r in st.government_commitments.records
                       if "CS-S1-007" in r.source_ids]
        self.assertEqual(len(gov_records), 1)
        self.assertEqual(gov_records[0].party, "government")
        self.assertEqual(orch.company_agents["company_a"]
                         .memory.commitments.to_dict()[0]["promise"], "meet_conditions")
        # Context 暴露政方承诺（公开：政府自己的承诺）
        view2 = orch.open_stage()
        blob = json.dumps(view2["context"].get("government_commitments", []),
                          ensure_ascii=False)
        self.assertIn("CS-S1-007", blob)

    def test_belief_updated_after_finalize(self):
        orch, view = _start()
        sheets = [{"sheet_id": "CS-S1-008", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": ["milestones"]}]
        orch.submit_conditions(sheets)
        before = orch.company_agents["company_a"].memory.beliefs \
            .get("government_fulfillment").value
        orch.finalize_negotiation({"company_a": {"action": "accept"}})
        after = orch.company_agents["company_a"].memory.beliefs \
            .get("government_fulfillment").value
        self.assertGreater(after, before, "政府履约信念必须随承诺上调")

    def test_belief_from_verification_response(self):
        orch, view = _start()
        card = next(c for c in view["question_cards"] if c["company_id"] == "company_a")
        orch.request_verification(card["card_id"])
        resp = orch._verifications["S1"]
        agent = orch.company_agents["company_a"]
        before = agent.memory.beliefs.get("financing_continuity").value
        update_beliefs_from_verification(agent, resp, "S1")
        after = agent.memory.beliefs.get("financing_continuity").value
        # full_disclosure(0.85) 应上调；refusal(0.25) 应下调
        if resp["response_type"] == "refusal":
            self.assertLess(after, before)
        else:
            self.assertGreater(after, before)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation_flow -v`
Expected: FAIL（`government_commitments` 字段不存在 / `update_beliefs_from_verification` 不存在）。

- [ ] **Step 3: state.py — WorldState 挂政方承诺账**

`WorldState` dataclass 追加字段（`fact_graph` 之后）：

```python
    government_commitments: "CommitmentLedger" = field(default_factory=CommitmentLedger)
```

顶部导入：`from ..memory.commitment_ledger import CommitmentLedger`。

- [ ] **Step 4: context.py — 暴露政方承诺（公开）**

`build_context` 返回 dict 中追加（`"fact_graph"` 之后）：

```python
        "government_commitments": [c.to_dict() for c in state.government_commitments.records],
```

- [ ] **Step 5: contracts/context.schema.json — 追加字段**

`required` 数组追加 `"government_commitments"`；`properties` 追加：

```json
"government_commitments": {
  "type": "array",
  "description": "政府已承诺的投入与触发条件（承诺账政方侧，公开可见）",
  "items": {
    "type": "object",
    "required": ["commitment_id", "party", "promise", "due_stage", "condition", "status"],
    "properties": {
      "commitment_id": {"type": "string"},
      "party": {"type": "string"},
      "promise": {"type": "string"},
      "due_stage": {"type": "string"},
      "condition": {"type": "string"},
      "status": {"type": "string"},
      "source_ids": {"type": "array", "items": {"type": "string"}}
    }
  }
}
```

- [ ] **Step 6: negotiation.py — 追加判断账更新函数**

```python
_VERIFY_SIGNAL = {"full_disclosure": 0.85, "range": 0.65, "partial_disclosure": 0.5,
                  "condition_offer": 0.45, "refusal": 0.25}


def update_beliefs_from_verification(agent, response: dict, stage_id: str) -> None:
    """企业回应核验问题后更新融资连续性判断（bounded_evidence_blend_v1）。"""
    signal = _VERIFY_SIGNAL.get(response.get("response_type"), 0.5)
    agent.memory.beliefs.update("financing_continuity", signal=signal,
                                signal_weight=0.35, stage_id=stage_id,
                                evidence_ids=[response.get("question_id", "VQ-?")])
```

- [ ] **Step 7: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation_flow -v`
Expected: PASS（8 + 3 = 11 例）。

全量回归：既有 7 个测试模块全部通过。

- [ ] **Step 8: 提交**

```bash
git add policytown/investment/core/state.py policytown/investment/core/context.py policytown/investment/core/negotiation.py policytown/investment/contracts/context.schema.json policytown/investment/tests/test_negotiation_flow.py
git commit -m "feat(p1.5): government commitment ledger + belief updates from negotiation"
```

---

### Task 5: 协商轨迹输出（结算含协商摘要）

**Files:**
- Modify: `policytown/investment/core/orchestrator.py`
- Modify: `policytown/investment/tests/test_negotiation_flow.py`

- [ ] **Step 1: 写失败测试（协商轨迹：条件影响映射、承诺来源、拒绝路径）**

在 `test_negotiation_flow.py` 末尾追加：

```python
class TestNegotiationTrace(unittest.TestCase):
    def test_trace_has_condition_impact(self):
        orch, view = _start()
        sheets = [{"sheet_id": "CS-S1-011", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": ["tranches", "milestones"]}]
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation({"company_a": {"action": "accept"}})
        tr = result["negotiation"]["company_a"]
        self.assertEqual(tr["final_action"], "accept")
        self.assertTrue(tr["condition_impact"], "必须有关键条件的影响映射")
        for imp in tr["condition_impact"]:
            self.assertIn("condition", imp)
            self.assertIn("reason_codes", imp)
            self.assertIn("affected_metrics", imp)
        self.assertTrue(tr["commitments"], "确认后必须写入承诺")
        self.assertEqual(tr["commitments"][0]["party"], "government")

    def test_rejected_company_has_no_effect(self):
        orch, view = _start()
        sheets = [{"sheet_id": "CS-S1-012", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": []},
                  {"sheet_id": "CS-S1-013", "company_id": "company_d",
                   "capital_points": 30, "support_focus": "talent",
                   "risk_conditions": []}]
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation(
            {"company_a": {"action": "accept"}, "company_d": {"action": "reject"}})
        tr = result["negotiation"]
        self.assertEqual(tr["company_a"]["final_action"], "accept")
        self.assertEqual(tr["company_d"]["final_action"], "reject")
        self.assertIsNone(tr["company_d"]["sheet"])
        # 被拒绝企业不产生投入与承诺
        self.assertNotIn("company_d", {
            d["company_id"] for d in result["state_deltas"]})

    def test_verification_in_trace_when_performed(self):
        orch, view = _start()
        card = next(c for c in view["question_cards"] if c["company_id"] == "company_a")
        orch.request_verification(card["card_id"])
        sheets = [{"sheet_id": "CS-S1-014", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": []}]
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation({"company_a": {"action": "accept"}})
        resp = result["negotiation"]["company_a"].get("verification")
        self.assertIsNotNone(resp)
        self.assertIn("response_type", resp)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation_flow -v`
Expected: FAIL（trace 缺 `verification` / `condition_impact` 为空等）。

- [ ] **Step 3: orchestrator.py — `_negotiation_trace` 追加核验回应与承诺来源**

把 `_negotiation_trace` 中 `trace[cid] = {...}` 一行改为：

```python
            verification = self._verifications.get(self._state().stage_id)
            trace[cid] = {"final_action": conf.get("action", "accept"), "sheet": sheet,
                          "verification": verification if verification
                          and verification.get("company_id") == cid else None,
                          "commitments": [...同前...],
                          "condition_impact": impacts}
```

同时修正 `finalize_negotiation` 中 `_last_deltas` 时序（先结算、再记录 deltas、再建 trace）：

```python
        result = self.submit_decisions(decisions)
        self._last_deltas = result.get("state_deltas", [])
        result["negotiation"] = self._negotiation_trace(final_sheets, confirmations)
        return result
```

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation_flow policytown.investment.tests.test_smoke -v`
Expected: PASS（14 例 + smoke 6 例全过）。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment/core/orchestrator.py policytown/investment/tests/test_negotiation_flow.py
git commit -m "feat(p1.5): negotiation trace with condition impact in settlement"
```

---

## Part C（P2）联席研判接入玩家决策

### Task 6: 联席方案 → 政府条件单适配器

**Files:**
- Modify: `policytown/investment/core/negotiation.py`（追加 `build_sheets_from_plan`）
- Modify: `policytown/investment/core/orchestrator.py`（追加 `apply_plan`）
- Create: `policytown/investment/tests/test_plan_selection.py`

- [ ] **Step 1: 写失败测试（PLAN-A 适配、条件分类、企业映射、确定性）**

```python
"""P2 测试：联席方案接入玩家决策（文档 4.5 / P2）。

铁律：
1. apply_plan 只生成条件单草稿，不落任何状态；
2. 只有 finalize_negotiation 确认的条件进入引擎（采纳门禁）；
3. 玩家可接受/修改/拒绝联席方案。
"""
from __future__ import annotations

import json
import unittest

from ..core.negotiation import build_sheets_from_plan, validate_condition_sheet
from ..core.orchestrator import Orchestrator


def _minutes_with_plans():
    return {
        "stage_id": "S1", "consensus": {}, "disagreements": [], "minority_opinions": [],
        "open_questions": [], "revision_count": 0,
        "proposals": [
            {"proposal_id": "PLAN-A", "title": "进取支持方案", "basis": "合并支持条件",
             "conditions": [
                 {"condition": "分期拨付，首期不超过 50%", "reason": "控节奏",
                  "proposing_department": "fiscal", "company_id": "company_a"},
                 {"condition": "按建设里程碑绑定放款", "reason": "按阶段验证",
                  "proposing_department": "sci_tech", "company_id": "company_a"},
                 {"condition": "配套同步安排", "reason": "保障落地",
                  "proposing_department": "economy", "company_id": "company_d"}]},
            {"proposal_id": "PLAN-B", "title": "审慎风控方案", "basis": "红线转化",
             "conditions": [
                 {"condition": "企业资金来源未证实前不承诺后续追加上限", "reason": "防暴露",
                  "proposing_department": "fiscal", "company_id": "company_a"}]},
        ],
    }


class TestPlanToSheets(unittest.TestCase):
    def test_plan_a_maps_conditions_and_classifies(self):
        sheets = build_sheets_from_plan(_minutes_with_plans(), "PLAN-A",
                                        {"company_a": 40.0, "company_d": 20.0})
        self.assertEqual({s["company_id"] for s in sheets}, {"company_a", "company_d"})
        by_cid = {s["company_id"]: s for s in sheets}
        self.assertEqual(by_cid["company_a"]["capital_points"], 40.0)
        self.assertIn("tranches", by_cid["company_a"]["risk_conditions"])
        self.assertIn("milestones", by_cid["company_a"]["risk_conditions"])
        self.assertEqual(by_cid["company_d"]["risk_conditions"], [])
        for s in sheets:
            validate_condition_sheet(s)

    def test_unknown_plan_rejected(self):
        with self.assertRaises(ValueError):
            build_sheets_from_plan(_minutes_with_plans(), "PLAN-X", {})

    def test_deterministic(self):
        m = _minutes_with_plans()
        a = json.dumps(build_sheets_from_plan(m, "PLAN-A", {"company_a": 40.0}),
                       sort_keys=True)
        b = json.dumps(build_sheets_from_plan(m, "PLAN-A", {"company_a": 40.0}),
                       sort_keys=True)
        self.assertEqual(a, b)


class TestApplyPlan(unittest.TestCase):
    def test_apply_plan_returns_valid_sheets(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        view = orch.open_stage()
        plan_id = view["meeting_minutes"]["proposals"][0]["proposal_id"]
        sheets = orch.apply_plan(plan_id, {"company_a": 30.0})
        self.assertTrue(sheets)
        for s in sheets:
            validate_condition_sheet(s)
        # 不落状态：未 submit 前引擎无任何变化
        self.assertEqual(orch._state().city.committed_capital, 0.0)

    def test_apply_plan_feed_into_negotiation(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        view = orch.open_stage()
        plan_id = view["meeting_minutes"]["proposals"][0]["proposal_id"]
        sheets = orch.apply_plan(plan_id, {"company_a": 30.0})
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation(
            {"company_a": {"action": "accept"}, "company_d": {"action": "reject"}})
        self.assertIn("company_a", result["negotiation"])
        self.assertEqual(result["negotiation"]["company_a"]["final_action"], "accept")
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_plan_selection -v`
Expected: FAIL（`build_sheets_from_plan` / `apply_plan` 不存在）。

- [ ] **Step 3: negotiation.py 追加 build_sheets_from_plan**

```python
def build_sheets_from_plan(minutes: dict, plan_id: str,
                           capital_map: Dict[str, float]) -> List[dict]:
    """联席方案（meeting_minutes.proposals）→ 政府条件单草稿（只读映射，不落状态）。

    条件文本经 classify_conditions 转结构化风险条件；资本点由玩家提供（capital_map）。
    """
    plan = next((p for p in minutes.get("proposals", []) if p["proposal_id"] == plan_id), None)
    if plan is None:
        raise ValueError("unknown proposal: %s" % plan_id)
    sheets: List[dict] = []
    for cid in sorted({c["company_id"] for c in plan.get("conditions", [])}):
        conds = [c["condition"] for c in plan.get("conditions", [])
                 if c["company_id"] == cid]
        sheets.append({
            "sheet_id": "CS-%s-%s" % (plan_id, cid),
            "company_id": cid,
            "capital_points": float(capital_map.get(cid, 0.0)),
            "support_focus": "infrastructure",
            "milestone_due": "",
            "risk_conditions": classify_conditions(conds),
        })
    return sheets
```

- [ ] **Step 4: orchestrator.py 追加 apply_plan**

```python
    def apply_plan(self, plan_id: str, capital_map: Dict[str, float]) -> List[dict]:
        """玩家选择联席方案 → 生成条件单草稿（不落状态，交给 submit_conditions）。"""
        st = self._state()
        view = self._pending_view or self._stage_view(st)
        minutes = view["communication"]["minutes"]
        from .negotiation import build_sheets_from_plan
        sheets = build_sheets_from_plan(minutes, plan_id, capital_map)
        for s in sheets:
            validate_condition_sheet(s)
        return sheets
```

（或在文件顶部统一 import `build_sheets_from_plan`。）

- [ ] **Step 5: 运行确认通过 + 全量回归**

Run:
```bash
python3 -m unittest policytown.investment.tests.test_plan_selection policytown.investment.tests.test_negotiation_flow policytown.investment.tests.test_smoke -v
```
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment/core/negotiation.py policytown/investment/core/orchestrator.py policytown/investment/tests/test_plan_selection.py
git commit -m "feat(p2): map joint meeting plans to condition sheets"
```

---

### Task 7: 玩家采纳门禁（仅采纳的条件进入引擎）

**Files:**
- Modify: `policytown/investment/tests/test_plan_selection.py`
- （无新代码——语义已在 finalize_negotiation 固化，本任务用测试锁定门禁）

- [ ] **Step 1: 写失败测试（门禁语义：全拒 → 预算不动；部分拒 → 只结算采纳项；修改 → 用修改后数值）**

```python
class TestAdoptionGate(unittest.TestCase):
    def test_reject_all_no_effect(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        orch.open_stage()
        sheets = [{"sheet_id": "CS-G-01", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": ["tranches"]}]
        orch.submit_conditions(sheets)
        before = orch._state().city.budget_points
        result = orch.finalize_negotiation({"company_a": {"action": "reject"}})
        self.assertEqual(orch._state().city.budget_points, before, "全拒必须预算不变")
        self.assertEqual(result["negotiation"]["company_a"]["final_action"], "reject")
        self.assertEqual(result["budget"]["spent"], 0.0)
        self.assertEqual(orch._state().government_commitments.records, [],
                         "全拒不得写承诺")

    def test_modify_uses_modified_sheet(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        orch.open_stage()
        sheets = [{"sheet_id": "CS-G-02", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": []}]
        orch.submit_conditions(sheets)
        modified = {"sheet_id": "CS-G-02M", "company_id": "company_a",
                    "capital_points": 25, "support_focus": "supply_chain",
                    "risk_conditions": ["milestones"]}
        result = orch.finalize_negotiation(
            {"company_a": {"action": "modify", "modified_sheet": modified}})
        tr = result["negotiation"]["company_a"]
        self.assertEqual(tr["sheet"]["capital_points"], 25.0)
        self.assertEqual(tr["sheet"]["support_focus"], "supply_chain")
        self.assertEqual(result["budget"]["spent"], 25.0)
        self.assertIn("milestones", tr["condition_impact"][0]["condition"])

    def test_unnamed_company_not_settled(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        orch.open_stage()
        sheets = [{"sheet_id": "CS-G-03", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": []},
                  {"sheet_id": "CS-G-04", "company_id": "company_d",
                   "capital_points": 30, "support_focus": "talent",
                   "risk_conditions": []}]
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation({"company_a": {"action": "accept"}})
        # company_d 未在 confirmations 中提及 → 不结算
        company_ids = {d["company_id"] for d in result["state_deltas"]}
        self.assertNotIn("company_d", company_ids)
        self.assertEqual(result["budget"]["spent"], 40.0)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_plan_selection -v`
Expected: FAIL（门禁语义尚未被测试锁定——`finalize_negotiation` 此时可能已实现，若有实现则这些测试应直接通过；如 Task 3 的 finalize 实现有偏差，本任务修复实现）。

- [ ] **Step 3: 修复/锁定实现（如测试失败）**

若 `finalize_negotiation` 已正确实现，本步骤无代码改动，仅确认语义：
- `action == "reject"` → 该企业 sheet 不生成 decisions、不写承诺、不进 trace 之外的状态；
- `action == "modify"` → 只用 `modified_sheet`（校验通过）；
- 未提及的企业 → 等同拒绝；
- `self._write_commitments` 只接收 `final_sheets`（已过滤）。
若实现有偏差，按上述语义修正 `finalize_negotiation`。

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `python3 -m unittest policytown.investment.tests.test_plan_selection policytown.investment.tests.test_negotiation_flow policytown.investment.tests.test_smoke -v`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment/tests/test_plan_selection.py
git commit -m "feat(p2): lock adoption gate semantics (accept/modify/reject only into engine)"
```

---

### Task 8: 结算页部门条件影响映射（证据链）

**Files:**
- Modify: `policytown/investment/core/orchestrator.py`
- Modify: `policytown/investment/tests/test_plan_selection.py`

- [ ] **Step 1: 写失败测试（条件 → 引擎 deltas 的证据链可追溯）**

在 `test_plan_selection.py` 末尾追加：

```python
class TestConditionImpactChain(unittest.TestCase):
    def test_condition_impact_linked_to_deltas(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        orch.open_stage()
        sheets = [{"sheet_id": "CS-H-01", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": ["tranches"]}]
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation({"company_a": {"action": "accept"}})
        tr = result["negotiation"]["company_a"]
        deltas = [d for d in result["state_deltas"] if d.get("company_id") == "company_a"]
        self.assertTrue(deltas)
        for imp in tr["condition_impact"]:
            self.assertTrue(imp["affected_metrics"])
        all_codes = {c for imp in tr["condition_impact"] for c in imp["reason_codes"]}
        delta_codes = {d["reason_code"] for d in deltas}
        self.assertTrue(all_codes & delta_codes, "条件影响必须能追溯到引擎结算 reason_code")

    def test_trace_is_json_serializable(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        orch.open_stage()
        sheets = [{"sheet_id": "CS-H-02", "company_id": "company_a",
                   "capital_points": 40, "support_focus": "infrastructure",
                   "risk_conditions": ["milestones"]}]
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation({"company_a": {"action": "accept"}})
        json.dumps(result["negotiation"], ensure_ascii=False)  # 不抛异常即通过

    def test_settlement_includes_department_conditions(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d"], "S1")
        view = orch.open_stage()
        # 部门条件来自会议纪要方案，玩家采纳后进入结算输出
        plan = view["meeting_minutes"]["proposals"][0]
        sheets = orch.apply_plan(plan["proposal_id"], {"company_a": 20.0})
        orch.submit_conditions(sheets)
        result = orch.finalize_negotiation(
            {s["company_id"]: {"action": "accept"} for s in sheets})
        for cid in result["negotiation"]:
            tr = result["negotiation"][cid]
            if tr["final_action"] == "accept":
                self.assertEqual(tr["sheet"]["company_id"], cid)
                self.assertIn("proposing_department",
                              view["meeting_minutes"]["proposals"][0]["conditions"][0])
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_plan_selection -v`
Expected: FAIL（`condition_impact` 为空或不可序列化——取决于 Task 3/5 的 trace 实现）。

- [ ] **Step 3: orchestrator.py — 完善 trace 证据链**

把 `_negotiation_trace` 的 impacts 构建改为带证据链引用：

```python
            deltas = [d for d in self._last_deltas if d.get("company_id") == cid]
            metrics = sorted({d["metric_id"] for d in deltas})
            codes = sorted({d["reason_code"] for d in deltas})
            impacts = []
            for cond in sheet.get("risk_conditions", []):
                impacts.append({
                    "condition": cond,
                    "affected_metrics": metrics,
                    "reason_codes": codes[:5],
                    "delta_count": len(deltas),
                    "evidence_ids": sorted({eid for d in deltas
                                            for eid in d.get("input_metric_ids", [])}),
                })
```

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `python3 -m unittest policytown.investment.tests.test_plan_selection policytown.investment.tests.test_negotiation_flow policytown.investment.tests.test_smoke -v`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment/core/orchestrator.py policytown/investment/tests/test_plan_selection.py
git commit -m "feat(p2): settlement trace links conditions to engine deltas"
```

---

### Task 9: 全链路回归 + 政企协商演示

**Files:**
- Create: `policytown/investment/run_demo_negotiation.py`
- Modify: `policytown/investment/tests/test_smoke.py`（追加全链路玩家循环测试）

- [ ] **Step 1: 写失败测试（完整玩家循环：开卡 → 核验 → 选方案 → 条件单 → 反提案 → 确认 → 结算 → 下一阶段）**

在 `test_smoke.py` 末尾追加：

```python
def run_full_negotiation(seed: int = 42):
    """P1.5+P2 全链路：四阶段完整玩家协商循环（确定性 fallback，断网可跑）。"""
    orch = Orchestrator(seed=seed)
    orch.start(PICK, "S1")
    rounds = []
    for sid in ("S1", "S2", "S3", "S4"):
        view = orch.open_stage()
        cards = view["question_cards"]
        if cards:
            orch.request_verification(cards[0]["card_id"])
        plan_id = view["meeting_minutes"]["proposals"][0]["proposal_id"]
        sheets = orch.apply_plan(plan_id, {"company_a": 25.0, "company_d": 15.0,
                                           "company_b": 20.0})
        sheets = [s for s in sheets if s["company_id"] in {"company_a", "company_d", "company_b"}]
        orch.submit_conditions(sheets)
        confirmations = {s["company_id"]: {"action": "accept"} for s in sheets}
        rounds.append(orch.finalize_negotiation(confirmations))
        if sid != "S4":
            orch.advance_stage()
    return rounds, orch.finish()


class TestFullNegotiationLoop(unittest.TestCase):
    def test_full_loop_budget_conservation(self):
        rounds, _ = run_full_negotiation()
        for r in rounds:
            b = r["budget"]
            self.assertAlmostEqual(b["after"], b["before"] - b["spent"] + b["recovered"],
                                   places=6)
            self.assertLessEqual(b["spent"], b["before"] + 1e-9)

    def test_full_loop_determinism(self):
        r1, f1 = run_full_negotiation(seed=42)
        r2, f2 = run_full_negotiation(seed=42)
        self.assertEqual(json.dumps(r1, sort_keys=True, default=str),
                         json.dumps(r2, sort_keys=True, default=str))
        self.assertEqual(json.dumps(f1, sort_keys=True, default=str),
                         json.dumps(f2, sort_keys=True, default=str))

    def test_full_loop_commitments_accumulate(self):
        orch = Orchestrator(seed=42)
        orch.start(PICK, "S1")
        for sid in ("S1", "S2", "S3", "S4"):
            view = orch.open_stage()
            sheets = orch.apply_plan(view["meeting_minutes"]["proposals"][0]["proposal_id"],
                                     {"company_a": 20.0})
            sheets = [s for s in sheets if s["company_id"] == "company_a"]
            orch.submit_conditions(sheets)
            orch.finalize_negotiation({"company_a": {"action": "accept"}})
            if sid != "S4":
                orch.advance_stage()
        self.assertGreaterEqual(len(orch._state().government_commitments.records), 1)

    def test_full_loop_leakage_audit(self):
        rounds, final = run_full_negotiation()
        self.assertTrue(final["historical_replay"]["leakage_audit_passed"])
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_smoke -v`
Expected: FAIL（`request_verification` / `apply_plan` / `finalize_negotiation` 尚未在 smoke 路径可用，或循环有缺陷）。

- [ ] **Step 3: 修复循环直至通过（如 orchestrator 语义偏差）**

预期：Task 3/6 的 API 已就绪，此步主要是确认跨阶段行为：
- `advance_stage()` 后 `_pending_view` 为 None（`open_stage` 重建）→ `request_verification` / `apply_plan` 用 `_stage_view` 懒重建路径；
- `_verifications` 按 stage_id 键控，跨阶段不串。

- [ ] **Step 4: 新建 run_demo_negotiation.py（政企协商演示）**

```python
"""政企协商端到端演示（P1.5 + P2）：问题卡 → 核验 → 联席方案 → 条件单 → 反提案 → 确认 → 结算。

  python3 -m policytown.investment.run_demo_negotiation

产出 demo_negotiation.json：每轮协商轨迹 + 结算 + 终局评分。
"""
from __future__ import annotations

import json
import os

from .core.orchestrator import Orchestrator

PICK = ["proto_a", "proto_d", "proto_b"]


def main() -> None:
    orch = Orchestrator(run_id="demo-neg-001", seed=42)
    orch.start(PICK, "S1")
    rounds = []
    for stage_id in ("S1", "S2", "S3", "S4"):
        view = orch.open_stage()
        cards = view["question_cards"]
        verification = None
        if cards:
            verification = orch.request_verification(cards[0]["card_id"])["verification_response"]
        plan_id = view["meeting_minutes"]["proposals"][0]["proposal_id"]
        sheets = orch.apply_plan(plan_id, {"company_a": 25.0, "company_d": 15.0,
                                           "company_b": 20.0})
        sheets = [s for s in sheets if s["company_id"] in {"company_a", "company_d", "company_b"}]
        orch.submit_conditions(sheets)
        confirmations = {s["company_id"]: {"action": "accept"} for s in sheets}
        out = orch.finalize_negotiation(confirmations)
        out["_stage_label"] = view["stage"]["label"]
        out["_verification"] = verification
        rounds.append(out)
        print("[%s %s] 支出 %s / 剩 %s | 核验: %s | 承诺: %d 条"
              % (stage_id, view["stage"]["label"], out["budget"]["spent"],
                 out["budget"]["after"],
                 verification["response_type"] if verification else "无",
                 len(orch._state().government_commitments.records)))
        if stage_id != "S4":
            orch.advance_stage()
    final = orch.finish()
    demo = {"run_id": "demo-neg-001", "seed": 42, "pick": PICK,
            "rounds": rounds, "final": final}
    path = os.path.join(os.path.dirname(__file__), "demo_negotiation.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(demo, f, ensure_ascii=False, indent=2, default=str)
    print("== 终局四评分 ==")
    print(json.dumps(final["historical_replay"], ensure_ascii=False, indent=2))
    print("demo_negotiation.json 已写出：%s" % path)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: 全量回归 + 演示运行**

Run:
```bash
python3 -m unittest discover -s policytown/investment/tests -t .
python3 -m policytown.investment.run_demo_negotiation
```
Expected: 全部 PASS；演示打印四轮协商并写出 `demo_negotiation.json`（预算守恒、承诺逐轮累积、终局泄漏审计通过）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment/run_demo_negotiation.py policytown/investment/tests/test_smoke.py
git commit -m "feat(p2): full negotiation loop regression + demo script"
```

---

## Self-Review 对照

**P1.5 覆盖（对照产品文档 §12 P1.5）：**
- 生成核验问题卡：Task 1（关键未穿透项优先 + high 缺失兜底 + 每企业限 2）
- 企业按私有状态策略性回应：Task 3 `request_verification`（复用 P0.5 `respond_to_verification`）
- 玩家选择 → 政府条件单：Task 2/3（ConditionSheet 契约 + `submit_conditions`）
- 接收一次企业反提案：Task 3（复用 `make_counter_proposal`，一次性守卫）
- 最终条件写入承诺账并交规则引擎：Task 4/5（政方账 + 企方账 + `finalize_negotiation` → `submit_decisions` → `engine.settle`）

**P2 覆盖（对照产品文档 §12 P2）：**
- 玩家可选/改/拒联席方案：Task 6/7（`apply_plan` + accept/modify/reject 确认语义）
- 仅采纳的结构化条件进入引擎：Task 7 门禁测试（全拒预算不动；未提及企业不结算）
- 结算页展示部门条件影响：Task 5/8（`negotiation` 轨迹：条件 → reason_codes → 证据链）

**性能与约束（§10.1.2）：** 企业协商每轮最多两次实时模型调用（核验一次 + 反提案一次）；部门质询一轮（P1 已约束）；无新依赖。

**明确不做（后续计划）：** P2.5 投后随访（按承诺账 `due_in` 检查里程碑）、SQLite 持久化、前端接入。

**衔接注意：** 本计划依赖另一会话 P1 计划的契约形状（`department_communication` / `meeting_minutes.proposals[].conditions[]` / `find_memorandum` 等）。若 P1 实现时契约键名或 proposals 结构有变，需同步调整本计划 Task 6（`build_sheets_from_plan` 读取 `proposals[].conditions[]` 的 `{condition, proposing_department, company_id}`）与 Task 3（`_stage_view` 复用 `_communicate`）。
