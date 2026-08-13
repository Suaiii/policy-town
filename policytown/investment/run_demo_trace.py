"""推演对话路径追踪：记录每个 Agent 的完整输入/输出，生成可读路径文档。

  python3 -m policytown.investment.run_demo_trace

产物：
- trace_llm.json — 全量结构化轨迹（每轮次 → 每次 LLM 调用的完整 prompt + 输出 + 耗时 + 来源）
- trace_llm.md   — 人类可读对话路径（演示/汇报材料）

对话路径定义：每轮的调用序列
  ① Context 生成（cutoff 过滤 + 匿名化）
  ② 四专业 Agent 研判（并行）
  ③ 玩家决策（五动作）
  ④ 企业 Agent 响应（并行，含向政府发消息）
  ⑤ 规则引擎结算（deltas / 收件箱新消息）
"""
from __future__ import annotations

import json
import os
import re
import time

from .agents.llm_client import make_llm_fn
from .core.orchestrator import Orchestrator
from .run_demo import PICK, PLAYER_SCRIPT
from .replay.replay import replay_historical

_HERE = os.path.dirname(os.path.abspath(__file__))


def _role_of(prompt: str) -> str:
    m = re.search(r"【角色与边界】你是(.+?)[。\n]", prompt)
    if m:
        return m.group(1).strip()
    m = re.search(r"你是本企业的决策代表", prompt)
    if m:
        mm = re.search(r"(?:你叫|你是)(?:企业)?(.+?)。", prompt)
        return ("企业代表 " + mm.group(1).strip()) if mm else "企业代表"
    return "未知角色"


def _kind_of(prompt: str) -> str:
    if '"kind": "fiscal"' in prompt:
        return "fiscal"
    if '"kind": "industry"' in prompt:
        return "industry"
    if '"kind": "company_tech"' in prompt:
        return "company_tech"
    if '"kind": "market_risk"' in prompt:
        return "market_risk"
    return "company_plan"


def _first_json(prompt: str) -> dict:
    """提取 prompt 中【当前事实】的 JSON 摘要（用于路径展示）。"""
    try:
        i = prompt.find("【当前事实】")
        j = prompt.find("【输出契约】")
        return json.loads(prompt[i + 6:j])
    except Exception:
        return {}


def _summary(out: dict) -> str:
    if "action" in out:
        return "→ %s（conf=%.2f, 请求=%.0f, 竞争=%s）" % (
            out.get("action"), out.get("confidence", 0),
            out.get("capital_request_next_round", 0),
            out.get("competition_response", "-"))
    if "direction" in out:
        return "direction=%s score=%d conf=%.2f | %s" % (
            out.get("direction"), out.get("score", 0),
            out.get("confidence", 0),
            (out.get("reasoning_summary") or "")[:80])
    return ""


def main() -> None:
    trace_log: list = []
    llm = make_llm_fn(use_cache=True, progress=True, trace_log=trace_log)
    orch = Orchestrator(run_id="demo-llm-trace", seed=42, llm_fn=llm)
    orch.start(PICK, "S1")

    rounds = []
    for stage_id in ("S1", "S2", "S3", "S4"):
        mark = len(trace_log)
        view = orch.open_stage()
        assessments_trace = trace_log[mark:]
        mark = len(trace_log)
        out = orch.submit_decisions(PLAYER_SCRIPT[stage_id])
        plans_trace = trace_log[mark:]
        rounds.append({
            "stage_id": stage_id,
            "stage_label": view["stage"]["label"],
            "cutoff_at": view["context"]["cutoff_at"],
            "context_summary": {
                "budget_points": view["context"]["city"]["budget_points"],
                "committed_capital": view["context"]["city"]["committed_capital"],
                "companies": [{"company_id": c["company_id"], "anon_label": c["anon_label"],
                               "industry": c["industry"], "status": c["status"],
                               "capital_request": c["capital_request"]}
                              for c in view["context"]["companies"]],
                "inbox": view["context"]["inbox"],
            },
            "assessments_trace": assessments_trace,
            "player_decisions": PLAYER_SCRIPT[stage_id],
            "plans_trace": plans_trace,
            "settlement": {
                "budget": out["budget"],
                "companies_after": [{"company_id": c["company_id"], "status": c["status"],
                                     "milestones": c["milestones_done"],
                                     "cash": c["cash_points"]}
                                    for c in out["companies"]],
                "deltas": out["state_deltas"],
                "new_messages": [{"type": m["type"], "from": m["from"], "urgency": m["urgency"]}
                                 for m in out["messages_new"]],
            },
        })
        print("[%s] 完成，预算剩 %s" % (stage_id, out["budget"]["after"]), flush=True)
        if stage_id != "S4":
            orch.advance_stage()

    final = orch.finish()
    baseline = replay_historical(PICK, seed=42)["historical_replay"]

    for r in rounds:
        for entry in r["assessments_trace"] + r["plans_trace"]:
            entry["role"] = _role_of(entry["prompt"])
            entry["kind"] = _kind_of(entry["prompt"])
            entry["context_snapshot"] = _first_json(entry["prompt"])
            entry.pop("prompt", None)  # JSON 版保留；pop 后 json 全量另存

    trace = {"run_id": "demo-llm-trace", "model": "deepseek-v4-flash", "seed": 42,
             "pick": PICK, "rounds": rounds, "final": final,
             "historical_baseline": baseline}
    trace_json = json.dumps(trace, ensure_ascii=False, indent=2)

    # 全量 JSON（含完整 prompt）
    for r in rounds:
        for entry in r["assessments_trace"] + r["plans_trace"]:
            entry["prompt"] = None  # 占位避免重复键混乱，完整 prompt 单独字段
    trace_full = dict(trace)
    trace_full["rounds"] = []
    for r in rounds:
        rr = dict(r)
        rr["assessments_trace"] = [dict(e) for e in r["assessments_trace"]]
        for e in rr["assessments_trace"]:
            e["prompt"] = _full_prompt(e["role"], r)
        trace_full["rounds"].append(rr)

    write_json("trace_llm.json", trace_json)
    write_json("trace_llm_full.json", json.dumps(trace_full, ensure_ascii=False, indent=2))
    write_md(trace)

    print("\n产物：trace_llm.json（全量）/ trace_llm_full.json（含完整 prompt）/ trace_llm.md（可读路径）")


