from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from contracts.investment_simulation_v0_1 import PlayerAction, StageId, StageInput
from policytown.investment import InvestmentEngine

OUTPUT = ROOT / "data" / "hefei_mvp_runs" / "first_barrage.json"


def main() -> None:
    engine = InvestmentEngine()
    state = engine.new_run("first_barrage", ["company_a", "company_d"], seed=42)
    plan = {
        StageId.S1: [PlayerAction(company_id="company_a", action="invest", capital_points=55)],
        StageId.S2: [PlayerAction(company_id="company_a", action="support", capital_points=35, support_focus="supply_chain")],
        StageId.S3: [PlayerAction(company_id="company_d", action="restructure", capital_points=30)],
        StageId.S4: [PlayerAction(company_id="company_a", action="follow_on", capital_points=35)],
    }
    stages = []
    for stage_id, actions in plan.items():
        result = engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=stage_id, seed=42, actions=actions))
        stages.append(result.model_dump(mode="json"))
        state = result.next_state
    final = engine.finalize(state)
    payload = {
        "warning": "This is an engine smoke test. Ordinal transition parameters are not yet calibrated as historical estimates.",
        "data_package": "data/historical_cases/hefei_boe_2008",
        "stages": stages,
        "final": final.model_dump(mode="json"),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps(payload["final"], ensure_ascii=False))


if __name__ == "__main__":
    main()
