# P0 + P0.5 冻结政府/企业 Agent 契约 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 冻结《产品文档》第 12 节 P0 与 P0.5 两项契约：四类专业研判正式化为财政/经信/科技/发改四部门并输出结构化初审备忘录；企业 Agent 冻结关键未穿透项、私有状态、一图两账 Memory、核验回应与一次性反提案契约，并把身份/目标/风险偏好与动态 Memory 分离。

**Architecture:** 全部改动在 `policytown/investment/` 内，沿用现有"确定性 fallback + 可注入 LLM"双轨架构。P0 只改部门命名、备忘录契约与 fallback 输出形状（引擎与运输层不动）；P0.5 新增 `core/private_state.py` 与 `memory/` 包（事实图/判断账/承诺账），企业 Agent 持有私有状态与 Memory，公共 Context 不出现任何私有字段。所有新契约配 JSON Schema 与确定性 fallback，断网可跑、同 seed 可复现。

**Tech Stack:** Python 3.9+（stdlib only，无新依赖）、unittest、既有 `contracts/*.schema.json` 契约目录、`data/hefei_mvp/*.json` 数据目录。

**前置依赖:** 无（在现有 S1—S4 可运行闭环上增量扩展）。

---

## 文件结构

```
policytown/investment/
├── agents/
│   ├── base.py                       # 修改：deep_validator + run(validator=)
│   ├── professional.py               # 修改：部门重命名 + 备忘录契约 + 部门 Prompt
│   └── company.py                    # 修改：私有状态/Memory 接线 + 核验回应 + 反提案
├── core/
│   ├── private_state.py              # 新建：CompanyPrivateState + ScenarioAssumption
│   ├── context.py                    # 修改：slim_context 部门名 + fact_graph 注入
│   ├── state.py                      # 修改：WorldState 挂 FactGraph
│   └── orchestrator.py               # 修改：部门备忘录视图键 + 私有状态/事实图播种
├── memory/
│   ├── __init__.py                   # 新建：EnterpriseMemory 容器
│   ├── fact_graph.py                 # 新建：现实图谱
│   ├── belief_ledger.py              # 新建：判断账
│   └── commitment_ledger.py          # 新建：承诺账
├── fallback/deterministic.py         # 修改：部门备忘录 + 核验回应 + 反提案 fallback
├── contracts/
│   ├── department_memorandum.schema.json    # 新建
│   ├── verification_response.schema.json    # 新建
│   ├── counter_proposal.schema.json         # 新建
│   ├── agent_output.schema.json             # 修改：部门枚举 + 备忘录字段
│   └── context.schema.json                  # 修改：fact_graph
├── data/hefei_mvp/enterprise_agents.json    # 修改：decision_baseline / private_baseline / key_proposition
└── tests/
    ├── test_departments.py           # 新建：P0 部门契约测试
    ├── test_private_state.py         # 新建：P0.5 私有状态测试
    ├── test_enterprise_memory.py     # 新建：P0.5 一图两账 + 隔离测试
    ├── test_negotiation.py           # 新建：P0.5 核验回应 + 反提案测试
    └── test_enterprise_agents.py     # 修改：数据契约测试（baseline/命题）
```

---

## Part A（P0）冻结政府部门契约

### Task 1: 四部门重命名（财政/经信/科技/发改）

**Files:**
- Modify: `policytown/investment/agents/professional.py`
- Modify: `policytown/investment/core/context.py`
- Modify: `policytown/investment/fallback/deterministic.py`
- Modify: `policytown/investment/contracts/agent_output.schema.json`
- Create: `policytown/investment/tests/test_departments.py`

- [ ] **Step 1: 写失败测试（新部门枚举与角色名）**

```python
"""四部门契约测试（产品文档 4.4 / 5.1）。

部门固定为：财政 fiscal / 经信 economy / 科技 sci_tech / 发改 development。
"""
from __future__ import annotations

import unittest

from ..agents.professional import KINDS, _ROLE_NAMES


class TestDepartmentIdentity(unittest.TestCase):
    def test_four_departments_named(self):
        self.assertEqual(KINDS, ("fiscal", "economy", "sci_tech", "development"))
        self.assertEqual(set(_ROLE_NAMES), set(KINDS))
        self.assertIn("财政", _ROLE_NAMES["fiscal"])
        self.assertIn("经信", _ROLE_NAMES["economy"])
        self.assertIn("科技", _ROLE_NAMES["sci_tech"])
        self.assertIn("发改", _ROLE_NAMES["development"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_departments -v`
Expected: FAIL（现有 KINDS 仍是旧四类，`economy` 等名不存在）。

- [ ] **Step 3: 重命名 agents/professional.py 的部门枚举与角色名**

把 `KINDS` 与 `_ROLE_NAMES` 改为：

```python
KINDS = ("fiscal", "economy", "sci_tech", "development")
_REQUIRED = ["agent", "department", "recommendation", "direction", "score", "confidence",
             "core_claims", "red_lines", "acceptable_conditions", "missing_info",
             "key_factors", "evidence_ids", "reasoning_summary"]
_ROLE_NAMES = {"fiscal": "财政部门", "economy": "经信部门",
               "sci_tech": "科技部门", "development": "发改部门"}
```

并把模块 docstring 首行改为 `"""四政府部门 Agent：财政 / 经信 / 科技 / 发改。`（任务 2—4 会扩展该文件，此处只改名）。

- [ ] **Step 4: 重命名 core/context.py 的 slim_context 部门分支**

修改 `slim_context`（`context.py:109-171`）中的 kind 分支，旧名→新名：
- `if kind in ("industry", "company_plan", "market_risk")` → `if kind in ("economy", "company_plan", "development")`
- `if kind in ("company_tech", "company_plan")` → `if kind in ("sci_tech", "company_plan")`
- `elif kind == "market_risk" and industry:` → `elif kind == "development" and industry:`
- `elif kind == "industry" and industry:` → `elif kind == "economy" and industry:`
- docstring 第 111 行 `kind: fiscal | industry | company_tech | market_risk | company_plan` → `kind: fiscal | economy | sci_tech | development | company_plan`

- [ ] **Step 5: 重命名 fallback/deterministic.py 的分支与 agent 键**

- 函数 `professional_assessment` 中 `if kind == "industry":` → `if kind == "economy":`，返回 dict 的 `"agent": "industry"` → `"agent": "economy"`
- `if kind == "company_tech":` → `if kind == "sci_tech":`，`"agent": "company_tech"` → `"agent": "sci_tech"`
- `# market_risk` 注释分支：`"agent": "market_risk"` → `"agent": "development"`
- `"agent": "fiscal"` 保持不变

- [ ] **Step 6: 更新 contracts/agent_output.schema.json 的部门枚举**

```json
"agent": {"type": "string", "enum": ["fiscal", "economy", "sci_tech", "development"]},
```

- [ ] **Step 7: 运行全部测试确认通过**

Run: `python3 -m unittest discover -s policytown/investment/tests -v`
Expected: 全部 PASS（旧测试未引用部门枚举，仅重命名不破坏行为）。

- [ ] **Step 8: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0): rename professional agents to four departments (fiscal/economy/sci_tech/development)"
```

---

### Task 2: 部门初审备忘录契约 + 校验器 + BaseAgent 深层校验支持

**Files:**
- Create: `policytown/investment/contracts/department_memorandum.schema.json`
- Modify: `policytown/investment/contracts/agent_output.schema.json`
- Modify: `policytown/investment/agents/base.py`
- Modify: `policytown/investment/agents/professional.py`
- Modify: `policytown/investment/tests/test_departments.py`

- [ ] **Step 1: 写失败测试（备忘录校验器）**

在 `test_departments.py` 追加：

```python
from ..agents.professional import validate_memorandum


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
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_departments -v`
Expected: FAIL（`validate_memorandum` / `_memorandum_fixture` 不存在，ImportError）。

- [ ] **Step 3: 新建 contracts/department_memorandum.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.2/department_memorandum",
  "title": "DepartmentMemorandum v0.2 — 四部门初审备忘录",
  "description": "文档 4.4：当前建议、核心主张、红线、可接受条件、缺失信息、置信度与风险。",
  "type": "object",
  "required": ["agent", "department", "recommendation", "direction", "score", "confidence",
               "core_claims", "red_lines", "acceptable_conditions", "missing_info",
               "key_factors", "evidence_ids", "reasoning_summary"],
  "properties": {
    "agent": {"type": "string", "enum": ["fiscal", "economy", "sci_tech", "development"]},
    "department": {"type": "string"},
    "company_id": {"type": ["string", "null"]},
    "recommendation": {"type": "string",
                       "enum": ["support", "conditional_support", "hold", "oppose"]},
    "direction": {"type": "string", "enum": ["positive", "neutral", "negative"]},
    "score": {"type": "number", "minimum": 0, "maximum": 100},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    "core_claims": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["claim_id", "claim_type", "statement", "evidence_ids"],
        "properties": {
          "claim_id": {"type": "string"},
          "claim_type": {"type": "string", "enum": ["positive", "risk", "assumption"]},
          "statement": {"type": "string"},
          "evidence_ids": {"type": "array", "items": {"type": "string"}}
        }
      }
    },
    "red_lines": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["redline_id", "condition", "reason"],
        "properties": {
          "redline_id": {"type": "string"},
          "condition": {"type": "string"},
          "reason": {"type": "string"}
        }
      }
    },
    "acceptable_conditions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["condition_id", "condition", "reason"],
        "properties": {
          "condition_id": {"type": "string"},
          "condition": {"type": "string"},
          "reason": {"type": "string"}
        }
      }
    },
    "missing_info": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["info_id", "severity", "description", "impact"],
        "properties": {
          "info_id": {"type": "string"},
          "severity": {"type": "string", "enum": ["high", "medium", "low"]},
          "description": {"type": "string"},
          "impact": {"type": "string"}
        }
      }
    },
    "key_factors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["metric_id", "effect"],
        "properties": {
          "metric_id": {"type": "string"},
          "effect": {"type": "string", "enum": ["positive", "neutral", "negative"]}
        }
      }
    },
    "evidence_ids": {"type": "array", "items": {"type": "string"}},
    "reasoning_summary": {"type": "string"}
  }
}
```

- [ ] **Step 4: 更新 contracts/agent_output.schema.json 的 professional_assessment 定义**

用与 department_memorandum.schema.json 完全一致的 `professional_assessment` 定义替换旧定义（required 增加 `department`、`recommendation`、`core_claims`、`red_lines`、`acceptable_conditions`、`missing_info`；`agent` 枚举改为四部门；其余属性原样保留）。

- [ ] **Step 5: 修改 agents/base.py — 支持 deep_validator 与 run(validator=)**

把文件整体替换为：

```python
"""BaseAgent — 所有 Agent 同一基类：prompt 三段式 + 轻量校验 + 重试 + fallback。

LLM 调用通过注入 llm_fn(prompt: str, validator=...) -> dict 完成；为 None 时直接走 fallback。
校验分层：required_keys 浅层检查（BaseAgent.validate）+ 可选 deep_validator
（如 validate_memorandum / validate_verification_response）+ run() 时按契约临时注入的 validator。
"""
from __future__ import annotations

from typing import Callable, List, Optional


class BaseAgent:
    def __init__(self, role: str, required_keys: List[str],
                 llm_fn: Optional[Callable[[str], dict]] = None,
                 max_retries: int = 1,
                 deep_validator: Optional[Callable[[dict], None]] = None) -> None:
        self.role = role
        self.required_keys = required_keys
        self.llm_fn = llm_fn
        self.max_retries = max_retries
        self.deep_validator = deep_validator

    def run(self, prompt_payload: dict, fallback_fn: Callable[[], dict],
            validator: Optional[Callable[[dict], None]] = None) -> dict:
        """validator 优先于 self.validate 使用（多契约 Agent 按调用场景换校验器）。"""
        v = validator or self.validate
        if self.llm_fn is None:
            return fallback_fn()
        prompt = self.build_prompt(prompt_payload)
        for _ in range(self.max_retries + 1):
            try:
                out = self._call(prompt, v)
                v(out)
                return out
            except Exception:
                continue
        out = fallback_fn()
        out["confidence"] = 0.0
        return out

    def _call(self, prompt: str, validator: Optional[Callable[[dict], None]] = None) -> dict:
        """带 validator 调用；外部 llm_fn 不接受该参数时退化为单参调用。"""
        try:
            return self.llm_fn(prompt, validator=validator)
        except TypeError:
            return self.llm_fn(prompt)

    def build_prompt(self, payload: dict) -> str:
        """三段式：角色与边界 / 当前事实 / 输出契约（含 one-shot 示例）。"""
        import json as _json
        facts = _json.dumps(payload, ensure_ascii=False, default=str)
        kind = payload.get("kind", "professional")
        example = {"agent": kind, "direction": "positive", "score": 68,
                   "confidence": 0.74,
                   "key_factors": [{"metric_id": "industrial_base", "effect": "positive"}],
                   "evidence_ids": ["EVID-001"], "reasoning_summary": "一句话理由"}
        return (
            "【角色与边界】你是%s。只能输出结构化判断 JSON 对象。\n"
            "禁止修改任何数值；禁止使用截止日之后的信息；禁止给出成功率；"
            "禁止编造 evidence_ids；禁止发明示例之外的其他字段或嵌套对象。\n"
            "【当前事实（只读，禁止修改）】%s\n"
            "【输出契约】只输出一个 JSON 对象，必须严格遵循以下结构（键、类型、"
            "嵌套层次完全一致）：\n%s"
            % (self.role, facts, _json.dumps(example, ensure_ascii=False, indent=1))
        )

    def validate(self, out: dict) -> None:
        missing = [k for k in self.required_keys if k not in out]
        if missing:
            raise ValueError("agent output missing keys: %s" % missing)
        # 值域校验：direction / action 必须在契约枚举内
        direction = out.get("direction")
        if direction is not None and direction not in ("positive", "neutral", "negative"):
            raise ValueError("invalid direction: %r" % direction)
        action = out.get("action")
        if action is not None and action not in (
                "expand", "research", "finance", "seek_orders", "contract",
                "relocate", "wait"):
            raise ValueError("invalid action: %r" % action)
        # key_factors 形状规范化：模型可能给字符串数组 → 包装为 {metric_id, effect}
        kf = out.get("key_factors")
        if isinstance(kf, list) and kf and not isinstance(kf[0], dict):
            out["key_factors"] = [{"metric_id": str(x), "effect": "neutral"} for x in kf]
        if self.deep_validator is not None:
            self.deep_validator(out)
```

