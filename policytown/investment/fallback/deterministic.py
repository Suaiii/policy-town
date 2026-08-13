"""确定性 fallback — LLM 超时/断网/校验失败时的完整替代大脑。

保证两件事：
1. 验收标准 8：断网也能走完整演示；
2. 主线永不冻结：企业每轮强制产出合法动作，即使没钱。
所有判断都是状态阈值的纯函数：同样输入 → 同样输出（确定性）。
"""
from __future__ import annotations

from typing import List, Optional


# ---------- 四专业 Agent 的确定性研判 ----------

def professional_assessment(kind: str, ctx: dict, company: Optional[dict]) -> dict:
    m = company["metrics"] if company else None
    market = ctx["market"].get(company["industry"]) if company else None

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
        ev = company["evidence_ids"] if company else []
        return {"agent": "fiscal", "company_id": company["company_id"] if company else None,
                "direction": direction, "score": score, "confidence": 0.8,
                "key_factors": factors, "evidence_ids": ev, "reasoning_summary": summary}

    if kind == "economy":
        base = ctx["city"]["industrial_base"].get(company["industry"], 20.0)
        talent = ctx["city"]["talent_supply"]
        score = round(0.6 * base + 0.4 * talent, 1)
        direction = _dir(score)
        return {"agent": "economy", "company_id": company["company_id"],
                "direction": direction, "score": score, "confidence": 0.7,
                "key_factors": [
                    {"metric_id": "industrial_base", "effect": "positive" if base >= 40 else "negative"},
                    {"metric_id": "talent_supply", "effect": "positive" if talent >= 50 else "neutral"}],
                "evidence_ids": company["evidence_ids"],
                "reasoning_summary": "本地产业基础 %d、人才 %d：%s" % (
                    base, talent, "具备承接条件" if direction == "positive" else "配套存在缺口")}

    if kind == "sci_tech":
        score = round(0.5 * m["execution_ability"] + 0.5 * m["technology_readiness"], 1)
        direction = _dir(score)
        return {"agent": "sci_tech", "company_id": company["company_id"],
                "direction": direction, "score": score, "confidence": 0.65,
                "key_factors": [
                    {"metric_id": "execution_ability", "effect": "positive" if m["execution_ability"] >= 55 else "negative"},
                    {"metric_id": "technology_readiness", "effect": "positive" if m["technology_readiness"] >= 55 else "neutral"}],
                "evidence_ids": company["evidence_ids"],
                "reasoning_summary": "执行 %d / 技术成熟 %d：%s" % (
                    m["execution_ability"], m["technology_readiness"],
                    "能把钱变成产能" if direction == "positive" else "兑现风险需关注")}

    # development
    score = round(50 + 0.5 * market["cycle"] + 0.3 * market["price_trend"], 1)
    score = max(0, min(100, score))
    direction = _dir(score)
    return {"agent": "development", "company_id": company["company_id"],
            "direction": direction, "score": score, "confidence": 0.7,
            "key_factors": [
                {"metric_id": "market_cycle", "effect": "positive" if market["cycle"] > 0 else "negative"},
                {"metric_id": "supply_pressure", "effect": "negative" if market["supply_pressure"] >= 60 else "neutral"}],
            "evidence_ids": company["evidence_ids"],
            "reasoning_summary": "景气 %d / 价格趋势 %d / 供给压力 %d：%s" % (
                market["cycle"], market["price_trend"], market["supply_pressure"],
                "时点有利" if direction == "positive" else "下行风险主导，宜逆周期评估")}


# ---------- 企业 Agent 的确定性策略 ----------

def company_plan(company: dict, ctx: dict, funded_points: float) -> dict:
    """状态阈值路由：先活下去，再抢窗口，最后扩张。每轮必有输出。"""
    m = company["metrics"]
    cash_band = company.get("cash_band", "一般")
    market = ctx["market"].get(company["industry"], {})
    rivals = company.get("rivals_summary", [])

    if cash_band == "紧张":
        action, risk = "finance", "delay_expansion"
    elif market.get("cycle", 0) < -25 and cash_band != "充裕":
        action, risk = "contract", "conserve_cash"
    elif funded_points >= 25 and m["construction_progress"] < 60:
        action, risk = "expand", "aggressive_build"
    elif m["technology_readiness"] < 55 and funded_points >= 10:
        action, risk = "research", "close_tech_gap"
    elif m["construction_progress"] >= 60 and m["customer_order_strength"] < 60:
        action, risk = "seek_orders", "fill_capacity"
    elif funded_points <= 0 and company.get("status") == "停滞":
        action, risk = "relocate", "seek_better_city"
    else:
        action, risk = "wait", "observe"

    competition_response = "wait"
    if any(r.get("market_pressure") == "high" for r in rivals):
        competition_response = "price_cut" if cash_band == "充裕" else "market_focus"

    if action in ("expand", "research"):
        request = max(0.0, company["capital_request"] * 0.7)
    elif action in ("finance", "contract"):
        request = company["capital_request"]
    else:
        request = max(0.0, company["capital_request"] * 0.4)

    alloc = {"expand": (0.55, 0.2, 0.1, 0.15), "research": (0.25, 0.45, 0.1, 0.2),
             "finance": (0.1, 0.1, 0.1, 0.7), "seek_orders": (0.15, 0.1, 0.5, 0.25),
             "contract": (0.05, 0.05, 0.1, 0.8), "relocate": (0.0, 0.0, 0.2, 0.8),
             "wait": (0.2, 0.2, 0.2, 0.4)}[action]
    target = "pilot_production" if m["construction_progress"] >= 60 else "construction_done"

    return {"company_id": company["company_id"], "action": action,
            "capital_request_next_round": round(request, 1),
            "resource_allocation": {"construction": alloc[0], "research": alloc[1],
                                    "market": alloc[2], "cash_buffer": alloc[3]},
            "milestone_target": target, "risk_response": risk,
            "competition_response": competition_response,
            "message_to_government": None,
            "evidence_ids": company["evidence_ids"],
            "confidence": 0.7}


def _dir(score: float) -> str:
    if score >= 55:
        return "positive"
    if score >= 40:
        return "neutral"
    return "negative"
