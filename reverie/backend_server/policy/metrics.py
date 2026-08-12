"""月度指标统计"""
from .types import CityMetrics


def compute_metrics(month, profiles, firms, policies, housing_index):
    total = len(profiles)
    employed = sum(1 for p in profiles if p["employer"] is not None)
    seg_unemp = {}
    for seg in ("A型", "B型", "C型", "D型"):
        seg_profiles = [p for p in profiles if p["segment"] == seg]
        seg_unemp[seg] = round(
            sum(1 for p in seg_profiles if p["employer"] is None) / max(len(seg_profiles), 1), 2)

    firm_gap = {f["firm"]: f["skills_needed"].get("紧缺", 0) + f["skills_needed"].get("一般", 0)
                for f in firms}

    salaries = [p["salary"] for p in profiles if p["employer"]]
    avg_salary = round(sum(salaries) / max(len(salaries), 1), 1)

    fiscal = 0.0
    for pid, st in policies.items():
        params = st.get("params", {})
        fiscal += params.get("amount_wan", 0)

    return CityMetrics(
        month=month,
        net_inflow=0,
        employment_rate=round(employed / max(total, 1), 2),
        segment_unemployment=seg_unemp,
        firm_gap=firm_gap,
        avg_salary=avg_salary,
        housing_index=housing_index,
        fiscal_spending=round(fiscal, 1),
    )
