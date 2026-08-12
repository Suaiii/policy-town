from __future__ import annotations

from typing import Any, Protocol, Sequence

from contracts.schema import FirmAction, Flow, Metrics, Policy, Snapshot, WorkerAction

from .models import DepartmentProposal, PolicyExtraction, ScenarioDefinition, StageRecord


class PolicyParser(Protocol):
    name: str
    def parse(self, draft: str) -> PolicyExtraction: ...


class EnvironmentEngine(Protocol):
    name: str
    def update(self, *, round_no: int, previous: Snapshot | None, seed: int) -> dict[str, Any]: ...


class GovernmentAgents(Protocol):
    name: str
    def propose(self, *, round_no: int, observations: dict[str, Any]) -> Sequence[DepartmentProposal]: ...
    def negotiate(self, *, round_no: int, proposals: Sequence[DepartmentProposal], observations: dict[str, Any]) -> Policy: ...


class FirmAgents(Protocol):
    name: str
    def decide(self, *, round_no: int, policy: Policy, observations: dict[str, Any]) -> Sequence[FirmAction]: ...


class WorkerAgents(Protocol):
    name: str
    def decide(self, *, round_no: int, firms: Sequence[FirmAction], policy: Policy, observations: dict[str, Any]) -> Sequence[WorkerAction]: ...


class SocialEngine(Protocol):
    name: str
    def diffuse(self, *, round_no: int, workers: Sequence[WorkerAction], observations: dict[str, Any]) -> dict[str, Any]: ...


class MarketEngine(Protocol):
    name: str
    def settle(self, *, round_no: int, firms: Sequence[FirmAction], workers: Sequence[WorkerAction], observations: dict[str, Any]) -> Sequence[Flow]: ...


class MetricsEngine(Protocol):
    name: str
    def settle(self, *, round_no: int, firms: Sequence[FirmAction], flows: Sequence[Flow], observations: dict[str, Any]) -> Metrics: ...


class CohortReconciler(Protocol):
    name: str
    def reconcile(self, *, workers: Sequence[WorkerAction], flows: Sequence[Flow]) -> Sequence[WorkerAction]: ...


class SnapshotStore(Protocol):
    name: str
    def load_round(self, scenario: ScenarioDefinition, round_no: int) -> Snapshot: ...
    def save_round(self, scenario: ScenarioDefinition, snapshot: Snapshot, output_dir: str | None = None) -> str: ...


class RunObserver(Protocol):
    def on_stage(self, record: StageRecord) -> None: ...