- [ ] **Step 6: 在 agents/professional.py 增加备忘录契约与校验器**

在 `_ROLE_NAMES` 之后追加：

```python
MEMORANDUM_REQUIRED = ["agent", "department", "recommendation", "direction", "score",
                       "confidence", "core_claims", "red_lines", "acceptable_conditions",
                       "missing_info", "key_factors", "evidence_ids", "reasoning_summary"]
_RECOMMENDATIONS = ("support", "conditional_support", "hold", "oppose")
_CLAIM_TYPES = ("positive", "risk", "assumption")
_MISSING_SEVERITIES = ("high", "medium", "low")


def _memorandum_fixture() -> dict:
    """测试夹具：合法备忘录模板。"""
    return {
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


def validate_memorandum(out: dict) -> None:
    """初审备忘录深层校验（契约 department_memorandum.schema.json 的纯 Python 实现）。"""
    missing = [k for k in MEMORANDUM_REQUIRED if k not in out]
    if missing:
        raise ValueError("memorandum missing keys: %s" % missing)
    if out.get("recommendation") not in _RECOMMENDATIONS:
        raise ValueError("invalid recommendation: %r" % out.get("recommendation"))
    for claim in out.get("core_claims", []):
        if claim.get("claim_type") not in _CLAIM_TYPES:
            raise ValueError("invalid claim_type: %r" % claim)
        if not claim.get("statement"):
            raise ValueError("claim without statement")
    for rl in out.get("red_lines", []):
        if not rl.get("condition"):
            raise ValueError("red line without condition")
    for mi in out.get("missing_info", []):
        if mi.get("severity") not in _MISSING_SEVERITIES:
            raise ValueError("invalid missing_info severity: %r" % mi.get("severity"))
```

- [ ] **Step 7: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_departments -v`
Expected: PASS（备忘录校验 4 例全过；其余既有测试不受影响）。

- [ ] **Step 8: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0): department memorandum contract schema + deep validator"
```

---

### Task 3: 确定性 fallback 产出完整部门备忘录

**Files:**
- Modify: `policytown/investment/fallback/deterministic.py`
- Modify: `policytown/investment/tests/test_departments.py`

- [ ] **Step 1: 写失败测试（fallback 备忘录形状 + 部门标签 + 建议映射）**

在 `test_departments.py` 追加：

```python
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
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_departments -v`
Expected: FAIL（`view["department_memoranda"]` 键不存在 / `DEPARTMENT_LABELS` 不存在）。

- [ ] **Step 3: 重写 fallback/deterministic.py 的 professional_assessment 为备忘录输出**

文件顶部（`professional_assessment` 之前）追加：

```python
DEPARTMENT_LABELS = {"fiscal": "财政部门", "economy": "经信部门",
                     "sci_tech": "科技部门", "development": "发改部门"}
_RECOMMENDATION_BY_DIRECTION = {"positive": "support", "neutral": "conditional_support",
                                "negative": "oppose"}


def _recommendation(direction: str, missing_count: int = 0) -> str:
    """方向→建议；缺失信息≥2 条时强制 hold（文档 4.4：缺失先暂缓）。"""
    if missing_count >= 2:
        return "hold"
    return _RECOMMENDATION_BY_DIRECTION[direction]


def _memorandum(kind: str, company: dict, score: float, direction: str,
                confidence: float, factors: list, evidence_ids: list, summary: str,
                claims: list, red_lines: list, conditions: list, missing: list) -> dict:
    return {
        "agent": kind,
        "department": DEPARTMENT_LABELS[kind],
        "company_id": company["company_id"] if company else None,
        "recommendation": _recommendation(direction, len(missing)),
        "direction": direction,
        "score": score,
        "confidence": confidence,
        "core_claims": claims,
        "red_lines": red_lines,
        "acceptable_conditions": conditions,
        "missing_info": missing,
        "key_factors": factors,
        "evidence_ids": evidence_ids,
        "reasoning_summary": summary,
    }
```

然后把整个 `professional_assessment` 函数体替换为：

```python
def professional_assessment(kind: str, ctx: dict, company: Optional[dict]) -> dict:
    m = company["metrics"] if company else None
    market = ctx["market"].get(company["industry"]) if company else None
    ev = company["evidence_ids"] if company else []

    if kind == "fiscal":
        city = ctx["city"]
        committed_ratio = city["committed_capital"] / max(1.0, city["committed_capital"] + city["budget_points"])
        score = round(100 * (1 - committed_ratio), 1)
        direction = "positive" if score >= 55 else ("neutral" if score >= 30 else "negative")
        factors = [{"metric_id": "fiscal_budget",
                    "effect": "positive" if city["budget_points"] >= 50 else "negative"},
                   {"metric_id": "committed_capital",
                    "effect": "negative" if committed_ratio > 0.5 else "neutral"}]
        summary = "财政余量 %d 点，已承诺 %d 点；%s" % (
            city["budget_points"], city["committed_capital"],
            "仍可承接新项目" if direction == "positive" else "追加空间有限，需防锁定")
        claims = [
            {"claim_id": "FISCAL-1", "claim_type": "positive",
             "statement": "当期财政余量 %d 点，具备承接能力" % city["budget_points"],
             "evidence_ids": ev},
            {"claim_id": "FISCAL-2", "claim_type": "risk",
             "statement": "已承诺资本 %d 点，继续追加将压缩未来阶段空间" % city["committed_capital"],
             "evidence_ids": ev},
        ]
        red_lines = [
            {"redline_id": "FISCAL-R1",
             "condition": "当期支出不得超过预算上限 %d 点" % city["budget_points"],
             "reason": "财政点数守恒"},
            {"redline_id": "FISCAL-R2",
             "condition": "企业资金来源未证实前不承诺后续追加上限",
             "reason": "防止财政暴露不可控"},
        ]
        conditions = [
            {"condition_id": "FISCAL-C1", "condition": "分期拨付，首期不超过方案的 50%",
             "reason": "以里程碑控制支出节奏"},
            {"condition_id": "FISCAL-C2", "condition": "资金证明或同比例出资作为放款前置条件",
             "reason": "确认企业真实出资能力"},
        ]
        missing = [{"info_id": "FISCAL-M1", "severity": "medium",
                    "description": "企业融资方案未完全披露",
                    "impact": "财政暴露测算存在缺口"}]
        return _memorandum(kind, company, score, direction, 0.8, factors, ev, summary,
                           claims, red_lines, conditions, missing)

    if kind == "economy":
        base = ctx["city"]["industrial_base"].get(company["industry"], 20.0)
        talent = ctx["city"]["talent_supply"]
        infra = ctx["city"]["infrastructure_capacity"]
        score = round(0.5 * base + 0.3 * talent + 0.2 * infra, 1)
        direction = _dir(score)
        claims = [
            {"claim_id": "ECON-1", "claim_type": "positive",
             "statement": "本地产业基础 %d / 人才 %d / 基础设施 %d"
                          % (base, talent, infra),
             "evidence_ids": ev},
            {"claim_id": "ECON-2", "claim_type": "assumption",
             "statement": "供应链承接能力按本地产业基础水平估算",
             "evidence_ids": []},
        ]
        red_lines = [{"redline_id": "ECON-R1",
                      "condition": "配套不足时不建议一次性全额投入",
                      "reason": "落地效果依赖配套"}]
        conditions = [{"condition_id": "ECON-C1",
                       "condition": "基础设施/人才/供应链配套与项目建设同步安排",
                       "reason": "保障项目落地与产业链协同"}]
        missing = [{"info_id": "ECON-M1", "severity": "medium",
                    "description": "本地供应链承接能力尚无测算",
                    "impact": "协同收益可能高估"}]
        summary = "本地产业基础 %d、人才 %d：%s" % (
            base, talent, "具备承接条件" if direction == "positive" else "配套存在缺口")
        return _memorandum(kind, company, score, direction, 0.7, [
            {"metric_id": "industrial_base", "effect": "positive" if base >= 40 else "negative"},
            {"metric_id": "talent_supply", "effect": "positive" if talent >= 50 else "neutral"}],
            ev, summary, claims, red_lines, conditions, missing)

    if kind == "sci_tech":
        score = round(0.5 * m["execution_ability"] + 0.5 * m["technology_readiness"], 1)
        direction = _dir(score)
        claims = [
            {"claim_id": "TECH-1", "claim_type": "positive",
             "statement": "执行能力 %d / 技术成熟度 %d" % (m["execution_ability"], m["technology_readiness"]),
             "evidence_ids": ev},
            {"claim_id": "TECH-2", "claim_type": "risk",
             "statement": "量产证据未完整披露，里程碑兑现存在不确定性",
             "evidence_ids": []},
        ]
        red_lines = [{"redline_id": "TECH-R1",
                      "condition": "技术里程碑未达标时暂停后续拨付",
                      "reason": "防止资金沉淀在未验证环节"}]
        conditions = [{"condition_id": "TECH-C1",
                       "condition": "设置建设、试产、量产里程碑并绑定放款",
                       "reason": "按阶段验证技术兑现"}]
        missing = [{"info_id": "TECH-M1", "severity": "high",
                    "description": "量产与良率数据缺失",
                    "impact": "产业化路径未证实"}]
        summary = "执行 %d / 技术成熟 %d：%s" % (
            m["execution_ability"], m["technology_readiness"],
            "能把钱变成产能" if direction == "positive" else "兑现风险需关注")
        return _memorandum(kind, company, score, direction, 0.65, [
            {"metric_id": "execution_ability", "effect": "positive" if m["execution_ability"] >= 55 else "negative"},
            {"metric_id": "technology_readiness", "effect": "positive" if m["technology_readiness"] >= 55 else "neutral"}],
            ev, summary, claims, red_lines, conditions, missing)

    # development（发改）
    score = round(50 + 0.5 * market["cycle"] + 0.3 * market["price_trend"], 1)
    score = max(0, min(100, score))
    direction = _dir(score)
    claims = [
        {"claim_id": "DEV-1",
         "claim_type": "positive" if market["cycle"] > 0 else "risk",
         "statement": "行业景气 %d / 价格趋势 %d / 供给压力 %d"
                      % (market["cycle"], market["price_trend"], market["supply_pressure"]),
         "evidence_ids": ev},
        {"claim_id": "DEV-2", "claim_type": "risk",
         "statement": "产能竞争与政策窗口并存，周期位置决定投入时机",
         "evidence_ids": []},
    ]
    red_lines = [{"redline_id": "DEV-R1",
                  "condition": "需求周期未确认改善前不鼓励逆周期重仓",
                  "reason": "周期反转损失难回收"}]
    conditions = [{"condition_id": "DEV-C1",
                   "condition": "按市场窗口分阶段投入，保留暂停追加条款",
                   "reason": "管理周期风险"}]
    missing = [{"info_id": "DEV-M1", "severity": "medium",
                "description": "后续需求与政策窗口的定量预测缺失",
                "impact": "周期判断依赖定性证据"}]
    summary = "景气 %d / 价格趋势 %d / 供给压力 %d：%s" % (
        market["cycle"], market["price_trend"], market["supply_pressure"],
        "时点有利" if direction == "positive" else "下行风险主导，宜逆周期评估")
    return _memorandum(kind, company, score, direction, 0.7, [
        {"metric_id": "market_cycle", "effect": "positive" if market["cycle"] > 0 else "negative"},
        {"metric_id": "supply_pressure", "effect": "negative" if market["supply_pressure"] >= 60 else "neutral"}],
        ev, summary, claims, red_lines, conditions, missing)
```

