"""真实政府决策基线的读取、门禁与 Replay 对账。"""

from __future__ import annotations

import sqlite3
from datetime import date
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, model_validator

from contracts.investment_simulation_v0_1 import (
    BaselineFieldComparison,
    DecisionBaselineReconciliation,
    SimulationState,
    StageId,
)


class BaselineQuantity(BaseModel):
    value: float = Field(gt=0)
    unit: Literal["亿元", "%", "亿元/年"]


class BaselineGovernmentAction(BaseModel):
    action: Literal["invest", "follow_on", "support", "restructure", "exit"]
    agreement_type: str
    components: list[str] = Field(min_length=1)
    project_total_investment: BaselineQuantity
    project_capital: BaselineQuantity
    government_registered_capital_commitment: BaselineQuantity
    initial_registered_capital: BaselineQuantity
    initial_government_cash_commitment: BaselineQuantity
    initial_government_equity_share: BaselineQuantity
    annual_interest_subsidy: BaselineQuantity
    interest_subsidy_years: int = Field(gt=0)
    source_ids: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_units(self) -> "BaselineGovernmentAction":
        money_fields = (
            self.project_total_investment,
            self.project_capital,
            self.government_registered_capital_commitment,
            self.initial_registered_capital,
            self.initial_government_cash_commitment,
        )
        if any(item.unit != "亿元" for item in money_fields):
            raise ValueError("现实资金字段必须保留为亿元，不得换算为财政点数")
        if self.initial_government_equity_share.unit != "%":
            raise ValueError("持股比例单位必须为 %")
        if self.annual_interest_subsidy.unit != "亿元/年":
            raise ValueError("年度贴息单位必须为亿元/年")
        return self


class BaselineCondition(BaseModel):
    condition_id: str
    category: Literal[
        "company_setup",
        "capital",
        "financing",
        "guarantee",
        "subsidy",
        "industrial_support",
        "construction",
        "production",
    ]
    description: str
    source_ids: list[str] = Field(min_length=1)


class BaselineMilestone(BaseModel):
    date: date
    milestone_type: Literal[
        "company_setup",
        "construction_start",
        "capital_structure_update",
    ]
    description: str
    information_available_date: date
    source_ids: list[str] = Field(min_length=1)
    metrics: dict[str, BaselineQuantity] = Field(default_factory=dict)

    @model_validator(mode="after")
    def publication_follows_event(self) -> "BaselineMilestone":
        if self.information_available_date < self.date:
            raise ValueError("里程碑信息可用日不得早于事件发生日")
        return self


class BaselineSource(BaseModel):
    source_id: str
    supports: list[str] = Field(min_length=1)


class DecisionBaseline(BaseModel):
    baseline_id: str
    case_id: str
    stage_id: StageId
    decision_date: date
    information_cutoff: date
    decision_publication_date: date
    availability_note: str
    government_action: BaselineGovernmentAction
    conditions: list[BaselineCondition] = Field(min_length=1)
    milestones: list[BaselineMilestone] = Field(min_length=1)
    sources: list[BaselineSource] = Field(min_length=1)

    @model_validator(mode="after")
    def five_element_gate(self) -> "DecisionBaseline":
        if self.information_cutoff > self.decision_date:
            raise ValueError("信息截止日不得晚于真实决策日")
        if self.decision_publication_date < self.decision_date:
            raise ValueError("决策公开日不得早于真实决策日")
        if any(item.date < self.decision_date for item in self.milestones):
            raise ValueError("后续里程碑不得早于真实决策日")

        declared = {item.source_id for item in self.sources}
        referenced = set(self.government_action.source_ids)
        referenced.update(
            source_id for condition in self.conditions for source_id in condition.source_ids
        )
        referenced.update(
            source_id for milestone in self.milestones for source_id in milestone.source_ids
        )
        if missing := referenced - declared:
            raise ValueError(f"基线引用了未登记来源: {sorted(missing)}")
        if unused := declared - referenced:
            raise ValueError(f"基线登记了未使用来源: {sorted(unused)}")
        return self

    @property
    def completeness(self) -> float:
        """五要素门禁通过后，动作、时点、金额持股、条件、来源均为完整。"""
        checks = (
            bool(self.government_action.action),
            bool(self.decision_date),
            bool(self.government_action.government_registered_capital_commitment),
            bool(self.conditions),
            bool(self.sources),
        )
        return sum(checks) / len(checks)


def load_decision_baseline(path: str | Path) -> DecisionBaseline:
    payload = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"decision baseline must be a mapping: {path}")
    return DecisionBaseline.model_validate(payload)


