from __future__ import annotations

import argparse
import json
from pathlib import Path

from contracts.investment_simulation_v0_1 import StageId, StageInput
from .investment import HefeiRealDataRepository, InvestmentEngine


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="policytown",
        description="合肥产业投资推演系统内核",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    data_context = commands.add_parser("investment-context")
    data_context.add_argument("--cutoff", default="2008-09-30")

    investment_run = commands.add_parser("investment-run")
    investment_run.add_argument("--companies", nargs="+", default=["company_a", "company_d"])
    investment_run.add_argument("--output", default="data/hefei_mvp/demo_run.json")

    args = parser.parse_args()

    if args.command == "investment-context":
        print(HefeiRealDataRepository().context_at(args.cutoff).model_dump_json(indent=2))
    elif args.command == "investment-run":
        engine = InvestmentEngine()
        state = engine.new_run("cli-investment", args.companies, seed=42)
        stages = []
        for stage_id in StageId:
            result = engine.run_stage(
                state,
                StageInput(run_id=state.run_id, stage_id=stage_id, seed=42, actions=[]),
            )
            stages.append(result.model_dump(mode="json"))
            state = result.next_state
        payload = {"stages": stages, "final": engine.finalize(state).model_dump(mode="json")}
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(target.resolve())


if __name__ == "__main__":
    main()
