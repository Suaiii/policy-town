from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from contracts.investment_simulation_v0_1 import (
    CityMetrics,
    CompanyState,
    EvidenceRef,
    FiscalBudgetAssumption,
    HistoricalEvent,
    StageId,
)


class HefeiMvpLoader:
    """读取冻结的 MVP 数据包，并隔离后台历史结果字段。"""

    def __init__(self, data_dir: str | Path | None = None) -> None:
        self.data_dir = Path(data_dir or Path(__file__).resolve().parents[2] / "data" / "hefei_mvp")
        self._stages = self._read("stages.json")
        self._company_rows = self._read("companies.json")
        self._enterprise_settings = self._read("enterprise_agent_settings.json")
        self._evidence = [EvidenceRef.model_validate(item) for item in self._read("evidence.json")]

    def _read(self, filename: str) -> Any:
        return json.loads((self.data_dir / filename).read_text(encoding="utf-8"))

    def company_ids(self) -> list[str]:
        return [item["company_id"] for item in self._company_rows]

    def load_companies(self, company_ids: list[str]) -> list[CompanyState]:
        if not 2 <= len(company_ids) <= 3:
            raise ValueError("a run must contain two or three companies")
        if len(company_ids) != len(set(company_ids)):
            raise ValueError("company selection contains duplicates")
        rows = {item["company_id"]: item for item in self._company_rows}
        unknown = sorted(set(company_ids) - rows.keys())
        if unknown:
            raise KeyError(f"unknown company ids: {unknown}")
        visible_fields = set(CompanyState.model_fields)
        return [
            CompanyState.model_validate({key: deepcopy(value) for key, value in rows[company_id].items() if key in visible_fields})
            for company_id in company_ids
        ]

    def raw_company_config(self, company_id: str) -> dict[str, Any]:
        for row in self._company_rows:
            if row["company_id"] == company_id:
                return deepcopy(row)
        raise KeyError(company_id)

    def enterprise_private_state(self, company_id: str, stage_id: StageId):
        from contracts.investment_simulation_v0_1 import EnterprisePrivateState

        rows = self._enterprise_settings.get("companies", {})
        if company_id not in rows:
            raise KeyError(f"enterprise private state not configured: {company_id}")
        row = deepcopy(rows[company_id])
        row["stage_context"] = {
            stage: text
            for stage, text in row.get("stage_context", {}).items()
            if StageId(stage).value <= stage_id.value
        }
        return EnterprisePrivateState.model_validate(row)

    def budget_assumption(self, stage_id: StageId) -> FiscalBudgetAssumption:
        return FiscalBudgetAssumption.model_validate(
            self._stages[stage_id.value]["budget_assumption"]
        )

    def cutoff_at(self, stage_id: StageId) -> str:
        return str(self._stages[stage_id.value]["cutoff_at"])

    def initial_city_metrics(self) -> CityMetrics:
        return CityMetrics.model_validate(self._stages[StageId.S1.value]["city_metrics"])

    def event(self, stage_id: StageId) -> HistoricalEvent:
        return HistoricalEvent.model_validate(self._stages[stage_id.value]["event"])

    def evidence_for(self, evidence_ids: set[str], cutoff_at: str) -> list[EvidenceRef]:
        return [
            item
            for item in self._evidence
            if item.evidence_id in evidence_ids and item.available_at_cutoff and item.as_of <= cutoff_at
        ]