class ReplayBaselineRepository:
    """从案例包读取基线，并核验其来源追溯链。"""

    def __init__(
        self,
        root: str | Path | None = None,
        db_path: str | Path | None = None,
    ) -> None:
        project_root = Path(__file__).resolve().parents[2]
        self.project_root = project_root
        self.root = Path(root or project_root / "data" / "historical_cases").resolve()
        self.db_path = Path(
            db_path or project_root / "data" / "hefei_industry_simulation.sqlite3"
        ).resolve()
        self._by_case: dict[str, DecisionBaseline] | None = None

    def all(self) -> list[DecisionBaseline]:
        if self._by_case is None:
            baselines = [
                load_decision_baseline(path)
                for path in sorted(self.root.glob("*/decision_baseline.yaml"))
            ]
            by_case: dict[str, DecisionBaseline] = {}
            for baseline in baselines:
                if baseline.case_id in by_case:
                    raise ValueError(f"同一案例存在多条默认决策基线: {baseline.case_id}")
                self._validate_sources(baseline)
                by_case[baseline.case_id] = baseline
            self._by_case = by_case
        return list(self._by_case.values())

    def for_case(self, case_id: str) -> DecisionBaseline | None:
        self.all()
        assert self._by_case is not None
        return self._by_case.get(case_id)

    def _validate_sources(self, baseline: DecisionBaseline) -> None:
        if not self.db_path.exists():
            raise FileNotFoundError(f"real-data database not found: {self.db_path}")
        source_ids = [item.source_id for item in baseline.sources]
        marks = ",".join("?" for _ in source_ids)
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                f"""SELECT source_id, url, publication_date, archived_path, sha256
                    FROM source WHERE source_id IN ({marks})""",
                source_ids,
            ).fetchall()
        by_id = {row["source_id"]: row for row in rows}
        if missing := set(source_ids) - set(by_id):
            raise ValueError(f"基线来源不在数据库中: {sorted(missing)}")
        for source_id in source_ids:
            row = by_id[source_id]
            if not row["url"] or not row["archived_path"] or not row["sha256"]:
                raise ValueError(f"基线来源追溯链不完整: {source_id}")
            archive = Path(row["archived_path"])
            if not archive.is_absolute():
                archive = self.project_root / archive
            if not archive.exists():
                raise ValueError(f"基线来源本地归档不存在: {source_id} -> {archive}")

        decision_source_dates = [
            date.fromisoformat(by_id[source_id]["publication_date"])
            for source_id in baseline.government_action.source_ids
            if by_id[source_id]["publication_date"]
        ]
        if (
            not decision_source_dates
            or min(decision_source_dates) != baseline.decision_publication_date
        ):
            raise ValueError("真实决策公开日与动作来源发布日期不一致")


def reconcile_decision_baseline(
    baseline: DecisionBaseline,
    state: SimulationState,
    company_ids: list[str],
) -> DecisionBaselineReconciliation:
    """仅比较同单位、同语义输出；未产出的现实字段明确不评分。"""

    stage_audit = next(
        (item for item in state.stage_audits if item.stage_id == baseline.stage_id),
        None,
    )
    simulated_actions = (
        [stage_audit.player_actions[item] for item in company_ids if item in stage_audit.player_actions]
        if stage_audit
        else []
    )
    simulated_action = simulated_actions[0] if len(set(simulated_actions)) == 1 else None
    action_match = simulated_action == baseline.government_action.action
    timing_match = bool(
        stage_audit and date.fromisoformat(stage_audit.cutoff_at) == baseline.decision_date
    )

    comparisons = [
        BaselineFieldComparison(
            field="government_action.action",
            status="match" if action_match else "mismatch",
            baseline_value=baseline.government_action.action,
            simulated_value=simulated_action or "no_action",
            reason="玩家对历史案例映射企业的结构化动作与真实政府动作直接比较。",
        ),
        BaselineFieldComparison(
            field="decision_date",
            status="match" if timing_match else "mismatch",
            baseline_value=baseline.decision_date.isoformat(),
            simulated_value=stage_audit.cutoff_at if stage_audit else None,
            reason="S1 决策阶段的冻结时点与真实决策日直接比较。",
        ),
        BaselineFieldComparison(
            field="milestones",
            status="not_evaluable",
            baseline_value=[item.milestone_type for item in baseline.milestones],
            simulated_value=None,
            reason="当前引擎仅有阶段进度，没有同口径的工商注册、开工和股权变更日期。",
        ),
        BaselineFieldComparison(
            field="government_action.capital_and_equity",
            status="not_evaluable",
            baseline_value=(
                f"{baseline.government_action.government_registered_capital_commitment.value:g}亿元; "
                f"初始持股{baseline.government_action.initial_government_equity_share.value:g}%"
            ),
            simulated_value=None,
            reason="游戏财政点数与现实亿元、持股比例不是同一单位，不直接换算或评分。",
        ),
        BaselineFieldComparison(
            field="conditions",
            status="not_evaluable",
            baseline_value=[item.condition_id for item in baseline.conditions],
            simulated_value=None,
            reason="当前玩家动作尚未输出与协议条件一一对应的结构化条款集合。",
        ),
    ]
    return DecisionBaselineReconciliation(
        baseline_id=baseline.baseline_id,
        case_id=baseline.case_id,
        stage_id=baseline.stage_id,
        baseline_completeness=baseline.completeness,
        action_match=action_match,
        timing_match=timing_match,
        milestone_sequence_status="not_evaluable",
        capital_match_status="not_evaluable",
        condition_match_status="not_evaluable",
        comparisons=comparisons,
        limitations=[
            "这条结果是给定真实动作后的 Replay 对账，不是隐藏动作后的盲推演。",
            "仅动作与阶段时点可直接比较；金额、持股、条件和精确里程碑尚无同单位输出。",
        ],
    )
