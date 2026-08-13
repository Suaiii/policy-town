from __future__ import annotations

import json
import hashlib
import sqlite3
from pathlib import Path

from contracts.investment_simulation_v0_1 import (
    EvidenceFilterDecision,
    EvidenceRef,
    FrozenContextAudit,
    RawObservation,
    RealDataContext,
    StageId,
)


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

    def freeze_audit(
        self,
        stage_id: StageId,
        cutoff_at: str,
        *,
        mode: str = "audit",
        case_ids: set[str] | None = None,
    ) -> FrozenContextAudit:
        """返回可演示的证据冻结决策，不把 future/withheld 材料写回 Context。"""
        if mode not in {"player", "audit", "replay"}:
            raise ValueError(f"unsupported freeze audit mode: {mode}")
        with self._connect() as conn:
            observation_rows = conn.execute(
                """SELECT o.observation_id, o.effective_date, o.information_available_date,
                          o.verification_status, o.source_id, i.indicator_name, e.name AS entity_name
                   FROM observation o JOIN indicator_definition i USING(indicator_id)
                   JOIN entity e USING(entity_id)
                   ORDER BY COALESCE(o.information_available_date, '9999-12-31'), o.observation_id"""
            ).fetchall()
            policy_rows = conn.execute(
                """SELECT policy_id, title, effective_date, policy_date,
                          information_available_date, source_id
                   FROM policy_library ORDER BY COALESCE(information_available_date, '9999-12-31'), policy_id"""
            ).fetchall()
            event_rows = conn.execute(
                """SELECT event_id, description, event_date, effective_from,
                          information_available_date, source_id
                   FROM historical_event ORDER BY COALESCE(information_available_date, '9999-12-31'), event_id"""
            ).fetchall()
            milestones = []
            if case_ids:
                marks = ",".join("?" for _ in case_ids)
                milestones = conn.execute(
                    f"""SELECT milestone_id, description, milestone_date,
                               information_available_date, source_id, is_withheld_outcome
                        FROM case_milestone WHERE case_id IN ({marks})
                        ORDER BY COALESCE(information_available_date, '9999-12-31'), milestone_id""",
                    tuple(sorted(case_ids)),
                ).fetchall()

        decisions: list[EvidenceFilterDecision] = []
        for row in observation_rows:
            decisions.append(self._filter_decision(
                evidence_id=f"observation:{row['observation_id']}",
                kind="observation",
                title=f"{row['entity_name']}·{row['indicator_name']}",
                effective_date=row["effective_date"],
                available_date=row["information_available_date"],
                cutoff_at=cutoff_at,
                source_id=row["source_id"],
                verification_incomplete=row["verification_status"] == "needs_verification",
            ))
        for row in policy_rows:
            decisions.append(self._filter_decision(
                evidence_id=f"policy:{row['policy_id']}", kind="policy", title=row["title"],
                effective_date=row["effective_date"] or row["policy_date"],
                available_date=row["information_available_date"], cutoff_at=cutoff_at,
                source_id=row["source_id"],
            ))
        for row in event_rows:
            decisions.append(self._filter_decision(
                evidence_id=f"event:{row['event_id']}", kind="event", title=row["description"],
                effective_date=row["effective_from"] or row["event_date"],
                available_date=row["information_available_date"], cutoff_at=cutoff_at,
                source_id=row["source_id"],
            ))
        for row in milestones:
            decisions.append(self._filter_decision(
                evidence_id=f"milestone:{row['milestone_id']}", kind="milestone", title=row["description"],
                effective_date=row["milestone_date"], available_date=row["information_available_date"],
                cutoff_at=cutoff_at, source_id=row["source_id"],
                withheld_outcome=bool(row["is_withheld_outcome"]) and mode != "replay",
            ))

        visible_ids = sorted(item.evidence_id for item in decisions if item.decision == "visible")
        digest_payload = json.dumps(
            {"cutoff_at": cutoff_at, "visible_evidence_ids": visible_ids},
            ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        ).encode("utf-8")
        if mode in {"audit", "replay"}:
            displayed = decisions
        else:
            visible = [item for item in decisions if item.decision == "visible"]
            withheld_count = sum(item.decision == "withheld" for item in decisions)
            displayed = [*visible]
            if withheld_count:
                displayed.append(EvidenceFilterDecision(
                    evidence_id=f"withheld:{withheld_count}",
                    evidence_kind="observation",
                    title="当时不可知",
                    effective_date=cutoff_at,
                    information_available_date=None,
                    cutoff_at=cutoff_at,
                    decision="withheld",
                    reason_code="published_after_cutoff",
                    source_id=None,
                ))
        return FrozenContextAudit(
            stage_id=stage_id,
            cutoff_at=cutoff_at,
            mode=mode,
            visible_evidence_ids=visible_ids,
            decisions=displayed,
            context_hash=hashlib.sha256(digest_payload).hexdigest(),
        )

    @staticmethod
    def _filter_decision(
        *,
        evidence_id: str,
        kind: str,
        title: str,
        effective_date: str,
        available_date: str | None,
        cutoff_at: str,
        source_id: str | None,
        verification_incomplete: bool = False,
        withheld_outcome: bool = False,
    ) -> EvidenceFilterDecision:
        if verification_incomplete:
            decision, reason = "withheld", "verification_incomplete"
        elif withheld_outcome:
            decision, reason = "withheld", "withheld_outcome"
        elif not available_date:
            decision, reason = "withheld", "missing_available_date"
        elif available_date > cutoff_at:
            decision, reason = "withheld", "published_after_cutoff"
        else:
            decision, reason = "visible", "available_at_cutoff"
        return EvidenceFilterDecision(
            evidence_id=evidence_id,
            evidence_kind=kind,
            title=title,
            effective_date=effective_date,
            information_available_date=available_date,
            cutoff_at=cutoff_at,
            decision=decision,
            reason_code=reason,
            source_id=source_id,
        )

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

    def replay_audit(self, case_ids: set[str]) -> FrozenContextAudit:
        """终局隔离视图：解锁已登记的后公开证据与 withheld 里程碑。"""
        return self.freeze_audit(
            StageId.S4,
            "9999-12-31",
            mode="replay",
            case_ids=case_ids,
        )

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
