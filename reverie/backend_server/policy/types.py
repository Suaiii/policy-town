"""星河市政策引擎数据模型。"""
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict

SEGMENTS = ("A型", "B型", "C型", "D型")


@dataclass
class PersonaProfile:
    name: str
    segment: str
    employer: str
    salary: float
    savings_months: float
    risk_aversion: float
    family_tie: str
    job_searching: bool = False
    offer: Optional[Dict] = None

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, d):
        return cls(**d)


@dataclass
class FirmLedger:
    firm: str
    stage: str
    headcount: Dict[str, int] = field(default_factory=dict)
    salary_level: Dict[str, float] = field(default_factory=dict)
    profit: float = 0.0
    labor_cost: float = 0.0
    skills_needed: Dict[str, int] = field(default_factory=dict)
    layoff_risk: float = 0.0
    recruiting: int = 0
    expected_future_firing_cost: float = 0.0

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, d):
        return cls(**d)


@dataclass
class PolicyState:
    active_policies: Dict = field(default_factory=dict)
    history: Dict = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, d):
        return cls(**d)


@dataclass
class CityMetrics:
    month: int
    net_inflow: int
    employment_rate: float
    segment_unemployment: Dict[str, float] = field(default_factory=dict)
    firm_gap: Dict[str, int] = field(default_factory=dict)
    avg_salary: float = 0.0
    housing_index: float = 100.0
    fiscal_spending: float = 0.0

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, d):
        return cls(**d)
