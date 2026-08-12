from __future__ import annotations

from collections import Counter

from contracts.schema import Snapshot

from .models import Recommendation, RiskFinding


RECOMMENDATIONS = {
    "merge_batches": Recommendation(id="merge_batches", title="连续批次合并计算", rationale="门槛下方出现异常批次聚集。", parameter_patch={"merge_consecutive_batches": True}, validation_metric="threshold_cluster_count", target_scenario="fix2"),
    "skill_subsidy": Recommendation(id="skill_subsidy", title="将保岗补贴改为技能转换补贴", rationale="未被直接管制的企业收缩招聘，且岗位与技能同时错配。", parameter_patch={"hiring_subsidy": 0, "skill_subsidy": 1.0}, validation_metric="employment_total", target_scenario="fix1"),
    "cover_outsource": Recommendation(id="cover_outsource", title="将外包用工纳入报备口径", rationale="正式裁员向统计口径外的外包渠道迁移。", parameter_patch={"outsourcing_in_scope": True}, validation_metric="outsource_share", target_scenario="fix2"),
    "track_exit": Recommendation(id="track_exit", title="增加长期失业跟踪与再就业衔接", rationale="退出劳动力市场的人数明显上升。", parameter_patch={"long_term_tracking": True}, validation_metric="hidden_unemployment", target_scenario="fix3"),
}


def _firm(snapshot: Snapshot, firm_id: str):
    return next(firm for firm in snapshot.firms if firm.firm_id == firm_id)


def detect(reference: list[Snapshot], candidate: list[Snapshot]) -> list[RiskFinding]:
    findings: list[RiskFinding] = []
    threshold = candidate[-1].policy.layoff_threshold
    if threshold < 999:
        batches = [batch for snap in candidate for firm in snap.firms for batch in firm.layoff_batches]
        clustered = sum(count for value, count in Counter(batches).items() if threshold - 2 <= value < threshold)
        if clustered >= 4:
            findings.append(RiskFinding(detector_id="threshold_clustering", title="门槛下批次聚集", severity="critical", summary=f"报备门槛 {threshold} 人下方出现 {clustered} 个批次。", evidence={"threshold": threshold, "clustered_batches": clustered}, recommendation_id="merge_batches"))
    ref_hiring = _firm(reference[-1], "B").hiring_campus + _firm(reference[-1], "B").hiring_social
    cur_hiring = _firm(candidate[-1], "B").hiring_campus + _firm(candidate[-1], "B").hiring_social
    if cur_hiring < ref_hiring * .75:
        findings.append(RiskFinding(detector_id="untargeted_hiring_contraction", title="未被管制企业招聘收缩", severity="critical", summary=f"B 厂招聘由参考情形 {ref_hiring} 降至 {cur_hiring}。", evidence={"reference": ref_hiring, "candidate": cur_hiring, "change_rate": round(cur_hiring / ref_hiring - 1, 4)}, confidence="L1", recommendation_id="skill_subsidy"))
    ref_outsource, cur_outsource = reference[-1].metrics.outsource_share, candidate[-1].metrics.outsource_share
    if cur_outsource > ref_outsource + .02:
        findings.append(RiskFinding(detector_id="outsourcing_shift", title="就业向外包转移", severity="warning", summary="正式岗位向低质量外包渠道迁移。", evidence={"reference": ref_outsource, "candidate": cur_outsource}, recommendation_id="cover_outsource"))
    cur_exit, ref_exit = candidate[-1].metrics.hidden_unemployment, reference[-1].metrics.hidden_unemployment
    if cur_exit > ref_exit * 1.25:
        findings.append(RiskFinding(detector_id="hidden_exit", title="统计口径外退出增加", severity="critical", summary="退出劳动力市场人数上升，官方失业率可能改善但真实就业恶化。", evidence={"reference": ref_exit, "candidate": cur_exit}, recommendation_id="track_exit"))
    mismatch = candidate[-1].metrics.skill_mismatch_gap
    if mismatch > 0:
        findings.append(RiskFinding(detector_id="skill_mismatch", title="岗位与技能同时错配", severity="warning", summary="市场存在失业者时，C 厂仍有岗位无法填满。", evidence={"skill_mismatch_gap": mismatch}, confidence="L2", recommendation_id="skill_subsidy"))
    return findings
