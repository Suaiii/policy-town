from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "hefei_industry_simulation.sqlite3"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    conn = sqlite3.connect(args.db)
    print("integrity=", conn.execute("PRAGMA integrity_check").fetchone()[0])
    for table in ("observation", "case_library", "case_milestone", "historical_event", "policy_library", "data_gap"):
        print(f"{table}=", conn.execute(f"SELECT COUNT(1) FROM {table}").fetchone()[0])
    print("completeness=")
    for row in conn.execute("SELECT * FROM database_completeness ORDER BY domain"):
        print(row)


if __name__ == "__main__":
    main()