- [ ] **Step 4: 在 agents/professional.py 让 make_professional_agents 传入 deep_validator**

`make_professional_agents` 的构造调用改为：

```python
def make_professional_agents(llm_fn: Optional[Callable[[str], dict]] = None) -> List[BaseAgent]:
    return [BaseAgent(role=_ROLE_NAMES[k], required_keys=_REQUIRED, llm_fn=llm_fn,
                      deep_validator=validate_memorandum)
            for k in KINDS]
```

同时把模块顶部 `_REQUIRED` 替换为 `MEMORANDUM_REQUIRED` 的别名（二选一，保持单一定义）：

```python
_REQUIRED = MEMORANDUM_REQUIRED
```

- [ ] **Step 5: 运行确认通过**

Run: `python3 -m unittest discover -s policytown/investment/tests -v`
Expected: PASS（备忘录 fallback 测试 3 例 + 既有 30+ 例全过）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0): deterministic fallback emits full department memoranda"
```

---

### Task 4: 部门 Prompt 升级（LLM 路径输出备忘录）

**Files:**
- Modify: `policytown/investment/agents/professional.py`
- Modify: `policytown/investment/tests/test_departments.py`

- [ ] **Step 1: 写失败测试（LLM 版 prompt 含备忘录契约）**

在 `test_departments.py` 追加：

```python
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
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_departments -v`
Expected: FAIL（`assertIn("recommendation", blob)` 失败：旧通用 Prompt 只有 direction/score/key_factors）。

- [ ] **Step 3: 在 agents/professional.py 增加备忘录 Prompt 构建器**

追加：

```python
def build_memorandum_prompt(payload: dict, role: str) -> str:
    import json as _json
    facts = _json.dumps(payload, ensure_ascii=False, default=str)
    example = {
        "agent": "economy", "department": "经信部门", "company_id": "company_a",
        "recommendation": "conditional_support", "direction": "neutral",
        "score": 62, "confidence": 0.7,
        "core_claims": [
            {"claim_id": "EC-1", "claim_type": "positive",
             "statement": "本地家电整机底盘可与显示面板形成协同",
             "evidence_ids": ["EVID-001"]}],
        "red_lines": [{"redline_id": "EC-R1",
                       "condition": "政府累计出资不超过项目总投入的 40%",
                       "reason": "防止财政过度锁定"}],
        "acceptable_conditions": [
            {"condition_id": "EC-C1", "condition": "按建设里程碑分期拨付",
             "reason": "以节点验证执行能力"}],
        "missing_info": [{"info_id": "EC-M1", "severity": "medium",
                          "description": "本地供应链承接能力尚无测算",
                          "impact": "协同收益可能高估"}],
        "key_factors": [{"metric_id": "industrial_base", "effect": "positive"}],
        "evidence_ids": ["EVID-001"],
        "reasoning_summary": "一句话理由",
    }
    return (
        "【角色与边界】你是%s。只能输出结构化部门初审备忘录 JSON 对象。\n"
        "禁止修改任何数值；禁止使用截止日之后的信息；禁止给出成功率；"
        "禁止编造 evidence_ids；禁止发明示例之外的其他字段或嵌套对象。\n"
        "【当前事实（只读，禁止修改）】%s\n"
        "【输出契约】只输出一个 JSON 对象，必须严格遵循以下结构（键、类型、"
        "嵌套层次完全一致；recommendation 只能是 support / conditional_support / "
        "hold / oppose；claim_type 只能是 positive / risk / assumption；"
        "missing_info.severity 只能是 high / medium / low）：\n%s"
        % (role, facts, _json.dumps(example, ensure_ascii=False, indent=1))
    )


class DepartmentAgent(BaseAgent):
    """四部门 Agent：固定备忘录输出契约 + 备忘录 Prompt。"""

    def __init__(self, role: str,
                 llm_fn: Optional[Callable[[str], dict]] = None) -> None:
        super().__init__(role=role, required_keys=_REQUIRED, llm_fn=llm_fn,
                         deep_validator=validate_memorandum)

    def build_prompt(self, payload: dict) -> str:
        return build_memorandum_prompt(payload, self.role)
```

并把 `make_professional_agents` 改为返回 `DepartmentAgent`：

```python
def make_professional_agents(llm_fn: Optional[Callable[[str], dict]] = None) -> List[BaseAgent]:
    return [DepartmentAgent(role=_ROLE_NAMES[k], llm_fn=llm_fn) for k in KINDS]
```

- [ ] **Step 4: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_departments -v`
Expected: PASS（prompt 契约测试通过）。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0): department agent prompt emits memorandum contract"
```

---

### Task 5: 编排器视图接线（department_memoranda）+ 回归

**Files:**
- Modify: `policytown/investment/core/orchestrator.py`
- Modify: `policytown/investment/run_demo_llm.py`
- Modify: `policytown/investment/tests/test_departments.py`

- [ ] **Step 1: 改 orchestrator 公开键为 department_memoranda**

- `open_stage` 返回值中 `"agent_assessments": assessments` → `"department_memoranda": assessments`（`orchestrator.py:101`）
- `submit_decisions` 输出中 `"agent_assessments": view["assessments"]` → `"department_memoranda": view["assessments"]`（`orchestrator.py:152`）；内部私有键 `view["assessments"]` 保持不变（engine 结算仍用它）
- 模块 docstring 第 4 行 `view = orch.open_stage()  # ①②：Context + 四专业研判 + 图投影` → `四部门初审备忘录 + 图投影`

- [ ] **Step 2: 更新 run_demo_llm.py 文案**

docstring 中 `DeepSeek v4 Flash 驱动四专业 Agent + 企业 Agent` → `驱动财政/经信/科技/发改四部门 Agent + 企业 Agent`。

- [ ] **Step 3: 写集成测试（每企业四部门、唯一键、fiscal 全局）**

在 `test_departments.py` 追加：

```python
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
```

- [ ] **Step 4: 运行全部测试 + 端到端演示**

Run:
```bash
python3 -m unittest discover -s policytown/investment/tests -v
cd policytown/investment && python3 run_demo.py
```
Expected: 全部 PASS；`run_demo.py` 打印四轮结算并写出 `demo_run.json`（预算守恒、终局四评分正常）。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0): expose department memoranda in orchestrator view"
```

---

## Part B（P0.5）冻结企业 Agent 契约

### Task 6: 企业决策底色（decision_baseline）数据登记

**Files:**
- Modify: `policytown/investment/data/hefei_mvp/enterprise_agents.json`
- Modify: `policytown/investment/tests/test_enterprise_agents.py`

- [ ] **Step 1: 写失败测试（六企业决策底色契约）**

在 `test_enterprise_agents.py` 追加：

```python
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
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_agents -v`
Expected: FAIL（`decision_baseline` 键不存在）。

- [ ] **Step 3: 为六家企业登记决策底色**

在 `enterprise_agents.json` 中，对每家企业的 `"decision_cutoff": "...",` 行之后插入（每段末尾保留逗号）：

京东方 `proto_a`：
```json
"decision_baseline": {
  "management_objectives": ["扩代并形成量产集群", "维系资本结构稳定"],
  "expansion_appetite": 0.75,
  "risk_preference": 0.45,
  "financing_constraints": {"bank_credit": "strong", "capital_market_access": "listed"},
  "negotiation_stance": "cooperative"
},
```

赛维 `proto_d`：
```json
"decision_baseline": {
  "management_objectives": ["纵向整合扩张", "维持高增长叙事"],
  "expansion_appetite": 0.9,
  "risk_preference": 0.7,
  "financing_constraints": {"bank_credit": "fragile", "capital_market_access": "listed"},
  "negotiation_stance": "guarded"
},
```

长鑫 `proto_b`：
```json
"decision_baseline": {
  "management_objectives": ["长期技术追赶", "分阶段闭环"],
  "expansion_appetite": 0.85,
  "risk_preference": 0.55,
  "financing_constraints": {"bank_credit": "state_platform", "capital_market_access": "none"},
  "negotiation_stance": "cooperative"
},
```

熔安 `proto_e`：
```json
"decision_baseline": {
  "management_objectives": ["快速规模化", "抢占周期高点"],
  "expansion_appetite": 0.8,
  "risk_preference": 0.6,
  "financing_constraints": {"bank_credit": "cyclical", "capital_market_access": "none"},
  "negotiation_stance": "aggressive"
},
```

鑫昊 `proto_c`：
```json
"decision_baseline": {
  "management_objectives": ["依托地方国资落地", "依赖长虹整机消化"],
  "expansion_appetite": 0.6,
  "risk_preference": 0.5,
  "financing_constraints": {"bank_credit": "weak", "capital_market_access": "none"},
  "negotiation_stance": "guarded"
},
```

未名 `proto_f`：
```json
"decision_baseline": {
  "management_objectives": ["打造超大型园区", "依托高校品牌资源"],
  "expansion_appetite": 0.85,
  "risk_preference": 0.6,
  "financing_constraints": {"bank_credit": "opaque", "capital_market_access": "none"},
  "negotiation_stance": "aggressive"
},
```

完成后运行 `python3 -c "import json; json.load(open('policytown/investment/data/hefei_mvp/enterprise_agents.json'))"` 确认 JSON 合法。

- [ ] **Step 4: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_agents -v`
Expected: PASS（既有 9 例 + 新增 1 例）。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): register decision baseline for six enterprises"
```

---

### Task 7: 关键未穿透项登记（京东方/赛维/长鑫）

**Files:**
- Modify: `policytown/investment/data/hefei_mvp/enterprise_agents.json`
- Modify: `policytown/investment/tests/test_enterprise_agents.py`

- [ ] **Step 1: 写失败测试（三核心案例登记 + 终局信息隔离）**

在 `test_enterprise_agents.py` 追加：

```python
CORE_PROTOS = {"proto_a", "proto_d", "proto_b"}
KP_STATUSES = ("verified", "partial", "unverified", "conflicting")


