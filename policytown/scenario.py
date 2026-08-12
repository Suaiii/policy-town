from __future__ import annotations

from pathlib import Path

from .models import ScenarioDefinition, ScenarioManifest


class ScenarioCatalog:
    def __init__(self, manifest_path: str | Path = "scenarios/manifest.json") -> None:
        self.manifest_path = Path(manifest_path)
        self.root = self.manifest_path.resolve().parent.parent
        self.manifest = ScenarioManifest.model_validate_json(self.manifest_path.read_text(encoding="utf-8"))
        self._scenarios = {scenario.id: scenario for scenario in self.manifest.scenarios}
        if self.manifest.reference_scenario not in self._scenarios:
            raise ValueError("reference_scenario must exist in scenarios")

    def get(self, scenario_id: str, *, require_ready: bool = True) -> ScenarioDefinition:
        try:
            scenario = self._scenarios[scenario_id]
        except KeyError as exc:
            raise KeyError(f"unknown scenario: {scenario_id}") from exc
        if require_ready and scenario.status != "ready":
            raise ValueError(f"scenario {scenario_id} is not ready")
        return scenario

    def reference(self) -> ScenarioDefinition:
        return self.get(self.manifest.reference_scenario)

    def data_path(self, scenario: ScenarioDefinition, round_no: int) -> Path:
        return self.root / scenario.data_dir / f"round_{round_no}.json"

    def validate_files(self) -> list[str]:
        errors: list[str] = []
        for scenario in self.manifest.scenarios:
            if scenario.status != "ready":
                continue
            for round_no in range(1, self.manifest.rounds + 1):
                path = self.data_path(scenario, round_no)
                if not path.is_file():
                    errors.append(f"{scenario.id}: missing {path}")
        return errors
