"""Durable, run-isolated memory for the investment simulation.

The historical evidence database is intentionally read-only.  This module is
the separate write store for simulated cognition: it keeps the public graph,
enterprise-private snapshots, intent events, and enough state to resume a run
after a process restart.  Every query is scoped by ``run_id`` and cutoff.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable

from contracts.investment_simulation_v0_1 import (
    EnterpriseAgentIntent,
    EnterpriseMemoryState,
    RealityGraph,
    RealityGraphRecord,
    SimulationState,
    StageId,
)


STAGE_ORDER = {stage: index for index, stage in enumerate((StageId.S1, StageId.S2, StageId.S3, StageId.S4))}


class MemoryStore:
    """SQLite-backed simulation memory; never writes to the historical DB."""

    def __init__(self, path: str | Path | None = None) -> None:
        root = Path(__file__).resolve().parents[2]
        self.path = Path(path or root / "data" / "hefei_mvp_runs" / "agent_memory.sqlite3").resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS reality_graph_records (
                  record_id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  stage_id TEXT NOT NULL,
                  entity_id TEXT NOT NULL,
                  visibility TEXT NOT NULL,
                  available_at TEXT NOT NULL,
                  record_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_graph_run_stage
                  ON reality_graph_records(run_id, stage_id, visibility, available_at);

                CREATE TABLE IF NOT EXISTS enterprise_memory_snapshots (
                  run_id TEXT NOT NULL,
                  company_id TEXT NOT NULL,
                  stage_id TEXT NOT NULL,
                  memory_json TEXT NOT NULL,
                  PRIMARY KEY(run_id, company_id, stage_id)
                );
                CREATE INDEX IF NOT EXISTS idx_memory_run_company
                  ON enterprise_memory_snapshots(run_id, company_id, stage_id);

                CREATE TABLE IF NOT EXISTS enterprise_intent_events (
                  event_id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  company_id TEXT NOT NULL,
                  stage_id TEXT NOT NULL,
                  intent_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_intent_run_company
                  ON enterprise_intent_events(run_id, company_id, stage_id);

                CREATE TABLE IF NOT EXISTS run_state_snapshots (
                  run_id TEXT NOT NULL,
                  stage_id TEXT NOT NULL,
                  state_json TEXT NOT NULL,
                  PRIMARY KEY(run_id, stage_id)
                );
                """
            )

    @staticmethod
    def _json(value) -> str:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    def initialize_run(self, state: SimulationState) -> None:
        """Start a run cleanly; retrying the same run id must not leak old memory."""
        with self._connect() as conn:
            conn.execute("DELETE FROM reality_graph_records WHERE run_id = ?", (state.run_id,))
            conn.execute("DELETE FROM enterprise_memory_snapshots WHERE run_id = ?", (state.run_id,))
            conn.execute("DELETE FROM enterprise_intent_events WHERE run_id = ?", (state.run_id,))
            conn.execute("DELETE FROM run_state_snapshots WHERE run_id = ?", (state.run_id,))
        self.append_graph_records(state.reality_graph.records)
        self.save_memories(state.enterprise_memories)
        self.save_state(state, stage_id=None)

    def append_graph_records(self, records: Iterable[RealityGraphRecord]) -> None:
        rows = list(records)
        if not rows:
            return
        with self._connect() as conn:
            conn.executemany(
                """INSERT OR REPLACE INTO reality_graph_records
                   (record_id, run_id, stage_id, entity_id, visibility, available_at, record_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [(
                    item.record_id, item.run_id, item.stage_id.value, item.entity_id,
                    item.visibility, item.available_at, self._json(item.model_dump(mode="json")),
                ) for item in rows],
            )

    def save_memories(self, memories: Iterable[EnterpriseMemoryState]) -> None:
        rows = list(memories)
        if not rows:
            return
        with self._connect() as conn:
            for memory in rows:
                conn.execute(
                    """INSERT OR REPLACE INTO enterprise_memory_snapshots
                       (run_id, company_id, stage_id, memory_json) VALUES (?, ?, ?, ?)""",
                    (memory.run_id, memory.company_id, memory.current_stage.value,
                     self._json(memory.model_dump(mode="json"))),
                )
                intent = memory.intent_history[-1] if memory.intent_history else None
                if intent is not None:
                    event_id = f"{memory.run_id}:{memory.company_id}:{memory.current_stage.value}:intent"
                    conn.execute(
                        """INSERT OR REPLACE INTO enterprise_intent_events
                           (event_id, run_id, company_id, stage_id, intent_json)
                           VALUES (?, ?, ?, ?, ?)""",
                        (event_id, memory.run_id, memory.company_id, memory.current_stage.value,
                         self._json(intent.model_dump(mode="json"))),
                    )

    def save_state(self, state: SimulationState, stage_id: StageId | None = None) -> None:
        key = stage_id.value if stage_id is not None else "INITIAL"
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO run_state_snapshots(run_id, stage_id, state_json) VALUES (?, ?, ?)",
                (state.run_id, key, self._json(state.model_dump(mode="json"))),
            )

    def load_memories(self, run_id: str, company_ids: Iterable[str] | None = None) -> list[EnterpriseMemoryState]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT memory_json FROM enterprise_memory_snapshots WHERE run_id = ?",
                (run_id,),
            ).fetchall()
        wanted = set(company_ids or ())
        latest: dict[str, EnterpriseMemoryState] = {}
        for row in rows:
            memory = EnterpriseMemoryState.model_validate(json.loads(row["memory_json"]))
            if wanted and memory.company_id not in wanted:
                continue
            old = latest.get(memory.company_id)
            if old is None or STAGE_ORDER[memory.current_stage] > STAGE_ORDER[old.current_stage]:
                latest[memory.company_id] = memory
        return list(latest.values())

    def load_graph(
        self, run_id: str, *, visibility: set[str] | None = None, cutoff_at: str | None = None,
    ) -> RealityGraph | None:
        clauses = ["run_id = ?"]
        params: list[str] = [run_id]
        if cutoff_at is not None:
            clauses.append("available_at <= ?")
            params.append(cutoff_at)
        if visibility:
            marks = ",".join("?" for _ in visibility)
            clauses.append(f"visibility IN ({marks})")
            params.extend(sorted(visibility))
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT record_json FROM reality_graph_records WHERE " + " AND ".join(clauses)
                + " ORDER BY stage_id, record_id", params,
            ).fetchall()
        if not rows:
            return None
        records = [RealityGraphRecord.model_validate(json.loads(row["record_json"])) for row in rows]
        latest = max(records, key=lambda item: STAGE_ORDER[item.stage_id]).stage_id
        return RealityGraph(graph_id=f"{run_id}:reality", run_id=run_id, records=records, latest_stage=latest)

    def load_state(self, run_id: str, stage_id: StageId | None = None) -> SimulationState | None:
        key = stage_id.value if stage_id is not None else "INITIAL"
        with self._connect() as conn:
            row = conn.execute(
                "SELECT state_json FROM run_state_snapshots WHERE run_id = ? AND stage_id = ?",
                (run_id, key),
            ).fetchone()
        return SimulationState.model_validate(json.loads(row["state_json"])) if row else None

    def load_latest_state(self, run_id: str) -> SimulationState | None:
        with self._connect() as conn:
            row = conn.execute(
                """SELECT state_json FROM run_state_snapshots
                   WHERE run_id = ? AND stage_id <> 'INITIAL'
                   ORDER BY CASE stage_id WHEN 'S4' THEN 4 WHEN 'S3' THEN 3
                            WHEN 'S2' THEN 2 WHEN 'S1' THEN 1 ELSE 0 END DESC
                   LIMIT 1""",
                (run_id,),
            ).fetchone()
        if row is None:
            return self.load_state(run_id)
        return SimulationState.model_validate(json.loads(row["state_json"]))

    def run_counts(self, run_id: str) -> dict[str, int]:
        with self._connect() as conn:
            return {
                "graph_records": conn.execute("SELECT COUNT(*) FROM reality_graph_records WHERE run_id = ?", (run_id,)).fetchone()[0],
                "memory_snapshots": conn.execute("SELECT COUNT(*) FROM enterprise_memory_snapshots WHERE run_id = ?", (run_id,)).fetchone()[0],
                "intent_events": conn.execute("SELECT COUNT(*) FROM enterprise_intent_events WHERE run_id = ?", (run_id,)).fetchone()[0],
            }