class TestKeyProposition(unittest.TestCase):
    def test_registered_for_core_cases_only(self):
        for e in ENTERPRISES:
            kp = e.get("key_proposition")
            if e["prototype_id"] in CORE_PROTOS:
                self.assertTrue(kp, "%s 必须登记关键未穿透项" % e["name"])
                self.assertTrue(kp["proposition"].strip())
                self.assertIn(kp["evidence_status"], KP_STATUSES, e["name"])
                self.assertTrue(kp["verification_questions"], e["name"])
                self.assertTrue(kp["terminal_verification"].get("withheld"),
                                "%s 终局验证必须标记 withheld" % e["name"])
            else:
                self.assertIsNone(kp, "%s 不应登记核心命题" % e["name"])

    def test_terminal_verification_withheld_from_context(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        view = orch.open_stage()
        blob = json.dumps(view["context"], ensure_ascii=False)
        for e in ENTERPRISES:
            kp = e.get("key_proposition")
            if kp:
                self.assertNotIn(kp["terminal_verification"]["evidence"], blob,
                                 "终局证据泄漏：%s" % e["name"])
                self.assertNotIn(kp["terminal_verification"]["outcome"], blob,
                                 "终局结论泄漏：%s" % e["name"])
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_agents -v`
Expected: FAIL（`key_proposition` 不存在）。

- [ ] **Step 3: 登记三个核心案例的关键未穿透项**

在 `enterprise_agents.json` 三家核心企业的 `"decision_cutoff"` 行之后（`decision_baseline` 之前）插入：

京东方 `proto_a`：
```json
"key_proposition": {
  "proposition_id": "KP-BOE-01",
  "proposition": "企业是否具备建线、融资和持续扩代的真实能力",
  "evidence_status": "partial",
  "visible_facts": [
    "2007年营收约111.7亿元，TFT-LCD业务约96亿元级",
    "2008年7月完成非公开发行股份登记，具备资本市场融资能力",
    "北京5代线已建设运营，具备建线、调试、良率与客户导入的验证记录",
    "2008年4月业绩预告：上半年归母净利润预计超5亿元"
  ],
  "verification_questions": [
    {"question_id": "VQ-BOE-01",
     "question": "请披露合肥6代线项目资金闭环：自有资金、银团授信与后续扩代资金来源安排",
     "targets": ["financing_capacity", "line_building_experience"]},
    {"question_id": "VQ-BOE-02",
     "question": "行业周期下行临界下，产线投产后的单位成本与良率爬坡计划如何保证",
     "targets": ["production_ramp_plan"]}
  ],
  "terminal_verification": {
    "withheld": true,
    "evidence": "终局揭示：2008年10月项目公司设立、11月定增120亿元方案落地，6代线2012年投产后成为大陆首批高世代量产线",
    "outcome": "capability_confirmed"
  }
},
```

赛维 `proto_d`：
```json
"key_proposition": {
  "proposition_id": "KP-LDK-01",
  "proposition": "母公司能否在价格下降和高负债下持续提供运营资金、采购信用和技术人员",
  "evidence_status": "partial",
  "visible_facts": [
    "2009年净亏损约2.34亿美元，现金及等价物约3.85亿美元",
    "2009年末短期借款合计约9.8亿美元，全年新取得借款约22.5亿美元、偿还约16.8亿美元",
    "一项银行贷款涉及债务资产比率约束，2010年4月方获豁免",
    "约75%销售来自海外，需求高度暴露于欧洲补贴制度"
  ],
  "verification_questions": [
    {"question_id": "VQ-LDK-01",
     "question": "请披露合肥项目运营资金、技术人员与采购信用的具体安排，以及母公司再融资计划",
     "targets": ["parent_support", "financing_capacity"]}
  ],
  "terminal_verification": {
    "withheld": true,
    "evidence": "终局揭示：2010年8月合肥项目落地后主要资金由地方协调；2012年双反后集团流动性危机，2014年合肥项目资产以约8.7亿元处置",
    "outcome": "parent_support_failed"
  }
},
```

长鑫 `proto_b`：
```json
"key_proposition": {
  "proposition_id": "KP-CX-01",
  "proposition": "技术团队、知识产权路径和长期资本能否按阶段形成闭环",
  "evidence_status": "unverified",
  "visible_facts": [
    "2016年5月与合肥达成推进DRAM项目共识，6月13日设立合肥智聚",
    "无营收、无量产、无可验证的自主DRAM工艺节点",
    "国际龙头已推进20nm级DDR4与LPDDR4技术认证",
    "2016年上半年DRAM价格持续一年多下行，行业接近周期底部"
  ],
  "verification_questions": [
    {"question_id": "VQ-CX-01",
     "question": "请披露核心技术团队名单、IP与专利授权路径，以及分阶段资本投入计划",
     "targets": ["tech_team_depth", "ip_pathway_risk"]}
  ],
  "terminal_verification": {
    "withheld": true,
    "evidence": "终局揭示：合肥通过数轮长期资本持续投入，2019年国产DRAM实现量产并逐步爬坡",
    "outcome": "long_capital_sustained"
  }
},
```

- [ ] **Step 4: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_agents -v`
Expected: PASS（终局隔离测试证明 withheld 内容不进入 S1 公开 Context）。

- [ ] **Step 5: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): register key propositions for BOE/LDK/CX with withheld terminal evidence"
```

---

### Task 8: 企业私有状态 + ScenarioAssumption

**Files:**
- Create: `policytown/investment/core/private_state.py`
- Modify: `policytown/investment/data/hefei_mvp/enterprise_agents.json`
- Modify: `policytown/investment/core/orchestrator.py`
- Create: `policytown/investment/tests/test_private_state.py`

- [ ] **Step 1: 写失败测试**

```python
"""企业私有状态测试（文档 5.2：政府不可见、受约束区间、assumption_class）。

铁律：
1. 私有状态只进入企业 Agent 自身 prompt，绝不进入公开 Context；
2. 区间必须有依据（basis）并记录 assumption_class=latent_scenario_variable；
3. 同 seed 同输入 → 同私有值（运行稳定性）。
"""
from __future__ import annotations

import json
import unittest

from ..core.orchestrator import Orchestrator
from ..core.private_state import make_private_state, ScenarioAssumption, LATENT_CLASS


class TestScenarioAssumption(unittest.TestCase):
    def test_deterministic_draw(self):
        a1 = ScenarioAssumption(key="cash_reserve", range_min=10, range_max=30, basis="依据A")
        a2 = ScenarioAssumption(key="cash_reserve", range_min=10, range_max=30, basis="依据A")
        self.assertEqual(a1.draw(42), a2.draw(42))
        self.assertTrue(10 <= a1.draw(42) <= 30)
        self.assertEqual(a1.to_dict()["assumption_class"], LATENT_CLASS)

    def test_invalid_range_rejected(self):
        with self.assertRaises(ValueError):
            ScenarioAssumption(key="x", range_min=30, range_max=10, basis="依据")


class TestPrivateState(unittest.TestCase):
    def test_make_private_state_uses_baseline_ranges(self):
        enterprise = {
            "private_baseline": {
                "cash_reserve": {"min": 15, "max": 25, "basis": "2007年末货币资金约17亿"},
                "financing_capacity": {"min": 60, "max": 80, "basis": "定增完成"},
            },
            "decision_baseline": {"expansion_appetite": 0.75, "risk_preference": 0.45},
        }
        company = _fake_company()
        ps = make_private_state(company, enterprise, seed=42)
        self.assertTrue(15 <= ps.cash_reserve <= 25)
        self.assertTrue(60 <= ps.financing_capacity <= 80)
        self.assertEqual(ps.expansion_appetite, 0.75)
        self.assertEqual(ps.risk_preference, 0.45)
        self.assertTrue(all(a.assumption_class == LATENT_CLASS for a in ps.assumptions))
        self.assertEqual(len(ps.assumptions), 2)

    def test_private_state_never_in_public_context(self):
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        view = orch.open_stage()
        blob = json.dumps(view["context"], ensure_ascii=False)
        for token in ("cash_reserve", "financing_capacity", "parent_support",
                      "tech_team_depth", "ip_pathway_risk", "assumptions",
                      "latent_scenario_variable"):
            self.assertNotIn(token, blob, "私有字段泄漏进公开 Context：%s" % token)

    def test_private_state_stable_across_runs(self):
        def draw():
            orch = Orchestrator(seed=42)
            orch.start(["proto_a", "proto_d", "proto_b"], "S1")
            return {cid: a.private_state.to_dict()
                    for cid, a in orch.company_agents.items()}
        self.assertEqual(json.dumps(draw(), sort_keys=True),
                         json.dumps(draw(), sort_keys=True))


def _fake_company():
    from ..core.state import CompanyState
    return CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                        metrics={}, cash_points=0, debt_points=0)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_private_state -v`
Expected: FAIL（`core.private_state` 不存在 / `CompanyAgent.private_state` 不存在）。

- [ ] **Step 3: 新建 core/private_state.py**

```python
"""企业私有状态 — 政府不可见，仅企业 Agent 自身可见（文档 5.2 / 4.9.2）。

受约束区间生成：范围必须有公开事实、项目约束或历史机制依据，并记录
assumption_class=latent_scenario_variable。缺失的内部变量允许以受约束区间
生成，但不得凭空捏造与已掌握事实冲突的数值。
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

LATENT_CLASS = "latent_scenario_variable"


@dataclass
class ScenarioAssumption:
    key: str
    range_min: float
    range_max: float
    basis: str
    assumption_class: str = LATENT_CLASS
    generated: bool = False

    def __post_init__(self) -> None:
        if self.range_min > self.range_max:
            raise ValueError("invalid assumption range for %r" % self.key)

    def draw(self, seed: int) -> float:
        """确定性抽样：固定 seed → 固定私有值（验收标准 7）。"""
        rnd = random.Random("%s:%d" % (self.key, seed))
        return round(rnd.uniform(self.range_min, self.range_max), 1)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["assumption_class"] = LATENT_CLASS
        return d


@dataclass
class CompanyPrivateState:
    company_id: str
    cash_reserve: float            # 真实现金储备（政府只见现金带）
    financing_capacity: float      # 真实再融资能力（含母公司支持折算）
    parent_support: float          # 母公司持续提供运营资金/采购信用/人员的能力
    tech_team_depth: float         # 核心技术团队深度
    ip_pathway_risk: float         # 知识产权路径风险
    expansion_appetite: float      # 0-1 扩张惯性（决策底色）
    risk_preference: float         # 0-1 风险偏好（决策底色）
    assumptions: List[ScenarioAssumption] = field(default_factory=list)
    seed: int = 42

    def to_dict(self) -> dict:
        return {"company_id": self.company_id, "cash_reserve": self.cash_reserve,
                "financing_capacity": self.financing_capacity,
                "parent_support": self.parent_support,
                "tech_team_depth": self.tech_team_depth,
                "ip_pathway_risk": self.ip_pathway_risk,
                "expansion_appetite": self.expansion_appetite,
                "risk_preference": self.risk_preference,
                "assumptions": [a.to_dict() for a in self.assumptions]}


def make_private_state(company, enterprise: Optional[dict], seed: int) -> CompanyPrivateState:
    """从 enterprise.private_baseline 取区间构造私有状态；无档案时用行业默认值。

    seed 混合 company_id，保证同一局内不同企业抽样相互独立且可复现。
    """
    baseline = (enterprise or {}).get("private_baseline") or {}
    bl = (enterprise or {}).get("decision_baseline") or {}
    seed = seed + sum(ord(c) for c in company.company_id)
    assumptions: List[ScenarioAssumption] = []
    for key in ("cash_reserve", "financing_capacity", "parent_support",
                "tech_team_depth", "ip_pathway_risk"):
        r = baseline.get(key)
        if r:
            assumptions.append(ScenarioAssumption(
                key=key, range_min=float(r["min"]), range_max=float(r["max"]),
                basis=r.get("basis", "案例私有设定"),
                generated=not r.get("source", "") == "disclosed"))

    def _draw(key: str, default: float) -> float:
        a = next((x for x in assumptions if x.key == key), None)
        return a.draw(seed) if a is not None else default

    return CompanyPrivateState(
        company_id=company.company_id,
        cash_reserve=_draw("cash_reserve", 20.0),
        financing_capacity=_draw("financing_capacity", 50.0),
        parent_support=_draw("parent_support", 40.0),
        tech_team_depth=_draw("tech_team_depth", 45.0),
        ip_pathway_risk=_draw("ip_pathway_risk", 40.0),
        expansion_appetite=float(bl.get("expansion_appetite", 0.5)),
        risk_preference=float(bl.get("risk_preference", 0.5)),
        assumptions=assumptions, seed=seed)
```

- [ ] **Step 4: 为三家核心企业登记 private_baseline**

在 `enterprise_agents.json` 中三家核心企业各自的 `"decision_baseline": {...},` 块之后插入：

京东方 `proto_a`：
```json
"private_baseline": {
  "cash_reserve": {"min": 15, "max": 25, "basis": "2007年末货币资金约17亿元"},
  "financing_capacity": {"min": 60, "max": 80, "basis": "2008年7月定增完成、多元融资渠道已验证"},
  "parent_support": {"min": 50, "max": 70, "basis": "集团运营现金流与北京国资支持记录"},
  "tech_team_depth": {"min": 70, "max": 85, "basis": "北京5代线工程团队已验证建线良率能力"},
  "ip_pathway_risk": {"min": 20, "max": 35, "basis": "TFT-LCD成熟路线，专利授权体系已建立"}
},
```

赛维 `proto_d`：
```json
"private_baseline": {
  "cash_reserve": {"min": 30, "max": 45, "basis": "2009年末现金及等价物3.85亿美元"},
  "financing_capacity": {"min": 30, "max": 45, "basis": "2010年4月获银行豁免后才恢复，续贷依赖高"},
  "parent_support": {"min": 20, "max": 35, "basis": "2009年净亏损2.34亿美元+短贷9.8亿美元"},
  "tech_team_depth": {"min": 55, "max": 65, "basis": "多晶硅铸锭/硅片团队成熟，组件新团队组建中"},
  "ip_pathway_risk": {"min": 15, "max": 25, "basis": "光伏技术壁垒低于半导体，风险主要在价格与融资"}
},
```

长鑫 `proto_b`：
```json
"private_baseline": {
  "cash_reserve": {"min": 10, "max": 20, "basis": "17天新设项目公司，无经营现金流"},
  "financing_capacity": {"min": 35, "max": 50, "basis": "依赖合肥国资与政策性产业资本体系持续注资"},
  "parent_support": {"min": 25, "max": 40, "basis": "地方平台承担融资主体角色，持续能力未验证"},
  "tech_team_depth": {"min": 30, "max": 45, "basis": "早期团队组建中，量产与良率经验待验证"},
  "ip_pathway_risk": {"min": 60, "max": 80, "basis": "DRAM IP壁垒极高，国际龙头已推进20nm级DDR4"}
},
```

- [ ] **Step 5: 编排器 start() 构造私有状态**

在 `core/orchestrator.py` 的 `start()` 中，企业 Agent 创建循环（`orchestrator.py:85-88`）之后追加：

```python
        for cid in companies:
            proto_id = "proto_%s" % cid.split("_")[-1]
            self.company_agents[cid].private_state = make_private_state(
                companies[cid], self.enterprises.get(proto_id), seed)
```

并在文件顶部导入（`from ..core.private_state import make_private_state`）。

- [ ] **Step 6: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_private_state -v`
Expected: PASS（3 例；`private_state` 挂载后公开 Context 无任何私有字段）。

- [ ] **Step 7: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): company private state with bounded scenario assumptions"
```

---

### Task 9: 现实图谱 FactGraph（场景级只读）

**Files:**
- Create: `policytown/investment/memory/fact_graph.py`
- Modify: `policytown/investment/core/state.py`
- Modify: `policytown/investment/core/orchestrator.py`
- Modify: `policytown/investment/core/context.py`
- Modify: `policytown/investment/contracts/context.schema.json`
- Create: `policytown/investment/tests/test_enterprise_memory.py`

- [ ] **Step 1: 写失败测试**

```python
"""一图两账 Memory 测试（文档 5.4）。

