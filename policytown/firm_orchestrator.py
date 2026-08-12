from __future__ import annotations

import json
from pathlib import Path

from .case_registry import load_case_package
from .evidence import validate_evidence_package
from .firm_reality import run_comparison
from .firm_reporting import build_firm_reality_report
from .firm_timeline import run_four_round_timeline
from .invariants import validate_comparison, validate_timeline
from .models import FirmRealityRunRequest, FirmRealityRunResult
from .reality_detectors import detect_firm_reality


class FirmRealityOrchestrator:
    evidence_dir = Path("data/real_world/cases/tencent_docs_2026")

    def run(self, request: FirmRealityRunRequest | None = None) -> FirmRealityRunResult:
        request = request or FirmRealityRunRequest()
        output = Path(request.output_dir)
        output.mkdir(parents=True, exist_ok=True)
        comparison_path = output / "comparison.json"
        timeline_path = output / "timeline.json"
        report_path = output / "firm-reality-report.json"
        harness_path = output / "harness-result.json"
        traces = run_comparison(comparison_path)
        timeline = run_four_round_timeline(timeline_path) if request.include_timeline else []
        evidence_errors = validate_evidence_package(self.evidence_dir)
        invariant_errors = validate_comparison(traces)
        if timeline:
            invariant_errors.extend(validate_timeline(timeline))
        findings = detect_firm_reality(traces)
        report = build_firm_reality_report(load_case_package(self.evidence_dir), traces)
        report_path.write_text(json.dumps(report.model_dump(mode="json"), ensure_ascii=False, indent=2), encoding="utf-8")
        status = "pass" if not evidence_errors and not invariant_errors and not any(x.detector_id == "counterfactual_order_violation" for x in findings) else "fail"
        harness = {
            "harness": "M-firm-reality-v1",
            "status": status,
            "scenarios": {x.settlement.scenario_id: x.settlement.model_dump() for x in traces},
            "findings": [x.model_dump() for x in findings],
            "evidence_errors": evidence_errors,
            "invariant_errors": invariant_errors,
            "timeline_rounds": len(timeline),
            "report_results": len(report.results),
        }
        harness_path.write_text(json.dumps(harness, ensure_ascii=False, indent=2), encoding="utf-8")
        return FirmRealityRunResult(
            status=status,
            comparison_path=str(comparison_path),
            timeline_path=str(timeline_path) if timeline else None,
            report_path=str(report_path),
            harness_path=str(harness_path),
            evidence_errors=evidence_errors,
            invariant_errors=invariant_errors,
        )