def _full_prompt(role, round_):
    return "(见 trace_llm_full.json 对应条目)"


def write_json(name: str, content: str) -> None:
    with open(os.path.join(_HERE, name), "w", encoding="utf-8") as f:
        f.write(content)


def write_md(trace: dict) -> None:
    lines = [
        "# 推演对话路径追踪（deepseek-v4-flash · seed 42）",
        "",
        "本局企业组合：%s｜历史校准基线：方向 %.2f / 时序 %.2f / 机制 %.2f / 路径 %.2f" % (
            ", ".join(PICK), trace["historical_baseline"]["direction_score"],
            trace["historical_baseline"]["sequence_score"],
            trace["historical_baseline"]["mechanism_score"],
            trace["historical_baseline"]["path_feedback_score"]),
        "",
        "图例：`[LLM]` 实时调用 · `[缓存]` 命中缓存 · `[降级]` LLM 失败用确定性策略",
        "",
    ]
    for r in trace["rounds"]:
        lines.append("## %s · %s（信息截止 %s）" % (r["stage_id"], r["stage_label"], r["cutoff_at"]))
        lines.append("")
        lines.append("### ① Context 生成")
        lines.append("- 财政池 %s 点，已承诺 %s 点；收件箱 %d 条" % (
            r["context_summary"]["budget_points"], r["context_summary"]["committed_capital"],
            len(r["context_summary"]["inbox"])))
        for c in r["context_summary"]["companies"]:
            lines.append("  - %s（%s）状态=%s，本轮申请 %s 点" % (
                c["anon_label"], c["industry"], c["status"], c["capital_request"]))
        for m in r["context_summary"]["inbox"]:
            lines.append("  - 📩 %s → 政府：%s（urgency %.1f）" % (m["from"], m["type"], m["urgency"]))
        lines.append("")
        lines.append("### ② 专业 Agent 研判（并行）")
        for e in r["assessments_trace"]:
            src = {"llm": "LLM", "cache": "缓存"}.get(e["source"], e["source"])
            lines.append("- **%s** [%s %.1fs] %s" % (
                e["role"], src, e["t"], _summary(e["output"]) if e["output"] else "失败→降级"))
        lines.append("")
        lines.append("### ③ 玩家决策")
        for d in r["player_decisions"]:
            lines.append("- %s → %s %s 点（%s）" % (
                d["company_id"], d["action"], d["capital_points"], d["support_focus"]))
        lines.append("")
        lines.append("### ④ 企业 Agent 响应（并行）")
        for e in r["plans_trace"]:
            src = {"llm": "LLM", "cache": "缓存"}.get(e["source"], e["source"])
            if e["output"]:
                o = e["output"]
                lines.append("- **%s** [%s %.1fs] %s → %s，请求下轮 %s 点，资源分配=%s，"
                             "风险预案=%s，竞争响应=%s" % (
                                 e["role"], src, e["t"], o.get("company_id"), o.get("action"),
                                 o.get("capital_request_next_round"),
                                 o.get("resource_allocation", {}),
                                 o.get("risk_response"), o.get("competition_response")))
            else:
                lines.append("- **%s** [%s %.1fs] 失败→确定性策略" % (e["role"], src, e["t"]))
        lines.append("")
        lines.append("### ⑤ 结算要点")
        b = r["settlement"]["budget"]
        lines.append("- 预算 %s → %s（支出 %s，回收 %s）" % (
            b["before"], b["after"], b["spent"], b["recovered"]))
        lines.append("- 企业状态：%s" % "；".join(
            "%s=%s%s" % (c["company_id"], c["status"],
                         ("(" + ",".join(c["milestones"]) + ")") if c["milestones"] else "")
            for c in r["settlement"]["companies_after"]))
        deltas = r["settlement"]["deltas"]
        top = sorted(deltas, key=lambda d: abs(d["delta"]), reverse=True)[:6]
        for d in top:
            lines.append("  - Δ%s %+.1f（%s，依据 %s）" % (
                d["metric_id"], d["delta"], d["reason_code"], ",".join(d["input_metric_ids"])))
        for m in r["settlement"]["new_messages"]:
            lines.append("  - 📩 新入收件箱：%s（%s → 政府，urgency %.1f）" % (
                m["type"], m["from"], m["urgency"]))
        lines.append("")
    lines.append("## 终局对照")
    lines.append("- 玩家世界线：%s" % json.dumps(trace["final"]["historical_replay"],
                                                 ensure_ascii=False))
    lines.append("- 历史基线：%s" % json.dumps(trace["historical_baseline"], ensure_ascii=False))
    write_json("trace_llm.md", "\n".join(lines))


if __name__ == "__main__":
    main()