现实图谱是场景级共享只读结构：withheld 永不出现、private 只对企业可见、
available_at 晚于截止日的不进入 Context。
"""
from __future__ import annotations

import json
import unittest

from ..memory.fact_graph import FactGraph, FactRecord


class TestFactGraph(unittest.TestCase):
    def _graph(self) -> FactGraph:
        g = FactGraph()
        g.add(FactRecord(fact_id="F1", subject="company_a", predicate="capability",
                         value="verified", effective_at="2008-08-01",
                         available_at="2008-08-31", visibility="public",
                         source_ids=["S1"]))
        g.add(FactRecord(fact_id="F2", subject="company_a", predicate="financing",
                         value="fragile", effective_at="2010-06-01",
                         available_at="2010-06-30", visibility="public",
                         source_ids=["S2"]))
        g.add(FactRecord(fact_id="F3", subject="company_a", predicate="cash",
                         value="high", effective_at="2008-07-01",
                         available_at="2008-07-31", visibility="private",
                         source_ids=["PRIV"]))
        g.add(FactRecord(fact_id="F4", subject="company_a", predicate="outcome",
                         value="success", effective_at="2012-01-01",
                         available_at="2012-06-30", visibility="withheld",
                         source_ids=["TERM"]))
        return g

    def test_cutoff_filter(self):
        g = self._graph()
        visible = {r.fact_id for r in g.visible("2008-09-30", "public")}
        self.assertEqual(visible, {"F1"})

    def test_private_visible_to_enterprise_only(self):
        g = self._graph()
        pub = {r.fact_id for r in g.visible("2008-09-30", "public")}
        ent = {r.fact_id for r in g.visible("2008-09-30", "enterprise")}
        self.assertIn("F3", ent)
        self.assertNotIn("F3", pub)

    def test_withheld_never_visible(self):
        g = self._graph()
        for viewer in ("public", "enterprise"):
            ids = {r.fact_id for r in g.visible("2099-12-31", viewer)}
            self.assertNotIn("F4", ids)

    def test_round_trip(self):
        g = self._graph()
        data = g.to_dict("2099-12-31", "enterprise")
        self.assertEqual(len(data), 3)  # F4 withheld 不序列化
        for d in data:
            self.assertIn("fact_id", d)


class TestFactGraphInContext(unittest.TestCase):
    def test_s1_context_facts_cutoff_aware(self):
        from ..core.orchestrator import Orchestrator
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        view = orch.open_stage()
        facts = view["context"]["fact_graph"]
        self.assertTrue(facts, "S1 Context 必须包含现实图谱")
        subjects = {f["subject"] for f in facts}
        self.assertIn("company_a", subjects, "京东方可见事实应在 S1 出现")
        self.assertNotIn("company_d", subjects, "赛维可见事实晚于 S1 截止日（2010-06-30）")
        for f in facts:
            self.assertLessEqual(f["available_at"], view["context"]["cutoff_at"])

    def test_withheld_terminal_never_in_any_stage_context(self):
        from ..core.orchestrator import Orchestrator
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        blobs = []
        for stage_id in ("S1", "S2", "S3", "S4"):
            view = orch.open_stage()
            blobs.append(json.dumps(view["context"], ensure_ascii=False))
            if stage_id != "S4":
                orch.submit_decisions([])
                orch.advance_stage()
        import os
        data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "data", "hefei_mvp")
        with open(os.path.join(data_dir, "enterprise_agents.json"), encoding="utf-8") as f:
            for e in json.load(f)["enterprises"]:
                kp = e.get("key_proposition")
                if kp:
                    for blob in blobs:
                        self.assertNotIn(kp["terminal_verification"]["evidence"], blob)
                        self.assertNotIn(kp["terminal_verification"]["outcome"], blob)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_memory -v`
Expected: FAIL（`memory.fact_graph` 不存在 / Context 无 `fact_graph` 键）。

- [ ] **Step 3: 新建 memory/fact_graph.py**

```python
"""现实图谱（场景级共享、只读）— 文档 5.4.1。

记录"这个世界里什么事实成立"：subject / predicate / value / effective_at /
available_at / visibility / source_ids。对 Agent 只读：运行时无写接口暴露给 Agent。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class FactRecord:
    fact_id: str
    subject: str
    predicate: str
    value: str
    effective_at: str
    available_at: str
    visibility: str = "public"   # public | private | withheld
    source_ids: List[str] = field(default_factory=list)

    def visible_at(self, cutoff: str, viewer: str = "public") -> bool:
        if self.visibility == "withheld":
            return False
        if self.visibility == "private" and viewer == "public":
            return False
        return self.available_at <= cutoff


class FactGraph:
    def __init__(self) -> None:
        self.records: List[FactRecord] = []

    def add(self, rec: FactRecord) -> None:
        self.records.append(rec)

    def visible(self, cutoff: str, viewer: str = "public") -> List[FactRecord]:
        return [r for r in self.records if r.visible_at(cutoff, viewer)]

    def to_dict(self, cutoff: str, viewer: str = "public") -> List[dict]:
        return [{"fact_id": r.fact_id, "subject": r.subject, "predicate": r.predicate,
                 "value": r.value, "effective_at": r.effective_at,
                 "available_at": r.available_at, "visibility": r.visibility,
                 "source_ids": list(r.source_ids)}
                for r in self.visible(cutoff, viewer)]
```

- [ ] **Step 4: 创建 memory/__init__.py（占位，Task 12 填充完整容器）**

```python
"""企业 Agent Memory：一图两账（文档 5.4）。"""
from .fact_graph import FactGraph, FactRecord

__all__ = ["FactGraph", "FactRecord"]
```

- [ ] **Step 5: WorldState 挂载 FactGraph**

`core/state.py` 顶部导入后、`WorldState` 类中追加字段：

```python
from ..memory.fact_graph import FactGraph
...
@dataclass
class WorldState:
    ...
    history: List[dict] = field(default_factory=list)
    fact_graph: FactGraph = field(default_factory=FactGraph)
```

- [ ] **Step 6: 编排器 start() 从关键命题播种现实图谱**

在 `core/orchestrator.py` 的 `start()` 中（私有状态接线之后）追加：

```python
        # 现实图谱播种：仅关键命题的可见事实（available_at=企业决策截止日）
        for cid, agent in self.company_agents.items():
            ent = agent.enterprise or {}
            kp = ent.get("key_proposition")
            if not kp:
                continue
            avail = ent.get("decision_cutoff", stage["cutoff_at"])
            for i, fact in enumerate(kp.get("visible_facts", [])):
                self.state.fact_graph.add(FactRecord(
                    fact_id="FACT-%s-%02d" % (ent.get("enterprise_id", cid).upper(), i + 1),
                    subject=cid, predicate="visible_fact", value=fact,
                    effective_at=avail, available_at=avail, visibility="public",
                    source_ids=["CASE-%s" % ent.get("prototype_id", "?").upper()]))
```

并在文件顶部导入 `from ..memory.fact_graph import FactRecord`。

- [ ] **Step 7: build_context 注入 fact_graph**

`core/context.py` 的 `build_context` 返回 dict 中追加（`"evidence_pack": evidence_pack,` 之后）：

```python
        "fact_graph": state.fact_graph.to_dict(cutoff, "public"),
```

并在 `slim_context` 的 `if kind == "company_plan":` 分支内追加：

```python
        slim["fact_graph"] = ctx.get("fact_graph", [])
```

- [ ] **Step 8: 更新 contracts/context.schema.json**

- `required` 数组追加 `"fact_graph"`
- `properties` 追加：

```json
"fact_graph": {
  "type": "array",
  "description": "现实图谱（只读）：withheld 永不出现，available_at 不晚于 cutoff_at",
  "items": {
    "type": "object",
    "required": ["fact_id", "subject", "predicate", "value", "available_at", "visibility"],
    "properties": {
      "fact_id": {"type": "string"},
      "subject": {"type": "string"},
      "predicate": {"type": "string"},
      "value": {"type": "string"},
      "effective_at": {"type": "string"},
      "available_at": {"type": "string"},
      "visibility": {"type": "string", "enum": ["public", "private", "withheld"]},
      "source_ids": {"type": "array", "items": {"type": "string"}}
    }
  }
}
```

- [ ] **Step 9: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_memory -v`
Expected: PASS（8 例：FactGraph 单元 5 + Context 集成 2 + 隔离 1）。

- [ ] **Step 10: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): scene-level fact graph with cutoff/visibility filtering"
```

---

### Task 10: 判断账 BeliefLedger

**Files:**
- Create: `policytown/investment/memory/belief_ledger.py`
- Modify: `policytown/investment/tests/test_enterprise_memory.py`

- [ ] **Step 1: 写失败测试（bounded_evidence_blend_v1）**

在 `test_enterprise_memory.py` 追加：

```python
from ..memory.belief_ledger import BeliefLedger, make_default_beliefs


