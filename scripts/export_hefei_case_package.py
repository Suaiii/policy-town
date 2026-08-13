from __future__ import annotations

import argparse
import sqlite3
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "hefei_industry_simulation.sqlite3"


def item_from_observation(row: sqlite3.Row) -> dict:
    value = row["value_number"] if row["value_number"] is not None else row["value_text"]
    return {
        "id": f"observation:{row['observation_id']}",
        "kind": "world_state",
        "payload": {
            "entity_id": row["entity_id"], "indicator_id": row["indicator_id"],
            "value": value, "unit": row["unit"], "effective_date": row["effective_date"],
            "confidence": row["confidence"], "verification_status": row["verification_status"],
        },
        "visible_to": ["public"],
        "observed_at": f"{row['information_available_date']}T00:00:00" if row["information_available_date"] else None,
        "source_ids": [row["source_id"]] if row["source_id"] else [],
    }


def export(case_id: str, cutoff: date, output: Path) -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    output.mkdir(parents=True, exist_ok=True)
    case = conn.execute("SELECT * FROM case_library WHERE case_id=?", (case_id,)).fetchone()
    if case is None:
        raise SystemExit(f"unknown case: {case_id}")

    observations = conn.execute(
        """SELECT * FROM observation
           WHERE information_available_date IS NOT NULL
             AND verification_status <> 'needs_verification'
           ORDER BY information_available_date, observation_id"""
    ).fetchall()
    pre = [item_from_observation(row) for row in observations if row["information_available_date"] <= cutoff.isoformat()]
    withheld = [item_from_observation(row) for row in observations if row["information_available_date"] > cutoff.isoformat()]

    for row in conn.execute("SELECT * FROM policy_library ORDER BY information_available_date"):
        item = {
            "id": f"policy:{row['policy_id']}", "kind": "policy",
            "payload": {"title": row["title"], "tool_type": row["tool_type"], "effects": row["policy_effects_json"]},
            "visible_to": ["public"], "observed_at": f"{row['information_available_date']}T00:00:00", "source_ids": [row["source_id"]],
        }
        (pre if row["information_available_date"] <= cutoff.isoformat() else withheld).append(item)

    for row in conn.execute("SELECT * FROM case_milestone WHERE case_id=? ORDER BY milestone_date", (case_id,)):
        item = {
            "id": f"milestone:{row['milestone_id']}", "kind": "episode",
            "payload": {"stage": row["stage"], "description": row["description"], "milestone_date": row["milestone_date"]},
            "visible_to": ["public"], "observed_at": f"{row['information_available_date']}T00:00:00" if row["information_available_date"] else None, "source_ids": [row["source_id"]] if row["source_id"] else [],
        }
        (pre if row["information_available_date"] and row["information_available_date"] <= cutoff.isoformat() and not row["is_withheld_outcome"] else withheld).append(item)

    metadata = {"case_id": f"{case_id.lower()}_replay", "cutoff_at": cutoff.isoformat(), "model_version": "hefei-mvp-0.1", "rule_version": "hefei-industry-investment-v1", "prompt_version": "hefei-replay-v1"}
    targets = [
        {"target_id":"historical_outcome","target_type":"directional","weight":1.0,"expected":case["outcome"],"metric_path":"decision.expected_outcome"},
        {"target_id":"project_action","target_type":"behavior_pattern","weight":1.0,"expected":"invest","metric_path":"decision.action"},
    ]
    if (output / "decision_baseline.yaml").exists():
        targets.append({
            "target_id": "government_action_baseline",
            "target_type": "action_baseline",
            "weight": 1.0,
            "baseline_ref": "decision_baseline.yaml",
            "match_fields": [
                "government_action.action",
                "decision_date",
                "milestones",
            ],
        })
    for name, payload in (("case.yaml",metadata),("pre_cutoff.yaml",pre),("withheld.yaml",withheld),("targets.yaml",targets)):
        (output / name).write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")
    print(f"pre_cutoff={len(pre)} withheld={len(withheld)} output={output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", default="CASE-02")
    parser.add_argument("--cutoff", type=date.fromisoformat, default=date(2008, 9, 12))
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "historical_cases" / "hefei_boe_2008")
    args = parser.parse_args()
    export(args.case, args.cutoff, args.output)


if __name__ == "__main__":
    main()
