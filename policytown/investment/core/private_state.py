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