class TestBeliefLedger(unittest.TestCase):
    def test_defaults_from_risk_preference(self):
        beliefs = make_default_beliefs(risk_preference=0.5)
        self.assertEqual(set(beliefs), {"market_recovery", "financing_continuity",
                                        "tech_execution", "government_fulfillment"})
        self.assertTrue(all(0.0 <= v <= 1.0 for v in beliefs.values()))

    def test_blend_rule(self):
        ledger = BeliefLedger()
        ledger.init_defaults({"financing_continuity": 0.5})
        e = ledger.update("financing_continuity", signal=0.9, signal_weight=0.8,
                          stage_id="S2", evidence_ids=["E1"])
        # w = min(0.5, 0.8) = 0.5 → 0.5*0.5 + 0.9*0.5 = 0.7
        self.assertAlmostEqual(e.value, 0.7, places=6)
        self.assertEqual(e.update_rule, "bounded_evidence_blend_v1")
        self.assertEqual(e.updated_at, "S2")
        self.assertIn("E1", e.evidence_ids)

    def test_clamp_and_confidence(self):
        ledger = BeliefLedger()
        ledger.init_defaults({"market_recovery": 0.9})
        e = ledger.update("market_recovery", signal=0.0, signal_weight=0.5, stage_id="S3",
                          evidence_ids=["E2"])
        # 0.9*0.75 + 0.0*0.25 → w=min(0.5,0.5)*... 见 update 实现：w = 0.5*0.5=0.25
        self.assertGreater(e.confidence, 0.5)
        self.assertGreaterEqual(e.value, 0.0)

    def test_evidence_dedup_and_append(self):
        ledger = BeliefLedger()
        ledger.init_defaults({"tech_execution": 0.5})
        ledger.update("tech_execution", signal=0.6, signal_weight=0.3, stage_id="S1",
                      evidence_ids=["E1"])
        e = ledger.update("tech_execution", signal=0.6, signal_weight=0.3, stage_id="S2",
                          evidence_ids=["E1", "E2"])
        self.assertEqual(e.evidence_ids, ["E1", "E2"])

    def test_round_trip(self):
        ledger = BeliefLedger()
        ledger.init_defaults(make_default_beliefs(0.5))
        ledger.update("financing_continuity", signal=0.7, signal_weight=0.5, stage_id="S2",
                      evidence_ids=["E1"])
        data = ledger.to_dict()
        self.assertEqual(len(data), 4)
        self.assertEqual([d["update_rule"] for d in data], ["bounded_evidence_blend_v1"] * 4)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_memory -v`
Expected: FAIL（`memory.belief_ledger` 不存在）。

- [ ] **Step 3: 新建 memory/belief_ledger.py**

```python
"""判断账（企业级动态记忆）— 文档 5.4.2。

只保留四类会直接改变企业决策的判断：市场、融资、技术项目、政府履约。
更新规则 bounded_evidence_blend_v1：新证据与旧信念加权混合，单次最多修正一半差距，
防止信念突变；每次变化都要保留触发证据与更新阶段。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

_UPDATE_RULE = "bounded_evidence_blend_v1"
BELIEF_KEYS = ("market_recovery", "financing_continuity",
               "tech_execution", "government_fulfillment")


@dataclass
class BeliefEntry:
    belief_id: str
    value: float
    confidence: float
    evidence_ids: List[str] = field(default_factory=list)
    updated_at: str = ""
    update_rule: str = _UPDATE_RULE

    def to_dict(self) -> dict:
        return {"belief_id": self.belief_id, "value": round(self.value, 2),
                "confidence": round(self.confidence, 2),
                "evidence_ids": list(self.evidence_ids),
                "updated_at": self.updated_at, "update_rule": self.update_rule}


class BeliefLedger:
    def __init__(self) -> None:
        self.entries: Dict[str, BeliefEntry] = {}

    def init_defaults(self, values: Dict[str, float]) -> None:
        for k, v in values.items():
            self.entries.setdefault(k, BeliefEntry(belief_id=k, value=v, confidence=0.5))

    def update(self, belief_id: str, signal: float, signal_weight: float,
               stage_id: str, evidence_ids: List[str]) -> BeliefEntry:
        """bounded_evidence_blend_v1：
        w = clamp(0.05, 0.5, signal_weight)；new = clamp(0,1, old*(1-w) + signal*w)。
        置信度随证据强度温和上升；证据去重追加。
        """
        e = self.entries.setdefault(
            belief_id, BeliefEntry(belief_id=belief_id, value=0.5, confidence=0.3))
        w = min(0.5, max(0.05, signal_weight))
        blended = e.value * (1 - w) + signal * w
        e.value = max(0.0, min(1.0, blended))
        e.confidence = min(1.0, e.confidence + signal_weight * 0.2)
        e.evidence_ids = list(dict.fromkeys(e.evidence_ids + list(evidence_ids)))
        e.updated_at = stage_id
        return e

    def get(self, belief_id: str) -> BeliefEntry:
        return self.entries[belief_id]

    def to_dict(self) -> List[dict]:
        return [e.to_dict() for e in self.entries.values()]


def make_default_beliefs(risk_preference: float) -> Dict[str, float]:
    """风险偏好决定初始信念：越保守 → 对市场/融资的初始判断越谨慎。"""
    base = round(0.5 - (risk_preference - 0.5) * 0.2, 3)
    return {k: base for k in BELIEF_KEYS}
```

- [ ] **Step 4: 更新 memory/__init__.py 导出**

```python
"""企业 Agent Memory：一图两账（文档 5.4）。"""
from .fact_graph import FactGraph, FactRecord
from .belief_ledger import BeliefEntry, BeliefLedger, make_default_beliefs

__all__ = ["FactGraph", "FactRecord", "BeliefEntry", "BeliefLedger",
           "make_default_beliefs"]
```

- [ ] **Step 5: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_memory -v`
Expected: PASS（新增 5 例全过）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): belief ledger with bounded evidence blend rule"
```

---

### Task 11: 承诺账 CommitmentLedger

**Files:**
- Create: `policytown/investment/memory/commitment_ledger.py`
- Modify: `policytown/investment/memory/__init__.py`
- Modify: `policytown/investment/tests/test_enterprise_memory.py`

- [ ] **Step 1: 写失败测试（承诺生命周期 + 机器可读）**

在 `test_enterprise_memory.py` 追加：

```python
from ..memory.commitment_ledger import CommitmentLedger, CommitmentRecord, STATUSES


class TestCommitmentLedger(unittest.TestCase):
    def test_lifecycle(self):
        ledger = CommitmentLedger()
        rec = CommitmentRecord(commitment_id="C-S1-001", party="company_a",
                               promise="complete_pilot_line", due_stage="S2",
                               condition="second_tranche_release")
        ledger.add(rec)
        self.assertEqual([r.commitment_id for r in ledger.due_in("S2")], ["C-S1-001"])
        self.assertEqual(ledger.due_in("S3"), [])
        ledger.mark("C-S1-001", "fulfilled")
        self.assertEqual(ledger.due_in("S2"), [], "已履约承诺不再到期")
        self.assertEqual(rec.status, "fulfilled")

    def test_mark_invalid_status_rejected(self):
        ledger = CommitmentLedger()
        ledger.add(CommitmentRecord(commitment_id="C-1", party="government",
                                    promise="provide_capital", due_stage="S2",
                                    condition="agreement"))
        with self.assertRaises(ValueError):
            ledger.mark("C-1", "nonsense")
        with self.assertRaises(KeyError):
            ledger.mark("C-9", "pending")

    def test_statuses_enum(self):
        self.assertEqual(set(STATUSES),
                         {"pending", "fulfilled", "delayed", "breached",
                          "insufficient_evidence"})

    def test_machine_readable(self):
        ledger = CommitmentLedger()
        ledger.add(CommitmentRecord(commitment_id="C-1", party="government",
                                    promise="provide_capital", due_stage="S2",
                                    condition="agreement", source_ids=["agreement:S1-001"]))
        data = ledger.to_dict()
        self.assertEqual(data[0]["condition"], "agreement")
        self.assertEqual(data[0]["status"], "pending")
        self.assertIn("source_ids", data[0])
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_memory -v`
Expected: FAIL（`memory.commitment_ledger` 不存在）。

- [ ] **Step 3: 新建 memory/commitment_ledger.py**

```python
"""承诺账（政企共同账目）— 文档 5.4.3。

记录政府承诺的投入/配套/融资协调、企业承诺的出资/建设/技术/订单里程碑、
下一笔资金触发条件、违约/暂停追加/退出条款与当前履约状态。
必须机器可读：规则引擎与投后随访（P2.5）将直接读取本账目。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

STATUSES = ("pending", "fulfilled", "delayed", "breached", "insufficient_evidence")


@dataclass
class CommitmentRecord:
    commitment_id: str
    party: str            # company_a | government
    promise: str
    due_stage: str
    condition: str
    status: str = "pending"
    source_ids: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"commitment_id": self.commitment_id, "party": self.party,
                "promise": self.promise, "due_stage": self.due_stage,
                "condition": self.condition, "status": self.status,
                "source_ids": list(self.source_ids)}


class CommitmentLedger:
    def __init__(self) -> None:
        self.records: List[CommitmentRecord] = []

    def add(self, rec: CommitmentRecord) -> None:
        self.records.append(rec)

    def due_in(self, stage_id: str) -> List[CommitmentRecord]:
        """该阶段到期且仍未履约的承诺（随访与触发下一笔投资的输入）。"""
        return [r for r in self.records if r.due_stage == stage_id and r.status == "pending"]

    def mark(self, commitment_id: str, status: str) -> None:
        if status not in STATUSES:
            raise ValueError("invalid commitment status: %r" % status)
        for r in self.records:
            if r.commitment_id == commitment_id:
                r.status = status
                return
        raise KeyError(commitment_id)

    def to_dict(self) -> List[dict]:
        return [r.to_dict() for r in self.records]
```

- [ ] **Step 4: 更新 memory/__init__.py 导出**

```python
"""企业 Agent Memory：一图两账（文档 5.4）。"""
from .fact_graph import FactGraph, FactRecord
from .belief_ledger import BeliefEntry, BeliefLedger, make_default_beliefs
from .commitment_ledger import CommitmentLedger, CommitmentRecord, STATUSES

__all__ = ["FactGraph", "FactRecord", "BeliefEntry", "BeliefLedger",
           "make_default_beliefs", "CommitmentLedger", "CommitmentRecord", "STATUSES"]
```

- [ ] **Step 5: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_memory -v`
Expected: PASS（新增 4 例全过）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): machine-readable commitment ledger"
```

---

### Task 12: EnterpriseMemory 容器 + 企业 Agent 接线（身份/Memory 分离）

**Files:**
- Modify: `policytown/investment/memory/__init__.py`
- Modify: `policytown/investment/agents/company.py`
- Modify: `policytown/investment/tests/test_enterprise_memory.py`

- [ ] **Step 1: 写失败测试（plan prompt 含三块分离内容；公开 Context 不含任何私有/记忆字段）**

在 `test_enterprise_memory.py` 追加：

```python
from ..agents.company import CompanyAgent


class _CapturingLlm:
    def __init__(self) -> None:
        self.prompts: list = []

    def __call__(self, prompt: str, validator=None) -> dict:
        self.prompts.append(prompt)
        return {"company_id": "company_a", "action": "wait",
                "capital_request_next_round": 0.0,
                "resource_allocation": {"construction": 0.2, "research": 0.2,
                                        "market": 0.2, "cash_buffer": 0.4},
                "milestone_target": "construction_done", "risk_response": "observe",
                "competition_response": "wait", "evidence_ids": [], "confidence": 0.5}


def _view(company_id="company_a"):
    return {"company_id": company_id, "anon_label": "企业A", "industry": "display",
            "status": "建设",
            "metrics": {"financial_health": 50, "execution_ability": 50,
                        "technology_readiness": 50, "customer_order_strength": 50,
                        "construction_progress": 20, "production_ramp": 0,
                        "project_cashflow": -10, "capital_intensity": 40},
            "cash_band": "一般", "capital_request": 30,
            "milestones_done": [], "evidence_ids": []}


def _mini_ctx():
    return {"cutoff_at": "2008-09-30", "market": {}, "city": {}, "companies": [],
            "evidence_pack": {}, "fact_graph": []}


class TestAgentMemorySeparation(unittest.TestCase):
    def test_plan_prompt_has_baseline_private_memory(self):
        import json
        enterprise = {
            "prototype_id": "proto_a", "enter_stage": "S1",
            "decision_cutoff": "2008-08-31", "industry": "display",
            "system_prompt": "你是京东方系企业决策代表。",
            "stage_contexts": {},
            "decision_baseline": {"management_objectives": ["扩代"], "expansion_appetite": 0.75,
                                  "risk_preference": 0.45,
                                  "financing_constraints": {"bank_credit": "strong"},
                                  "negotiation_stance": "cooperative"},
            "private_baseline": {"cash_reserve": {"min": 15, "max": 25, "basis": "年报口径"}},
        }
        from ..core.private_state import make_private_state
        from ..core.state import CompanyState
        comp = CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                            metrics={}, cash_points=0, debt_points=0)
        llm = _CapturingLlm()
        agent = CompanyAgent("company_a", enterprise=enterprise, llm_fn=llm)
        agent.private_state = make_private_state(comp, enterprise, seed=42)
        agent.plan(_view(), _mini_ctx(), 0.0, "S1")
        blob = llm.prompts[-1]
        for token in ('"decision_baseline"', '"private_state"', '"memory"',
                      '"cash_reserve"', '"beliefs"', '"commitments"'):
            self.assertIn(token, blob, "plan prompt 缺 %s" % token)

    def test_identity_static_memory_dynamic(self):
        """决策底色固定；判断账/承诺账是动态记忆，互不混淆。"""
        enterprise = {
            "prototype_id": "proto_a", "enter_stage": "S1",
            "decision_cutoff": "2008-08-31", "industry": "display",
            "system_prompt": "你是京东方系企业决策代表。", "stage_contexts": {},
            "decision_baseline": {"management_objectives": ["扩代"], "expansion_appetite": 0.75,
                                  "risk_preference": 0.45,
                                  "financing_constraints": {"bank_credit": "strong"},
                                  "negotiation_stance": "cooperative"},
        }
        from ..core.private_state import make_private_state
        from ..core.state import CompanyState
        comp = CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                            metrics={}, cash_points=0, debt_points=0)
        agent = CompanyAgent("company_a", enterprise=enterprise, llm_fn=None)
        agent.private_state = make_private_state(comp, enterprise, seed=42)
        before = agent.memory.to_dict()
        agent.memory.beliefs.update("financing_continuity", signal=0.2,
                                    signal_weight=0.8, stage_id="S1", evidence_ids=["E1"])
        after = agent.memory.to_dict()
        self.assertNotEqual(before, after, "判断账必须随证据变化")
        self.assertEqual(agent.enterprise["decision_baseline"]["expansion_appetite"], 0.75,
                         "决策底色固定不变")

    def test_public_context_has_no_memory_fields(self):
        import json
        from ..core.orchestrator import Orchestrator
        orch = Orchestrator(seed=42)
        orch.start(["proto_a", "proto_d", "proto_b"], "S1")
        view = orch.open_stage()
        blob = json.dumps(view["context"], ensure_ascii=False)
        for token in ("beliefs", "commitments", "management_objectives",
                      "expansion_appetite", "risk_preference"):
            self.assertNotIn(token, blob, "Memory/底色泄漏进公开 Context：%s" % token)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_memory -v`
Expected: FAIL（`CompanyAgent` 无 `memory` / `private_state` 属性，plan prompt 缺字段）。

- [ ] **Step 3: memory/__init__.py 增加 EnterpriseMemory 容器**

```python
"""企业 Agent Memory：一图两账（文档 5.4）。

- 现实图谱（fact_graph.py）：场景级共享只读，挂 WorldState
- 判断账（belief_ledger.py）：企业级动态信念
- 承诺账（commitment_ledger.py）：政企共同账目

企业身份、管理层目标、扩张惯性与风险偏好属于固定"决策底色"（enterprise_agents.json
的 decision_baseline），不属于 Memory。
"""
from __future__ import annotations

