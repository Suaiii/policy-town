from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from contracts.schema import Snapshot
from .models import RunRequest, RunResult, Stage, StageRecord
from .ports import (CohortReconciler, EnvironmentEngine, FirmAgents, GovernmentAgents,
                    MarketEngine, MetricsEngine, RunObserver, SnapshotStore,
                    SocialEngine, WorkerAgents)
from .scenario import ScenarioCatalog
from .store import FileSnapshotStore


@dataclass(frozen=True)
class ProviderBundle:
    environment: EnvironmentEngine
    government: GovernmentAgents
    firms: FirmAgents
    workers: WorkerAgents
    social: SocialEngine
    market: MarketEngine
    metrics: MetricsEngine
    cohorts: CohortReconciler


class SimulationOrchestrator:
    """Stable entry point shared by frontend, Agent and rule-engine teammates.

    Replay mode is the integration baseline. Live providers can later implement
    the protocols in ``ports.py`` without changing snapshots or consumers.
    """

    def __init__(self, catalog: ScenarioCatalog | None = None, store: SnapshotStore | None = None, observers: Iterable[RunObserver] = (), providers: ProviderBundle | None = None) -> None:
        self.catalog = catalog or ScenarioCatalog()
        self.store = store or FileSnapshotStore(self.catalog.root)
        self.observers = list(observers)
        self.providers = providers

    def _emit(self, record: StageRecord, records: list[StageRecord]) -> None:
        records.append(record)
        for observer in self.observers:
            observer.on_stage(record)

    def run(self, request: RunRequest) -> RunResult:
        scenario = self.catalog.get(request.scenario_id)
        rounds = min(request.rounds or self.catalog.manifest.rounds, self.catalog.manifest.rounds)
        if request.mode == "live":
            return self._run_live(request, scenario, rounds)
        records: list[StageRecord] = []
        paths: list[str] = []
        for round_no in range(1, rounds + 1):
            snapshot = self.store.load_round(scenario, round_no)
            self._emit(StageRecord(round=round_no, stage=Stage.SNAPSHOT, provider=self.store.name, payload={"contract_version": snapshot.contract_version}), records)
            if request.output_dir:
                paths.append(self.store.save_round(scenario, snapshot, request.output_dir))
            else:
                paths.append(str(self.catalog.data_path(scenario, round_no)))
        return RunResult(run_id=uuid.uuid4().hex, scenario_id=scenario.id, mode=request.mode, seed=request.seed, snapshot_paths=paths, records=records)

    def _run_live(self, request: RunRequest, scenario, rounds: int) -> RunResult:
        if self.providers is None:
            raise ValueError("live mode requires ProviderBundle")
        p, records, paths, previous = self.providers, [], [], None
        for round_no in range(1, rounds + 1):
            observations = p.environment.update(round_no=round_no, previous=previous, seed=request.seed)
            self._emit(StageRecord(round=round_no, stage=Stage.ENVIRONMENT, provider=p.environment.name, payload=observations), records)
            proposals = list(p.government.propose(round_no=round_no, observations=observations))
            self._emit(StageRecord(round=round_no, stage=Stage.DEPARTMENT_PROPOSALS, provider=p.government.name, payload={"departments": [x.department for x in proposals]}), records)
            policy = p.government.negotiate(round_no=round_no, proposals=proposals, observations=observations)
            self._emit(StageRecord(round=round_no, stage=Stage.CABINET_MEETING, provider=p.government.name, payload={"active": policy.active, "compromises": len(policy.compromise_log)}), records)
            firms = list(p.firms.decide(round_no=round_no, policy=policy, observations=observations))
            for firm in firms: firm.check()
            self._emit(StageRecord(round=round_no, stage=Stage.FIRM_DECISIONS, provider=p.firms.name, payload={"firms": [x.firm_id for x in firms]}), records)
            workers = list(p.workers.decide(round_no=round_no, firms=firms, policy=policy, observations=observations))
            self._emit(StageRecord(round=round_no, stage=Stage.WORKER_DECISIONS, provider=p.workers.name, payload={"workers": len(workers)}), records)
            social = p.social.diffuse(round_no=round_no, workers=workers, observations=observations)
            self._emit(StageRecord(round=round_no, stage=Stage.SOCIAL_DIFFUSION, provider=p.social.name, payload=social), records)
            context = {**observations, "social": social, "previous": previous.model_dump(by_alias=True) if previous else None}
            flows = list(p.market.settle(round_no=round_no, firms=firms, workers=workers, observations=context))
            workers = list(p.cohorts.reconcile(workers=workers, flows=flows))
            self._emit(StageRecord(round=round_no, stage=Stage.MARKET_SETTLEMENT, provider=p.market.name, payload={"flows": len(flows), "people": sum(x.count for x in flows)}), records)
            metrics = p.metrics.settle(round_no=round_no, firms=firms, flows=flows, observations=context)
            self._emit(StageRecord(round=round_no, stage=Stage.METRICS_SETTLEMENT, provider=p.metrics.name, payload=metrics.model_dump()), records)
            previous = Snapshot(run_id=scenario.id, round=round_no, policy=policy, firms=firms, workers=workers, flows=flows, metrics=metrics, sentiment_heat=social.get("sentiment_heat", 0.0), group_mood=social.get("group_mood", 0.5), top_post=social.get("top_post", ""))
            paths.append(self.store.save_round(scenario, previous, request.output_dir or f"data/run_{scenario.id}_live"))
            self._emit(StageRecord(round=round_no, stage=Stage.SNAPSHOT, provider=self.store.name, payload={"path": paths[-1], "contract_version": previous.contract_version}), records)
        return RunResult(run_id=uuid.uuid4().hex, scenario_id=scenario.id, mode=request.mode, seed=request.seed, snapshot_paths=paths, records=records)
