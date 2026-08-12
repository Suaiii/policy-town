"""月度结算主流程 —— 确定性：同输入同输出（seed 固定）"""
import copy
import random

from .firms import decide_firm_month
from .workers import match_market, apply_inflow
from .metrics import compute_metrics
from .elasticity import load_table


def settle_month(month, profiles, firms, policies, seed=0):
    """结算一个月。

    返回 {"profiles": [...], "firms": [...], "metrics": {...},
           "events": [...]}  全部可 JSON 序列化。
    """
    rng = random.Random(seed)
    profiles = copy.deepcopy(profiles)
    firms = copy.deepcopy(firms)
    et = load_table()
    events = []

    # 1) 政策状态推进（到期移除）
    active = {}
    for pid, st in policies.items():
        if st["months_left"] > 0:
            st["months_left"] -= 1
            active[pid] = st
        else:
            events.append(f"政策 {pid} 到期")

    # 2) 政策乘数 → 人才期望薪资加成（按弹性表）
    policy_multipliers = {}
    for pid, st in active.items():
        for seg in ("A型", "B型", "C型", "D型"):
            coeff = et.effect(pid, seg, "跳槽意愿")
            if coeff:
                policy_multipliers[seg] = policy_multipliers.get(seg, 0.0) + coeff * 0.3

    # 3) 企业决策
    firm_dicts = []
    for f in firms:
        decision = decide_firm_month(f, active, seed=seed)
        for seg, n in decision["layoffs"].items():
            for _ in range(n):
                for p in reversed(profiles):
                    if p["employer"] == f["firm"] and p["segment"] == seg:
                        p["employer"] = None
                        p["job_searching"] = True
                        events.append(f"{p['name']} 被 {f['firm']} 裁员")
                        break
        f["profit"] = decision["profit"]
        f["salary_level"] = decision["salary_level"]
        f["layoff_risk"] = decision["layoff_risk"]
        f["recruiting"] = decision["recruiting"]
        f["expected_future_firing_cost"] = decision["expected_future_firing_cost"]
        firm_dicts.append(f)

    # 4) 人才市场撮合
    profiles, firm_dicts = match_market(profiles, firm_dicts, rng, policy_multipliers)

    # 5) 政策驱动的外地流入
    profiles, inflow = apply_inflow(profiles, active, rng)

    # 6) 指标统计
    housing_index = round(100 + inflow * 0.5, 1)
    metrics = compute_metrics(month, profiles, firm_dicts, active, housing_index)
    metrics.net_inflow = inflow

    return {
        "profiles": profiles,
        "firms": firm_dicts,
        "metrics": metrics.to_dict(),
        "events": events,
    }
