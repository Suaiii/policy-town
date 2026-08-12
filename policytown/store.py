from __future__ import annotations

import json
from pathlib import Path

from contracts.schema import Snapshot

from .models import ScenarioDefinition


class FileSnapshotStore:
    name = "filesystem-v1"

    def __init__(self, project_root: str | Path = ".") -> None:
        self.project_root = Path(project_root).resolve()

    def _source_path(self, scenario: ScenarioDefinition, round_no: int) -> Path:
        return self.project_root / scenario.data_dir / f"round_{round_no}.json"

    def load_round(self, scenario: ScenarioDefinition, round_no: int) -> Snapshot:
        path = self._source_path(scenario, round_no)
        return Snapshot.model_validate_json(path.read_text(encoding="utf-8"))

    def save_round(self, scenario: ScenarioDefinition, snapshot: Snapshot, output_dir: str | None = None) -> str:
        directory = self.project_root / (output_dir or scenario.data_dir)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"round_{snapshot.round}.json"
        path.write_text(json.dumps(snapshot.model_dump(by_alias=True), ensure_ascii=False, indent=2), encoding="utf-8")
        return str(path)
