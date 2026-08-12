from __future__ import annotations

import argparse
import json

from .models import RunRequest
from .orchestrator import SimulationOrchestrator
from .reporting import build_report
from .scenario import ScenarioCatalog
from .store import FileSnapshotStore
from .firm_orchestrator import FirmRealityOrchestrator
from .models import FirmRealityRunRequest
from contracts.investment_simulation_v0_1 import PlayerAction, StageId, StageInput
from .investment import HefeiRealDataRepository, InvestmentEngine


def _snapshots(catalog: ScenarioCatalog, scenario_id: str):
    scenario = catalog.get(scenario_id)
    store = FileSnapshotStore(catalog.root)
    return [store.load_round(scenario, round_no) for round_no in range(1, catalog.manifest.rounds + 1)]


def main() -> None:
    parser = argparse.ArgumentParser(prog="policytown", description="Policy Town integration kernel")
    parser.add_argument("--manifest", default="scenarios/manifest.json")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate")
    run = commands.add_parser("run")
    run.add_argument("scenario")
    run.add_argument("--rounds", type=int)
    run.add_argument("--output-dir")
    run.add_argument("--mode", choices=("replay", "live"), default="replay")
    report = commands.add_parser("report")
    report.add_argument("scenario")
    reality = commands.add_parser("firm-reality")
    reality.add_argument("--output-dir", default="data/run_firm_A_narrow")
    reality.add_argument("--no-timeline", action="store_true")
    data_context = commands.add_parser("investment-context")
    data_context.add_argument("--cutoff", default="2008-09-30")
    investment_run = commands.add_parser("investment-run")
    investment_run.add_argument("--companies", nargs="+", default=["company_a", "company_d"])
    investment_run.add_argument("--output", default="data/hefei_mvp/demo_run.json")
    args = parser.parse_args()
    catalog = ScenarioCatalog(args.manifest)
    if args.command == "validate":
        errors = catalog.validate_files()
        if errors:
            raise SystemExit("\n".join(errors))
        for scenario in catalog.manifest.scenarios:
            if scenario.status == "ready":
                _snapshots(catalog, scenario.id)
        print(f"OK: manifest v{catalog.manifest.version}, contract snapshots valid")
    elif args.command == "run":
        result = SimulationOrchestrator(catalog).run(RunRequest(scenario_id=args.scenario, rounds=args.rounds, output_dir=args.output_dir, mode=args.mode))
        print(result.model_dump_json(indent=2))
    elif args.command == "report":
        reference = catalog.reference()
        result = build_report(reference.id, _snapshots(catalog, reference.id), args.scenario, _snapshots(catalog, args.scenario))
        print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
    elif args.command == "firm-reality":
        result = FirmRealityOrchestrator().run(FirmRealityRunRequest(output_dir=args.output_dir, include_timeline=not args.no_timeline))
        print(result.model_dump_json(indent=2))
        if result.status != "pass":
            raise SystemExit(1)
    elif args.command == "investment-context":
        print(HefeiRealDataRepository().context_at(args.cutoff).model_dump_json(indent=2))
    elif args.command == "investment-run":
        engine = InvestmentEngine()
        state = engine.new_run("cli-investment", args.companies, seed=42)
        stages = []
        for stage_id in StageId:
            result = engine.run_stage(state, StageInput(run_id=state.run_id, stage_id=stage_id, seed=42, actions=[]))
            stages.append(result.model_dump(mode="json"))
            state = result.next_state
        payload = {"stages": stages, "final": engine.finalize(state).model_dump(mode="json")}
        from pathlib import Path
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(target.resolve())


if __name__ == "__main__":
    main()
