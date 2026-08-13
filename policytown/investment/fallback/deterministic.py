"""确定性 fallback — LLM 超时/断网/校验失败时的完整替代大脑。

保证两件事：
1. 验收标准 8：断网也能走完整演示；
2. 主线永不冻结：企业每轮强制产出合法动作，即使没钱。
所有判断都是状态阈值的纯函数：同样输入 → 同样输出（确定性）。
"""
from __future__ import annotations

from typing import List, Optional


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


# ---------- 四专业 Agent 的确定性研判 ----------

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


def _dir(score: float) -> str:
    if score >= 55:
        return "positive"
    if score >= 40:
        return "neutral"
    return "negative"
