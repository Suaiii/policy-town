from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from contracts.investment_simulation_v0_1 import EvidenceRef, RawObservation, RealDataContext


class HefeiRealDataRepository:
    """Read-only gateway from the simulation backend to the traceable SQLite store."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        root = Path(__file__).resolve().parents[2]
        self.db_path = Path(db_path or root / "data" / "hefei_industry_simulation.sqlite3").resolve()
        if not self.db_path.exists():
            raise FileNotFoundError(f"real-data database not found: {self.db_path}")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(f"file:{self.db_path.as_posix()}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def context_at(self, cutoff_at: str) -> RealDataContext:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT o.*, i.domain, s.title AS source_title, s.url AS source_url,
                          s.archived_path AS source_archived_path, s.sha256 AS source_sha256,
                          s.retrieved_at AS source_retrieved_at
                   FROM observation o JOIN indicator_definition i USING(indicator_id)
                   LEFT JOIN source s USING(source_id)
                   WHERE o.information_available_date IS NOT NULL
                     AND o.information_available_date <= ?
                     AND o.verification_status <> 'needs_verification'
                   ORDER BY o.information_available_date, o.observation_id""",
                (cutoff_at,),
            ).fetchall()
            observations = [self._observation(row) for row in rows]
            policies = [dict(row) for row in conn.execute(
                "SELECT * FROM policy_library WHERE information_available_date <= ? ORDER BY information_available_date, policy_id",
                (cutoff_at,),
            )]
            events = [dict(row) for row in conn.execute(
                "SELECT * FROM historical_event WHERE information_available_date <= ? ORDER BY information_available_date, event_id",
                (cutoff_at,),
            )]
            domains = {row[0] for row in conn.execute(
                """SELECT DISTINCT i.domain FROM observation o
                   JOIN indicator_definition i USING(indicator_id)
                   WHERE o.information_available_date <= ?
                     AND o.verification_status <> 'needs_verification'""",
                (cutoff_at,),
            )}
        required = {"world", "government", "industry", "company", "project", "talent"}
        return RealDataContext(
            cutoff_at=cutoff_at,
            observations=observations,
            policies=[self._decode_json_fields(row) for row in policies],
            events=[self._decode_json_fields(row) for row in events],
            missing_domains=sorted(required - domains),
            database_path=str(self.db_path),
        )

    def evidence_at(self, cutoff_at: str) -> list[EvidenceRef]:
        context = self.context_at(cutoff_at)
        evidence = [
            EvidenceRef(
                evidence_id=f"observation:{item.observation_id}",
                title=f"{item.entity_id}.{item.indicator_id} = {item.value}{item.unit or ''}",
                as_of=item.information_available_date,
                value_type="observed" if item.verification_status == "verified" else "ordinal",
                source_id=item.source_id or "missing-source",
                available_at_cutoff=True,
                quality=item.quality,
                confidence={"A": .96, "B": .82, "C": .65, "D": .35}[item.quality],
            )
            for item in context.observations
        ]
        evidence.extend(
            EvidenceRef(
                evidence_id=f"policy:{item['policy_id']}", title=item["title"],
                as_of=item["information_available_date"], value_type="observed",
                source_id=item.get("source_id") or "missing-source", available_at_cutoff=True,
                quality=item["confidence"], confidence={"A": .96, "B": .82, "C": .65, "D": .35}[item["confidence"]],
            ) for item in context.policies
        )
        evidence.extend(
            EvidenceRef(
                evidence_id=f"event:{item['event_id']}",
                title=item["description"],
                as_of=item["information_available_date"],
                value_type="observed",
                source_id=item.get("source_id") or "missing-source",
                available_at_cutoff=True,
                quality=item["confidence"],
                confidence={"A": .96, "B": .82, "C": .65, "D": .35}[item["confidence"]],
            )
            for item in context.events
        )
        return evidence

    def case_outcomes(self, case_ids: set[str]) -> dict[str, str]:
        if not case_ids:
            return {}
        marks = ",".join("?" for _ in case_ids)
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT case_id, outcome FROM case_library WHERE case_id IN ({marks})",
                tuple(sorted(case_ids)),
            ).fetchall()
        return {row["case_id"]: row["outcome"] for row in rows}

    @staticmethod
    def _observation(row: sqlite3.Row) -> RawObservation:
        value = row["value_number"] if row["value_number"] is not None else row["value_text"]
        return RawObservation(
            observation_id=row["observation_id"], entity_id=row["entity_id"], indicator_id=row["indicator_id"], domain=row["domain"],
            value=value, unit=row["unit"], effective_date=row["effective_date"],
            information_available_date=row["information_available_date"], source_id=row["source_id"],
            source_title=row["source_title"], source_url=row["source_url"], quality=row["confidence"],
            source_archived_path=row["source_archived_path"], source_sha256=row["source_sha256"],
            source_retrieved_at=row["source_retrieved_at"],
            verification_status=row["verification_status"], notes=row["notes"],
        )

    @staticmethod
    def _decode_json_fields(row: dict) -> dict:
        result = dict(row)
        for key, value in list(result.items()):
            if key.endswith("_json") and isinstance(value, str):
                result[key[:-5]] = json.loads(value)
                del result[key]
        return result
