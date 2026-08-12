from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from policytown.firm_orchestrator import FirmRealityOrchestrator


def main() -> None:
    result = FirmRealityOrchestrator().run()
    print(result.model_dump_json())
    if result.status != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