from typing import Optional

from .fact_graph import FactGraph, FactRecord
from .belief_ledger import BeliefEntry, BeliefLedger, make_default_beliefs
from .commitment_ledger import CommitmentLedger, CommitmentRecord, STATUSES

__all__ = ["FactGraph", "FactRecord", "BeliefEntry", "BeliefLedger",
           "make_default_beliefs", "CommitmentLedger", "CommitmentRecord",
           "STATUSES", "EnterpriseMemory"]


class EnterpriseMemory:
    """单局企业记忆容器（每个 run_id 独立，互不污染，文档 5.4.4）。"""

    def __init__(self, risk_preference: float = 0.5) -> None:
        self.beliefs = BeliefLedger()
        self.beliefs.init_defaults(make_default_beliefs(risk_preference))
        self.commitments = CommitmentLedger()

    def to_dict(self) -> dict:
        return {"beliefs": self.beliefs.to_dict(),
                "commitments": self.commitments.to_dict()}
```

- [ ] **Step 4: 修改 agents/company.py — 私有状态 + Memory 接线**

在 `company.py` 顶部导入：

```python
from ..memory import EnterpriseMemory
from ..core.private_state import CompanyPrivateState, make_private_state
```

`__init__` 追加属性：

```python
        self.enterprise = enterprise
        self.private_state: Optional[CompanyPrivateState] = None
        self.memory = EnterpriseMemory(risk_preference=float(
            (enterprise or {}).get("decision_baseline", {}).get("risk_preference", 0.5)))
        self._counter_made: Dict[str, bool] = {}
```

（`typing` 导入追加 `Dict`。）

`plan()` 中 `payload` 构建追加（企业档案存在时）：

```python
        if self.enterprise:
            ...
            payload["decision_baseline"] = self.enterprise.get("decision_baseline", {})
            payload["memory"] = self.memory.to_dict()
            if self.private_state is not None:
                payload["private_state"] = self.private_state.to_dict()
```

- [ ] **Step 5: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_enterprise_memory -v`
Expected: PASS（新增 3 例 + 既有 17 例全过；公开 Context 仍无记忆/底色字段）。

- [ ] **Step 6: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): wire enterprise memory and private state into company agent"
```

---

### Task 13: 企业核验回应契约（VerificationResponse）

**Files:**
- Create: `policytown/investment/contracts/verification_response.schema.json`
- Modify: `policytown/investment/fallback/deterministic.py`
- Modify: `policytown/investment/agents/company.py`
- Create: `policytown/investment/tests/test_negotiation.py`

- [ ] **Step 1: 写失败测试**

```python
"""政企协商契约测试：核验回应 + 一次性反提案（文档 4.6 / 8.6）。

铁律：
1. 回应受企业私有状态与决策底色约束，五种状态可全部到达；
2. 反提案每阶段只出现一次；接受/拒绝受扩张惯性、风险偏好驱动；
3. 回应与反提案不修改任何数值（协商层只表达意图）。
"""
from __future__ import annotations

import unittest

from ..agents.company import CompanyAgent
from ..core.private_state import make_private_state, CompanyPrivateState
from ..core.state import CompanyState


def _comp() -> CompanyState:
    return CompanyState(company_id="company_a", anon_label="企业A", industry="display",
                        metrics={}, cash_points=0, debt_points=0)


def _agent(private: dict, appetite: float = 0.5, risk: float = 0.5) -> CompanyAgent:
    agent = CompanyAgent("company_a", llm_fn=None)  # llm_fn=None → 确定性 fallback
    agent.private_state = CompanyPrivateState(
        company_id="company_a", cash_reserve=private.get("cash_reserve", 20),
        financing_capacity=private.get("financing_capacity", 50),
        parent_support=private.get("parent_support", 50),
        tech_team_depth=50, ip_pathway_risk=40,
        expansion_appetite=appetite, risk_preference=risk)
    return agent


def _view():
    return {"company_id": "company_a", "anon_label": "企业A", "industry": "display",
            "metrics": {}, "cash_band": "一般", "capital_request": 30,
            "evidence_ids": ["E1"]}


class TestVerificationResponse(unittest.TestCase):
    def test_all_five_states_reachable(self):
        cases = [
            ({"financing_capacity": 80, "parent_support": 80}, "full_disclosure"),
            ({"financing_capacity": 55, "parent_support": 55}, "range"),
        ]
        seen = set()
        for priv, expect in cases:
            resp = _agent(priv).respond_to_verification(
                {"question_id": "VQ-1", "question": "披露融资安排"}, _view(), {})
            self.assertEqual(resp["response_type"], expect)
            self.assertEqual(resp["question_id"], "VQ-1")
            seen.add(resp["response_type"])
        # partial_disclosure / refusal / condition_offer 由 risk_preference 分支区分
        resp_low = _agent({"financing_capacity": 30, "parent_support": 30}, risk=0.4) \
            .respond_to_verification({"question_id": "VQ-2", "question": "披露融资安排"},
                                     _view(), {})
        self.assertEqual(resp_low["response_type"], "partial_disclosure")
        resp_cond = _agent({"financing_capacity": 30, "parent_support": 30}, risk=0.8) \
            .respond_to_verification({"question_id": "VQ-3", "question": "披露融资安排"},
                                     _view(), {})
        self.assertEqual(resp_cond["response_type"], "condition_offer")
        resp_ref = _agent({"financing_capacity": 15, "parent_support": 15}, risk=0.4) \
            .respond_to_verification({"question_id": "VQ-4", "question": "披露融资安排"},
                                     _view(), {})
        self.assertEqual(resp_ref["response_type"], "refusal")
        seen.update({resp_low["response_type"], resp_cond["response_type"],
                     resp_ref["response_type"]})
        self.assertEqual(seen, {"full_disclosure", "range", "partial_disclosure",
                                "condition_offer", "refusal"})

    def test_range_bounds_are_consistent(self):
        resp = _agent({"financing_capacity": 55, "parent_support": 55}) \
            .respond_to_verification({"question_id": "VQ-1", "question": "q"}, _view(), {})
        lo, hi = resp["ranges"]["financing_capacity"]
        self.assertLessEqual(lo, hi)

    def test_verification_schema_valid(self):
        from ..agents.company import validate_verification_response
        resp = _agent({"financing_capacity": 80, "parent_support": 80}) \
            .respond_to_verification({"question_id": "VQ-1", "question": "q"}, _view(), {})
        validate_verification_response(resp)  # 不抛异常即通过
        resp["response_type"] = "nonsense"
        with self.assertRaises(ValueError):
            validate_verification_response(resp)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation -v`
Expected: FAIL（`respond_to_verification` 不存在）。

- [ ] **Step 3: 新建 contracts/verification_response.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.2/verification_response",
  "title": "VerificationResponse v0.2 — 企业关键核验回应",
  "description": "文档 4.6：完整披露 / 部分披露 / 区间 / 拒答 / 交换条件。企业可策略性隐瞒，不得捏造与已掌握事实冲突的内容。",
  "type": "object",
  "required": ["company_id", "question_id", "response_type", "statement",
               "evidence_ids", "confidence"],
  "properties": {
    "company_id": {"type": "string"},
    "question_id": {"type": "string"},
    "response_type": {"type": "string",
                      "enum": ["full_disclosure", "partial_disclosure", "range",
                               "refusal", "condition_offer"]},
    "statement": {"type": "string"},
    "ranges": {
      "type": "object",
      "description": "response_type=range 时的受约束区间",
      "additionalProperties": {
        "type": "array",
        "items": {"type": "number"},
        "minItems": 2,
        "maxItems": 2
      }
    },
    "counter_conditions": {
      "type": "array",
      "description": "response_type=condition_offer 时政府需先承诺的条件",
      "items": {
        "type": "object",
        "required": ["condition_id", "condition"],
        "properties": {
          "condition_id": {"type": "string"},
          "condition": {"type": "string"}
        }
      }
    },
    "evidence_ids": {"type": "array", "items": {"type": "string"}},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1}
  }
}
```

- [ ] **Step 4: fallback/deterministic.py 增加 verification_response**

追加：

```python
def verification_response(company: dict, private_state, question: dict, ctx: dict) -> dict:
    """企业按私有状态与利益目标作策略性回应（文档 4.6 / 5.2）。

    路由：融资与母公司支持强度决定披露程度；风险偏好高 → 交换条件；
    强度过低 → 拒答。不修改任何数值。
    """
    qid = question.get("question_id", "VQ-?")
    ps = private_state.to_dict() if private_state is not None else {}
    strength = min(ps.get("financing_capacity", 50.0), ps.get("parent_support", 50.0))
    risk = ps.get("risk_preference", 0.5)
    ev = company.get("evidence_ids", [])
    if strength >= 65:
        return {"company_id": company["company_id"], "question_id": qid,
                "response_type": "full_disclosure",
                "statement": "具备经核实的融资与执行能力，愿意提供资金证明与融资安排概要",
                "evidence_ids": ev, "confidence": 0.8}
    if strength >= 40:
        fc = ps.get("financing_capacity", 50.0)
        return {"company_id": company["company_id"], "question_id": qid,
                "response_type": "range",
                "statement": "相关能力处于正常区间，可披露大致范围",
                "ranges": {"financing_capacity": [round(max(0.0, fc - 10), 1),
                                                  round(fc + 10, 1)]},
                "evidence_ids": ev, "confidence": 0.6}
    if risk >= 0.65:
        return {"company_id": company["company_id"], "question_id": qid,
                "response_type": "condition_offer",
                "statement": "可先行披露概要，但要求政府先承诺资本支持框架",
                "counter_conditions": [{"condition_id": "CO-1",
                                        "condition": "政府先给出资本支持框架"}],
                "evidence_ids": ev, "confidence": 0.5}
    if strength >= 25:
        return {"company_id": company["company_id"], "question_id": qid,
                "response_type": "partial_disclosure",
                "statement": "涉及商业安排的部分仅披露概要",
                "evidence_ids": ev, "confidence": 0.5}
    return {"company_id": company["company_id"], "question_id": qid,
            "response_type": "refusal",
            "statement": "相关信息属于商业秘密，拒绝披露；可协商其他核验方式",
            "evidence_ids": [], "confidence": 0.4}
```

- [ ] **Step 5: agents/company.py 增加核验回应方法与校验器**

模块级追加：

```python
_VERIFY_REQUIRED = ["company_id", "question_id", "response_type", "statement",
                    "evidence_ids", "confidence"]
_VERIFY_TYPES = ("full_disclosure", "partial_disclosure", "range",
                 "refusal", "condition_offer")


def validate_verification_response(out: dict) -> None:
    missing = [k for k in _VERIFY_REQUIRED if k not in out]
    if missing:
        raise ValueError("verification response missing keys: %s" % missing)
    if out["response_type"] not in _VERIFY_TYPES:
        raise ValueError("invalid response_type: %r" % out["response_type"])
    for k, r in out.get("ranges", {}).items():
        if not (isinstance(r, list) and len(r) == 2 and r[0] <= r[1]):
            raise ValueError("invalid range for %r: %r" % (k, r))
```

类方法追加（`respond_to_verification` 只表达意图，不改数值）：

```python
    def respond_to_verification(self, question: dict, company_view: dict, ctx: dict) -> dict:
        """企业按私有状态与利益目标作策略性回应关键核验问题。"""
        slim = slim_context(ctx, "company_plan", company_view["company_id"])
        payload = {"question": question, "company": company_view, "ctx": slim,
                   "private_state": self.private_state.to_dict()
                   if self.private_state is not None else None,
                   "memory": self.memory.to_dict()}
        return self.run(
            payload,
            lambda: deterministic.verification_response(company_view, self.private_state,
                                                        question, ctx),
            validator=validate_verification_response)
```

