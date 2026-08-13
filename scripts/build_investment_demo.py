from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from contracts.investment_simulation_v0_1 import PlayerAction, StageId, StageInput
from policytown.investment import InvestmentEngine


def main() -> None:
    engine = InvestmentEngine()
    state = engine.new_run("demo-001", ["company_a", "company_b", "company_d"], seed=42)
    plan = {
        StageId.S1: [
            PlayerAction(company_id="company_a", action="invest", capital_points=50),
            PlayerAction(company_id="company_d", action="support", capital_points=25, support_focus="infrastructure"),
        ],
        StageId.S2: [
            PlayerAction(company_id="company_a", action="follow_on", capital_points=35),
            PlayerAction(company_id="company_b", action="support", capital_points=20, support_focus="talent"),
        ],
        StageId.S3: [
            PlayerAction(company_id="company_d", action="restructure", capital_points=15),
            PlayerAction(company_id="company_b", action="follow_on", capital_points=15),
        ],
        StageId.S4: [
            PlayerAction(company_id="company_b", action="invest", capital_points=10),
            PlayerAction(company_id="company_a", action="support", capital_points=5, support_focus="supply_chain"),
        ],
    }
    stages = []
    for stage_id in StageId:
        result = engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=stage_id, seed=42, actions=plan[stage_id]))
        stages.append(result.model_dump(mode="json"))
        state = result.next_state
    payload = {"stages": stages, "final": engine.finalize(state).model_dump(mode="json")}
    target = ROOT / "data" / "hefei_mvp" / "demo_run.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
