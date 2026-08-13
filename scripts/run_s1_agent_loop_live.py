from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_local_env() -> None:
    path = ROOT / ".env.local"
    if not path.exists():
        raise FileNotFoundError(".env.local not found; copy .env.example and set LLM_API_KEY")
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def main() -> None:
    load_local_env()
    os.environ["INVESTMENT_AGENT_LLM"] = "1"
    os.environ["INVESTMENT_AGENT_REQUIRE_LLM"] = "1"
    os.environ.setdefault("INVESTMENT_AGENT_TIMEOUT", "15")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "run_s1_agent_loop.py")],
        cwd=ROOT,
        env=os.environ,
        check=True,
    )


if __name__ == "__main__":
    main()
