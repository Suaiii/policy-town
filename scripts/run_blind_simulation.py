from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from contracts.investment_simulation_v0_1 import StageId, StageInput
from policytown.investment import InvestmentEngine
from policytown.investment.blind_simulation import run_blind_decision


def main() -> None:
    use_api = os.getenv("INVESTMENT_AGENT_LLM", "").lower() in {"1", "true", "yes", "on"}
    engine = InvestmentEngine(use_agent_api=use_api)
    state = engine.new_run("blind-simulation", ["company_a", "company_d"], seed=42)

    # 京东方：S1（2008-09-12 决策点）
    results = [
        run_blind_decision(
            engine, state, stage_id=StageId.S1, seed=42, company_id="company_a",
        ).model_dump(mode="json")
    ]
    # 赛维：决策点 2010-08-30 落在 S2 窗口内，先推进一阶段再盲测
    s1_result = engine.run_stage(
        state,
        StageInput(run_id=state.run_id, stage_id=StageId.S1, seed=42),
    )
    results.append(
        run_blind_decision(
            engine, s1_result.next_state, stage_id=StageId.S2, seed=42, company_id="company_d",
        ).model_dump(mode="json")
    )

    payload = {
        "mode": "blind-simulation",
        "agent_runtime": "opencode-go/deepseek-v4-flash" if use_api else "deterministic_fallback",
        "results": results,
    }
    target = ROOT / "output" / "blind_simulation.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    for result in results:
        print(
            f"{result['company_id']} -> {result['case_id']}: "
            f"departments={result['department_recommendations']} "
            f"recommend={result['recommended_action']} baseline={result['baseline_action']} "
            f"match={result['action_matches_baseline']}"
        )
    print(target)


if __name__ == "__main__":
    main()