- [ ] **Step 6: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation -v`
Expected: PASS（3 例；五种回应状态全部可达）。

- [ ] **Step 7: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): verification response contract with strategic fallback"
```

---

### Task 14: 一次性反提案契约（CounterProposal）

**Files:**
- Create: `policytown/investment/contracts/counter_proposal.schema.json`
- Modify: `policytown/investment/fallback/deterministic.py`
- Modify: `policytown/investment/agents/company.py`
- Modify: `policytown/investment/tests/test_negotiation.py`

- [ ] **Step 1: 写失败测试**

在 `test_negotiation.py` 追加：

```python
class TestCounterProposal(unittest.TestCase):
    def test_high_appetite_requests_more(self):
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.8, risk=0.5)
        prop = agent.make_counter_proposal(
            {"capital_points": 40, "milestone_due": "S2", "risk_conditions": ["tranches"]},
            _view(), {}, "S1")
        self.assertIsNotNone(prop)
        req = {r["key"]: r for r in prop["requests"]}
        self.assertIn("capital_points", req)
        self.assertEqual(req["capital_points"]["requested"], 50.0)
        self.assertEqual(prop["accepts"][0]["item"], "risk_conditions")

    def test_high_risk_rejects_exit_clause(self):
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.4, risk=0.8)
        prop = agent.make_counter_proposal(
            {"capital_points": 40, "milestone_due": "S2",
             "risk_conditions": ["exit_clause"]},
            _view(), {}, "S1")
        self.assertIn("exit_clause", prop["rejects"])
        self.assertIn({"item": "tranches", "note": "接受分期拨付以替代退出条款"},
                      prop["accepts"])

    def test_low_appetite_accepts(self):
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.3, risk=0.3)
        prop = agent.make_counter_proposal(
            {"capital_points": 40, "milestone_due": "S2", "risk_conditions": ["exit_clause"]},
            _view(), {}, "S1")
        self.assertEqual(prop["requests"], [])
        self.assertEqual(prop["rejects"], [])

    def test_one_time_per_stage(self):
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.8, risk=0.5)
        first = agent.make_counter_proposal({"capital_points": 40, "risk_conditions": []},
                                            _view(), {}, "S1")
        second = agent.make_counter_proposal({"capital_points": 40, "risk_conditions": []},
                                             _view(), {}, "S1")
        self.assertIsNotNone(first)
        self.assertIsNone(second, "同一阶段反提案只能出现一次")
        third = agent.make_counter_proposal({"capital_points": 40, "risk_conditions": []},
                                            _view(), {}, "S2")
        self.assertIsNotNone(third, "下一阶段允许新的反提案")

    def test_proposal_schema_valid(self):
        from ..agents.company import validate_counter_proposal
        agent = _agent({"cash_reserve": 30, "financing_capacity": 55, "parent_support": 55},
                       appetite=0.8, risk=0.8)
        prop = agent.make_counter_proposal(
            {"capital_points": 40, "milestone_due": "S2", "risk_conditions": ["exit_clause"]},
            _view(), {}, "S1")
        validate_counter_proposal(prop)
        prop["rejects"] = ["nonsense"]
        with self.assertRaises(ValueError):
            validate_counter_proposal(prop)
```

- [ ] **Step 2: 运行确认失败**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation -v`
Expected: FAIL（`make_counter_proposal` / `validate_counter_proposal` 不存在）。

- [ ] **Step 3: 新建 contracts/counter_proposal.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "investment_simulation/v0.2/counter_proposal",
  "title": "CounterProposal v0.2 — 企业一次性反提案",
  "description": "文档 4.6：每阶段只出现一次；可要求提高投入、降低条件、延后里程碑、增加城市配套或拒绝方案。",
  "type": "object",
  "required": ["proposal_id", "company_id", "summary", "accepts", "requests",
               "rejects", "alternative"],
  "properties": {
    "proposal_id": {"type": "string"},
    "company_id": {"type": "string"},
    "summary": {"type": "string"},
    "accepts": {
      "type": "array",
      "description": "接受的条件单条目",
      "items": {
        "type": "object",
        "required": ["item", "note"],
        "properties": {
          "item": {"type": "string",
                   "enum": ["capital_points", "support_focus", "milestone_due",
                            "risk_conditions", "exit_clause", "tranches"]},
          "note": {"type": "string"}
        }
      }
    },
    "requests": {
      "type": "array",
      "description": "要求调整的条目",
      "items": {
        "type": "object",
        "required": ["key", "current", "requested", "reason"],
        "properties": {
          "key": {"type": "string",
                  "enum": ["capital_points", "support_focus", "milestone_due",
                           "risk_conditions", "exit_clause", "tranches"]},
          "current": {},
          "requested": {},
          "reason": {"type": "string"}
        }
      }
    },
    "rejects": {"type": "array",
                "items": {"type": "string",
                          "enum": ["capital_points", "support_focus", "milestone_due",
                                   "risk_conditions", "exit_clause", "tranches"]}},
    "alternative": {
      "type": ["object", "null"],
      "description": "替代条款：延后里程碑 / 以分期替代退出等",
      "properties": {
        "milestone_due": {"type": ["string", "null"]},
        "note": {"type": "string"}
      }
    }
  }
}
```

- [ ] **Step 4: fallback/deterministic.py 增加 counter_proposal**

追加：

```python
def counter_proposal(company: dict, private_state, conditions: dict, stage_id: str) -> dict:
    """企业一次性反提案（文档 4.6）。

    扩张惯性高 → 要求提高投入/延后里程碑；风险偏好高 → 拒绝退出条款并以分期替代。
    不修改任何数值；提案只表达意图。
    """
    ps = private_state.to_dict() if private_state is not None else {}
    appetite = ps.get("expansion_appetite", 0.5)
    risk = ps.get("risk_preference", 0.5)
    current = float(conditions.get("capital_points", 0))
    milestone = conditions.get("milestone_due") or ""
    accepts: list = []
    requests: list = []
    rejects: list = []
    if appetite >= 0.7:
        requests.append({"key": "capital_points", "current": current,
                         "requested": round(current * 1.25, 1),
                         "reason": "重资产项目首期资金需求高于初始方案"})
        if len(milestone) == 2 and milestone[0] == "S" and milestone[1:].isdigit():
            requests.append({"key": "milestone_due", "current": milestone,
                             "requested": "S%d" % (int(milestone[1:]) + 1),
                             "reason": "量产爬坡周期长于政府预期"})
    if "exit_clause" in conditions.get("risk_conditions", []) and risk >= 0.6:
        rejects.append("exit_clause")
        accepts.append({"item": "tranches", "note": "接受分期拨付以替代退出条款"})
    else:
        accepts.append({"item": "risk_conditions", "note": "接受其余风险条件"})
    summary = ("接受政府条件单，无附加要求" if not requests and not rejects
               else "接受多数条件，请求调整资金规模与里程碑")
    alternative = None
    if rejects:
        milestone_req = next((r for r in requests if r["key"] == "milestone_due"), None)
        alternative = {"milestone_due": milestone_req["requested"] if milestone_req else None,
                       "note": "以分期拨付替代退出条款"}
    return {"proposal_id": "CP-%s-%s" % (company["company_id"], stage_id),
            "company_id": company["company_id"], "summary": summary,
            "accepts": accepts, "requests": requests, "rejects": rejects,
            "alternative": alternative}
```

- [ ] **Step 5: agents/company.py 增加反提案方法与校验器**

模块级追加：

```python
_COUNTER_REQUIRED = ["proposal_id", "company_id", "summary", "accepts",
                     "requests", "rejects", "alternative"]
_COUNTER_ITEMS = ("capital_points", "support_focus", "milestone_due",
                  "risk_conditions", "exit_clause", "tranches")


def validate_counter_proposal(out: dict) -> None:
    missing = [k for k in _COUNTER_REQUIRED if k not in out]
    if missing:
        raise ValueError("counter proposal missing keys: %s" % missing)
    for r in out.get("requests", []):
        if r.get("key") not in _COUNTER_ITEMS:
            raise ValueError("invalid request key: %r" % r.get("key"))
    for item in out.get("rejects", []):
        if item not in _COUNTER_ITEMS:
            raise ValueError("invalid reject item: %r" % item)
    for a in out.get("accepts", []):
        if a.get("item") not in _COUNTER_ITEMS:
            raise ValueError("invalid accept item: %r" % a.get("item"))
```

`CompanyAgent` 类方法追加：

```python
    def make_counter_proposal(self, conditions: dict, company_view: dict,
                              ctx: dict, stage_id: str):
        """一次性反提案：同一阶段只允许一次（文档 4.6）。"""
        if self._counter_made.get(stage_id):
            return None
        self._counter_made[stage_id] = True
        slim = slim_context(ctx, "company_plan", company_view["company_id"])
        payload = {"conditions": conditions, "company": company_view, "ctx": slim,
                   "private_state": self.private_state.to_dict()
                   if self.private_state is not None else None,
                   "memory": self.memory.to_dict()}
        return self.run(
            payload,
            lambda: deterministic.counter_proposal(company_view, self.private_state,
                                                   conditions, stage_id),
            validator=validate_counter_proposal)
```

- [ ] **Step 6: 运行确认通过**

Run: `python3 -m unittest policytown.investment.tests.test_negotiation -v`
Expected: PASS（新增 5 例全过）。

- [ ] **Step 7: 提交**

```bash
git add policytown/investment
git commit -m "feat(p0.5): one-time counter proposal contract with strategic fallback"
```

---

### Task 15: 全量回归 + 端到端验证

**Files:** 无（仅运行验证）

- [ ] **Step 1: 运行全部单元测试**

Run:
```bash
python3 -m unittest discover -s policytown/investment/tests -v
```
Expected: 全部 PASS。统计应覆盖：
- test_smoke（6 例：预算守恒/确定性/未投资企业演化/告急消息/截止隔离/历史回放）
- test_enterprise_agents（12 例：数据契约 + 阶段注入 + 匿名化 + 决策底色 + 关键命题隔离）
- test_departments（9 例：部门命名/备忘录校验/fallback 形状/fiscal 全局/确定性）
- test_private_state（3 例）、test_enterprise_memory（20 例）、test_negotiation（8 例）

- [ ] **Step 2: 端到端确定性演示**

Run: `cd policytown/investment && python3 run_demo.py`
Expected: 打印 S1—S4 结算（预算守恒、里程碑、收件箱）与终局四评分；写出 `demo_run.json`；历史 Replay 基线正常。

- [ ] **Step 3: 泄漏审计专项**

Run: `python3 -m unittest policytown.investment.tests.test_smoke.TestSmoke.test_cutoff_isolation policytown.investment.tests.test_enterprise_agents.TestKeyProposition -v`
Expected: PASS（公开 Context 无真实案例名、无终局证据、无私有字段）。

- [ ] **Step 4: 可选 — LLM 路径验证**

Run: `python3 -m policytown.investment.run_demo_llm`
Expected: 逐轮调用模型（约 50 次，写 `.cache/llm_cache.json`），断网自动降级 fallback；四部门备忘录与核验/反提案契约在新 prompt 下校验通过。

- [ ] **Step 5: 提交（如有遗漏改动）**

```bash
git add policytown/investment docs
git commit -m "feat(p0.5): full regression for department and enterprise contract freeze"
```

---

## Self-Review 对照

**P0 覆盖：**
- 四部门命名：Task 1（KINDS/角色名/Context 分支/fallback/JSON Schema 枚举）
- 初审备忘录：Task 2（schema + validate_memorandum + BaseAgent 深层校验）、Task 3（fallback 输出）、Task 4（LLM prompt）、Task 5（视图接线）
- 保留确定性 fallback：Task 3 全部重写为确定性备忘录；`llm_fn=None` 路径不变

**P0.5 覆盖：**
- 关键未穿透项登记：Task 7（京东方/赛维/长鑫 + withheld 终局隔离测试）
- 私有状态/受约束区间/scenario_assumption：Task 8（`LATENT_CLASS` 常量 + 确定性抽样 + 隐私测试）
- 事实图/判断账/承诺账：Task 9 / 10 / 11（含 cutoff 过滤、blend 规则、机器可读）
- 核验回应与反提案 Schema：Task 13 / 14（契约 JSON + 校验器 + 确定性 fallback + 一次性守卫）
- 身份/目标/风险偏好与 Memory 分离：Task 6（decision_baseline）+ Task 12（EnterpriseMemory 接线 + 分离测试）

**不在本计划内（后续）：** 部门质询（P1）、政企协商编排（P1.5）、联席方案接入玩家（P2）、投后随访（P2.5）、SQLite 持久化（产品文档 10.1.2，结构先行后迁移）。
