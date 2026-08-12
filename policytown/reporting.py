from __future__ import annotations

from contracts.schema import Snapshot

from .detectors import RECOMMENDATIONS, detect
from .models import PolicyReport


def build_report(reference_id: str, reference: list[Snapshot], scenario_id: str, candidate: list[Snapshot]) -> PolicyReport:
    findings = detect(reference, candidate)
    ref, cur = reference[-1], candidate[-1]
    recommendation_ids = list(dict.fromkeys(item.recommendation_id for item in findings if item.recommendation_id))
    misleading = []
    if cur.metrics.unemployment_rate < ref.metrics.unemployment_rate and cur.metrics.employment_total < ref.metrics.employment_total:
        misleading.append("官方失业率下降，但总就业同时下降；单看失业率会高估政策效果。")
    comparison = {
        key: {"reference": getattr(ref.metrics, key), "candidate": getattr(cur.metrics, key)}
        for key in ("formal_layoff", "unemployment_rate", "employment_total", "outsource_share", "hidden_unemployment", "skill_mismatch_gap")
    }
    return PolicyReport(
        scenario_id=scenario_id,
        reference_scenario_id=reference_id,
        protected_groups=["正式裁员渠道中的劳动者获得更高补偿与程序保护"],
        findings=findings,
        misleading_metrics=misleading,
        recommendations=[RECOMMENDATIONS[item] for item in recommendation_ids],
        limitations=["结果用于识别机制与比较方案，不是现实点预测。", "群体分布不能用于预测具体个人。", "具体比例与尖峰高度属于 L3 纯推演。"],
        comparison=comparison,
    )
