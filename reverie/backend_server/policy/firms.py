"""企业行为规则（确定性）"""
import random


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def decide_firm_month(firm, active_policies, seed=0):
    """计算企业一个月的行为决策，返回可序列化 dict。

    active_policies: {policy_id: {"params": {...}}}（引擎注入）
    """
    rng = random.Random(seed)
    market_shock = rng.uniform(-0.05, 0.05)

    # 1) 利润更新 + 政策补贴（firm_cash 类按人头补贴）
    subsidy = 0.0
    regulation_enforcement = 0.0
    for pid, st in active_policies.items():
        params = st.get("params", {})
        if params.get("type") == "firm_cash":
            per_head = params.get("amount_wan_per_head", 0.0)
            covered = sum(firm.headcount.get(s, 0)
                          for s in params.get("target_segments", []))
            subsidy += per_head * covered
        if params.get("type") == "regulation":
            regulation_enforcement = max(regulation_enforcement,
                                         params.get("enforcement", 0.0))
    profit_new = firm.profit * (1 + market_shock) + subsidy

    # 2) 裁员风险：利润下滑 → 风险上升
    profit_change = (profit_new - firm.profit) / max(firm.profit, 1)
    layoff_risk = _clamp(0.3 - profit_change * 2.0, 0.0, 0.9)

    # 3) 招聘名额：缺口 × 政策弹性 × 监管预期
    gap = firm.skills_needed.get("紧缺", 0) + firm.skills_needed.get("一般", 0)
    policy_boost = 1.0
    for pid, st in active_policies.items():
        params = st.get("params", {})
        if params.get("type") == "firm_cash" and params.get("amount_wan_per_head", 0) > 0:
            policy_boost += 0.3
    recruit_factor = (1 - regulation_enforcement * 0.6)
    recruiting = max(0, int(gap * policy_boost * recruit_factor *
                            (1 - firm.expected_future_firing_cost)))

    # 4) 裁员批次：风险高 → 按 D 型→C 型顺序裁
    layoffs = {}
    if layoff_risk > 0.6 and regulation_enforcement < 0.9:
        cap = 20 if regulation_enforcement > 0 else 999
        for seg in ("D型", "C型"):
            n = min(firm.headcount.get(seg, 0), 2)
            if regulation_enforcement > 0:
                n = min(n, max(0, cap - sum(layoffs.values())))
            layoffs[seg] = n
            if sum(layoffs.values()) >= cap:
                break

    # 5) 薪酬：缺口大且利润足 → 上调紧缺人群 5%
    salary_level = dict(firm.salary_level)
    if gap > 0 and profit_new > firm.labor_cost:
        for seg in ("A型", "B型"):
            if firm.headcount.get(seg, 0) > 0:
                salary_level[seg] = round(salary_level[seg] * 1.05, 1)

    return {
        "firm": firm.firm,
        "profit": round(profit_new, 1),
        "layoff_risk": round(layoff_risk, 2),
        "recruiting": recruiting,
        "layoffs": layoffs,
        "salary_level": salary_level,
        "expected_future_firing_cost": firm.expected_future_firing_cost,
    }
