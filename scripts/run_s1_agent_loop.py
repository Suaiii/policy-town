from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from contracts.investment_simulation_v0_1 import (
    NegotiationChoice,
    PlayerAction,
    StageId,
    StageInput,
)
from policytown.investment import InvestmentEngine


def main() -> None:
    use_api = os.getenv("INVESTMENT_AGENT_LLM", "").lower() in {"1", "true", "yes", "on"}
    engine = InvestmentEngine(use_agent_api=use_api)
    state = engine.new_run("s1-agent-loop", ["company_a", "company_d"], seed=42)
    preview = engine.run_stage(
        state,
        StageInput(run_id=state.run_id, stage_id=StageId.S1, seed=42),
    )
    proposal = preview.deliberations[0].meeting.proposals[0]
    result = engine.run_stage(
        state,
        StageInput(
            run_id=state.run_id,
            stage_id=StageId.S1,
            seed=42,
            actions=[
                PlayerAction(
                    company_id="company_a",
                    action="invest",
                    capital_points=proposal.capital_points,
                )
            ],
            negotiations=[
                NegotiationChoice(
                    company_id="company_a",
                    proposal_id=proposal.proposal_id,
                    resolution="accept",
                )
            ],
        ),
    )
    payload = {
        "preview": {
            "stage_id": preview.stage_id.value,
            "cutoff_at": preview.cutoff_at,
            "budget": preview.budget.model_dump(mode="json"),
            "deliberations": [item.model_dump(mode="json") for item in preview.deliberations],
        },
        "settled": result.model_dump(mode="json"),
        "agent_runtime": "opencode-go/deepseek-v4-flash" if use_api else "deterministic_fallback",
    }
    target = ROOT / "output" / "s1_agent_loop.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
