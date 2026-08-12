"""人才侧规则：求职池、期望薪资、offer 接受（确定性部分）"""
PREMIUM = {"A型": 1.2, "B型": 1.1, "C型": 1.05, "D型": 1.0}
INFLOW_BASE = {"A型": 2, "B型": 3, "C型": 2, "D型": 2}


def expected_salary(profile, policy_multipliers=None):
    """期望薪资 = 原薪资 × 人群溢价 × 政策加成"""
    base = profile["salary"] if profile["salary"] > 0 else 10
    mult = PREMIUM[profile["segment"]]
    if policy_multipliers:
        mult += policy_multipliers.get(profile["segment"], 0.0)
    return round(base * mult, 1)


def build_applicant_pool(profiles):
    """求职池 = 失业 + 主动求职者"""
    return [p for p in profiles if p["job_searching"]]


def match_market(profiles, firms, rng, policy_multipliers=None):
    """撮合：企业按名额选人（按风险偏好排序），人才按期望薪资接受。

    返回 (更新后的 profiles, 更新后的 firms)
    """
    applicants = build_applicant_pool(profiles)
    applicants.sort(key=lambda p: (p["risk_aversion"], p["name"]))

    jobs = []
    for f in firms:
        for _ in range(f["recruiting"]):
            jobs.append(f)
    rng.shuffle(jobs)

    assigned = set()
    for job in jobs:
        for app in applicants:
            if app["name"] in assigned:
                continue
            seg = app["segment"]
            offer_salary = job["salary_level"].get(seg, 10)
            if offer_salary >= expected_salary(app, policy_multipliers):
                assigned.add(app["name"])
                app["employer"] = job["firm"]
                app["salary"] = offer_salary
                app["job_searching"] = False
                app["offer"] = {"firm": job["firm"], "salary": offer_salary}
                job["headcount"][seg] = job["headcount"].get(seg, 0) + 1
                break
    return profiles, firms


def apply_inflow(profiles, active_policies, rng):
    """政策驱动的外地流入：按弹性系数表生成新人才（占位实现）"""
    from .elasticity import load_table
    et = load_table()
    total_inflow = 0
    for pid, st in active_policies.items():
        if st.get("params", {}).get("type") != "talent_cash":
            continue
        for seg in st.get("params", {}).get("target_segments", []):
            coeff = et.effect(pid, seg, "外地流入")
            n = int(coeff * INFLOW_BASE[seg] * 10)
            for _ in range(n):
                profiles.append({
                    "name": f"流入_{rng.randint(1000, 9999)}",
                    "segment": seg, "employer": None, "salary": 0,
                    "savings_months": 6, "risk_aversion": 0.5,
                    "family_tie": "外地", "job_searching": True, "offer": None,
                })
            total_inflow += n
    return profiles, total_inflow
