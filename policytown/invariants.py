from __future__ import annotations

from .firm_reality import DecisionTrace
from .firm_timeline import FirmRoundTrace


def validate_comparison(traces: list[DecisionTrace]) -> list[str]:
    errors: list[str] = []
    ids = [item.settlement.scenario_id for item in traces]
    if ids != ["A0", "A1", "A2", "A3"]:
        errors.append(f"expected A0-A3 order, got {ids}")
    strategy = {item.intent.strategy_priority for item in traces}
    if len(strategy) != 1:
        errors.append("policy tools changed the firm's strategy priority")
    values = [item.settlement.net_unemployment for item in traces]
    if values != sorted(values, reverse=True):
        errors.append(f"net unemployment is not monotone: {values}")
    for item in traces:
        result = item.settlement
        if result.internal_transfer_accepted > result.transfer_eligible:
            errors.append(f"{result.scenario_id}: accepted transfer exceeds eligibility")
        if not any(ref.provenance == "scenario_assumption" for ref in result.evidence_chain):
            errors.append(f"{result.scenario_id}: missing scenario assumption provenance")
        if not any(ref.provenance == "rule_result" for ref in result.evidence_chain):
            errors.append(f"{result.scenario_id}: missing rule result provenance")
    return errors


def validate_timeline(traces: list[FirmRoundTrace]) -> list[str]:
    errors: list[str] = []
    if [item.round for item in traces] != list(range(1, len(traces) + 1)):
        errors.append("timeline rounds are not contiguous")
    if any(len(item.belief_snapshot) != 6 for item in traces):
        errors.append("timeline does not expose exactly six decision beliefs")
    if len({item.intent.strategy_priority for item in traces}) != 1:
        errors.append("timeline changed strategy priority")
    return errors
