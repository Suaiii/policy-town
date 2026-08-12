from __future__ import annotations

import re
from pathlib import Path
import yaml


REQUIRED_FILES = {"source.yaml", "facts.yaml", "mechanisms.yaml", "timeline.yaml", "unknowns.yaml"}
FORBIDDEN_UNKNOWN_PATTERNS = (
    r"exact_affected_headcount\s*:\s*\d",
    r"exact_internal_transfer_acceptance_rate\s*:\s*[0-9.]",
    r"exact_severance_terms\s*:\s*[^\s#-]",
)


def validate_evidence_package(path: str | Path) -> list[str]:
    root = Path(path)
    errors: list[str] = []
    missing = REQUIRED_FILES - {item.name for item in root.glob("*.yaml")}
    errors.extend(f"missing evidence file: {name}" for name in sorted(missing))
    if missing:
        return errors
    source_text = (root / "source.yaml").read_text(encoding="utf-8")
    unknowns_text = (root / "unknowns.yaml").read_text(encoding="utf-8")
    try:
        source = yaml.safe_load(source_text)
        facts = yaml.safe_load((root / "facts.yaml").read_text(encoding="utf-8"))
        mechanisms = yaml.safe_load((root / "mechanisms.yaml").read_text(encoding="utf-8"))
        unknowns = yaml.safe_load(unknowns_text)
        yaml.safe_load((root / "timeline.yaml").read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return [f"invalid YAML: {exc}"]
    if source.get("identity_policy") != "do_not_impersonate_company":
        errors.append("source must prohibit company impersonation")
    fact_ids = {item["fact_id"] for item in facts}
    mechanism_refs = {ref for item in mechanisms for ref in item.get("source_fact_ids", [])}
    unknown_refs = mechanism_refs - fact_ids
    errors.extend(f"mechanism references unknown fact: {item}" for item in sorted(unknown_refs))
    if unknowns.get("policy") != "must_remain_unknown":
        errors.append("unknowns must declare must_remain_unknown")
    for pattern in FORBIDDEN_UNKNOWN_PATTERNS:
        if re.search(pattern, unknowns_text):
            errors.append(f"unknown value was filled: {pattern}")
    return errors
