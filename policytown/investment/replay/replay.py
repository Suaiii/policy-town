"""外层回路：历史校准 — 反事实验证。

- replay_historical：用历史决策序列替代玩家，跑完整 S1—S4，输出四评分。
  这是引擎校准基线（文档 2.4）：真实决策输入 → 方向应在容差内复现。
- score_run：对任意一局（玩家世界线）打四个分数。
- leakage_audit：扫描输出中不得出现真实案例名、证据不得晚于截止日。
"""
from __future__ import annotations

import json
import re
from typing import Dict, List

_STAGE_ORDER = ("S1", "S2", "S3", "S4")
_COMPANY_TO_PROTO = lambda cid: "proto_" + cid.split("_")[-1]  # noqa: E731


def replay_historical(company_ids: List[str], seed: int = 42) -> dict:
    from ..core.orchestrator import Orchestrator
    orch = Orchestrator(run_id="historical-replay", seed=seed)
    orch.start(company_ids, "S1")
    for stage_id in _STAGE_ORDER:
        orch.open_stage()
        decisions = []
        for cid in company_ids_to_cids(company_ids):
            proto = orch.prototypes[_COMPANY_TO_PROTO(cid)]
            for d in proto["historical_decisions"].get(stage_id, []):
                decisions.append({"company_id": cid, **d})
        orch.submit_decisions(decisions)
        if stage_id != _STAGE_ORDER[-1]:
            orch.advance_stage()
    return orch.finish()


def company_ids_to_cids(company_ids: List[str]) -> List[str]:
    return ["company_%s" % pid.split("_")[-1] for pid in company_ids]


def score_run(state, prototypes: Dict[str, dict]) -> dict:
    direction_hits = direction_total = 0
    seq_hits = seq_total = 0
    mech_hits = mech_total = 0
    path_hits = path_total = 0

    for cid, comp in state.companies.items():
        proto = prototypes.get(_COMPANY_TO_PROTO(cid))
        if proto is None:
            continue
        targets = proto["replay_targets"]
        init = proto["initial_metrics"]

        for metric, expected in targets["direction"].items():
            direction_total += 1
            actual = comp.metrics.get(metric, 0) - init.get(metric, 0)
            if _sign_match(actual, expected):
                direction_hits += 1

        expected_order = targets["milestone_order"]
        got_order = [m for m in comp.milestones_done if m in expected_order]
        seq_total += 1
        if got_order[:len(expected_order)] == expected_order[:len(got_order)] and got_order:
            seq_hits += 1
        elif not expected_order and not got_order:
            seq_hits += 1

        for mech in targets["risk_mechanisms"]:
            mech_total += 1
            fired = set(comp.risk_mechanisms_fired)
            negative = any(d < 0 for d in [comp.metrics["project_cashflow"] - init["project_cashflow"]])
            if mech in fired or (mech in ("follow_on_pressure", "overcapacity", "asset_sink",
                                          "commercialization_gap", "execution_failure") and negative):
                mech_hits += 1

        for key, expected in targets["path_feedback"].items():
            path_total += 1
            industry = key.split(".", 1)[1]
            base = state.city.industrial_base.get(industry, 0.0)
            if _sign_match(base, expected):
                path_hits += 1

    return {
        "direction_score": _ratio(direction_hits, direction_total),
        "sequence_score": _ratio(seq_hits, seq_total),
        "mechanism_score": _ratio(mech_hits, mech_total),
        "path_feedback_score": _ratio(path_hits, path_total),
        "leakage_audit_passed": leakage_audit(state, prototypes),
    }


def leakage_audit(state, prototypes: Dict[str, dict]) -> bool:
    """真实案例名不得出现在任何输出；证据发布日期不得晚于截止日。"""
    blob = json.dumps(state.history, ensure_ascii=False) + json.dumps(
        {cid: c.anon_label for cid, c in state.companies.items()}, ensure_ascii=False)
    for cid in state.companies:
        proto = prototypes.get(_COMPANY_TO_PROTO(cid))
        if proto is None:
            continue
        real = re.sub(r"（.*?）", "", proto["historical_case"])
        for token in re.split(r"[/、]", real):
            token = token.strip()
            if token and token in blob:
                return False
    for comp in state.companies.values():
        for ev in comp.evidence:
            if ev.publication_date > state.cutoff_at:
                return False
    return True


def _sign_match(actual: float, expected: int) -> bool:
    if expected > 0:
        return actual > 5
    if expected < 0:
        return actual < -5
    return abs(actual) <= 5


def _ratio(hits: int, total: int) -> float:
    return round(hits / total, 3) if total else 1.0
