"""共享本体实例：证据、企业、市场、城市、世界状态。

写权限：只有 RulesEngine 可以修改数值；Agent / 前端只读投影。
"""
from __future__ import annotations

import copy
from dataclasses import dataclass, field, asdict
from typing import Dict, List

from ..memory.fact_graph import FactGraph

COMPANY_METRICS = (
    "financial_health", "execution_ability", "technology_readiness",
    "customer_order_strength", "construction_progress", "production_ramp",
    "project_cashflow", "capital_intensity",
)
COMPANY_STATUS = ("建设", "量产", "承压", "停滞", "退出")
MILESTONE_THRESHOLDS = {"construction_done": ("construction_progress", 60),
                        "pilot_production": ("production_ramp", 50),
                        "scale_up": ("production_ramp", 80)}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


@dataclass
class Evidence:
    evidence_id: str
    source_id: str
    as_of: str
    publication_date: str
    value_type: str = "derived"   # observed|derived|ordinal|missing
    quality: str = "B"            # A|B|C|D
    summary: str = ""

    def available_at(self, cutoff: str) -> bool:
        """信息截止是数据属性过滤，不是 prompt 口头要求。"""
        return self.publication_date <= cutoff


@dataclass
class CompanyState:
    company_id: str
    anon_label: str
    industry: str
    metrics: Dict[str, float]
    cash_points: float
    debt_points: float
    committed_from_gov: float = 0.0
    invested: bool = False
    active: bool = True
    status: str = "建设"
    milestones_done: List[str] = field(default_factory=list)
    rounds_unfunded: int = 0
    capital_request: float = 0.0
    follow_on_thresholds: List[float] = field(default_factory=list)
    event_sensitivities: Dict[str, float] = field(default_factory=dict)
    milestone_plan: List[str] = field(default_factory=list)
    evidence: List[Evidence] = field(default_factory=list)
    risk_mechanisms_fired: List[str] = field(default_factory=list)

    # ---- 派生（引擎调用）----
    def refresh_status(self) -> None:
        if not self.active:
            self.status = "退出"
        elif self.cash_points < 15 or self.metrics["project_cashflow"] < -40:
            self.status = "承压"
        elif self.rounds_unfunded >= 2 and self.metrics["construction_progress"] < 20:
            self.status = "停滞"
        elif self.metrics["production_ramp"] >= 50:
            self.status = "量产"
        else:
            self.status = "建设"

    def check_milestones(self) -> List[str]:
        newly = []
        for name in self.milestone_plan:
            if name in self.milestones_done:
                continue
            metric, threshold = MILESTONE_THRESHOLDS[name]
            if self.metrics[metric] >= threshold:
                self.milestones_done.append(name)
                newly.append(name)
        return newly

    def clamp_metrics(self) -> None:
        for k in self.metrics:
            lo, hi = (-100.0, 100.0) if k == "project_cashflow" else (0.0, 100.0)
            self.metrics[k] = _clamp(self.metrics[k], lo, hi)


@dataclass
class MarketConditions:
    cycle: float = 0.0            # -100..100
    price_trend: float = 0.0      # -100..100
    supply_pressure: float = 40.0
    policy_support: float = 40.0

    def clamp(self) -> None:
        self.cycle = _clamp(self.cycle, -100, 100)
        self.price_trend = _clamp(self.price_trend, -100, 100)
        self.supply_pressure = _clamp(self.supply_pressure, 0, 100)
        self.policy_support = _clamp(self.policy_support, 0, 100)


@dataclass
class CityState:
    budget_points: float = 100.0
    committed_capital: float = 0.0
    industrial_base: Dict[str, float] = field(default_factory=dict)
    talent_supply: float = 45.0
    infrastructure_capacity: float = 50.0

    def clamp(self) -> None:
        self.talent_supply = _clamp(self.talent_supply, 0, 100)
        self.infrastructure_capacity = _clamp(self.infrastructure_capacity, 0, 100)
        for k in self.industrial_base:
            self.industrial_base[k] = _clamp(self.industrial_base[k], 0, 100)


@dataclass
class WorldState:
    run_id: str
    seed: int
    stage_id: str
    cutoff_at: str
    round_index: int
    city: CityState
    market: Dict[str, MarketConditions]
    companies: Dict[str, CompanyState]
    history: List[dict] = field(default_factory=list)
    fact_graph: FactGraph = field(default_factory=FactGraph)

    def clone(self) -> "WorldState":
        return copy.deepcopy(self)

    def snapshot(self) -> dict:
        d = asdict(self)
        return d
