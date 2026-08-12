from __future__ import annotations

from .firm_reality import DecisionTrace
from .models import RiskFinding


def detect_firm_reality(traces: list[DecisionTrace]) -> list[RiskFinding]:
    by_id = {x.settlement.scenario_id: x for x in traces}
    findings: list[RiskFinding] = []
    a0, a1, a2, a3 = (by_id[x].settlement for x in ("A0", "A1", "A2", "A3"))
    if a1.internal_transfer_accepted < a1.transfer_eligible:
        findings.append(RiskFinding(
            detector_id="internal_transfer_failure",
            title="内部转岗受到地域接受度约束",
            severity="warning",
            summary="获得转岗资格不等于接受转岗；迁移拒绝形成了可复核损耗。",
            evidence={"eligible": a1.transfer_eligible, "accepted": a1.internal_transfer_accepted, "relocation_declined": a1.relocation_declined},
            confidence="L3",
        ))
    if a1.internal_transfer_accepted < a0.affected_workers and a1.transfer_eligible < a1.affected_workers:
        findings.append(RiskFinding(
            detector_id="tool_disease_mismatch",
            title="单一内部活水无法覆盖技能错配",
            severity="critical",
            summary="内部岗位容量、技能门槛与迁移意愿共同限制政策工具覆盖面。",
            evidence={"affected": a1.affected_workers, "eligible": a1.transfer_eligible, "accepted": a1.internal_transfer_accepted},
            confidence="L3",
        ))
    if not (a0.net_unemployment >= a1.net_unemployment >= a2.net_unemployment >= a3.net_unemployment):
        findings.append(RiskFinding(
            detector_id="counterfactual_order_violation",
            title="对照方案未呈现预期单调关系",
            severity="critical",
            summary="增加转岗、迁移支持和政府承接后，净失业未按预期下降。",
            evidence={key: by_id[key].settlement.net_unemployment for key in by_id},
            confidence="L3",
        ))
    if a3.workers_without_savings_buffer > 0:
        findings.append(RiskFinding(
            detector_id="policy_timing_gap",
            title="政策生效时间晚于部分劳动者缓冲期",
            severity="warning",
            summary="培训和承接能够改善最终结果，但部分等待人群缺少足够储蓄缓冲。",
            evidence={"training_waiters": a3.workers_waiting_for_training, "without_savings_buffer": a3.workers_without_savings_buffer, "timing_gap_months": a3.timing_gap_months},
            confidence="L3",
        ))
    return findings
