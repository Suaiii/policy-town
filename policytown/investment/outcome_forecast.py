"""把判断账（信念）转化为可打分的概率化结局预测，并对标真实历史结局。

预测范式：只使用截止日前可见证据（引擎已在每阶段做 cutoff 过滤）驱动
判断账的四项信念，再把这些信念合成 P(success)；结局揭晓后用 proper
scoring rule 与判别指标评估校准质量。信念值均来自 bounded_evidence_blend_v1
并携带 evidence_ids，故每条预测都可回溯到证据链。
"""

from __future__ import annotations

from typing import Sequence

from contracts.investment_simulation_v0_1 import (
    EnterpriseBeliefState,
    OutcomeForecast,
    OutcomePredictionReport,
)

from .prediction_metrics import (
    brier_score,
    direction_accuracy,
    expected_calibration_error,
    log_loss,
    roc_auc_score,
)

# 结局预测权重（先验）：重资产项目成败以“资金链能否撑到投产”和
# “技术与执行能否按期兑现”为先，市场周期次之，政府持续投入再次之。
FORECAST_WEIGHTS: dict[str, float] = {
    "financing_continuity": 0.35,
    "delivery_feasibility": 0.35,
    "market_outlook": 0.20,
    "government_follow_through": 0.10,
}

FORECAST_BASIS = (
    "P(success)=Σ权重·信念；financing_continuity 0.35 / delivery_feasibility 0.35 / "
    "market_outlook 0.20 / government_follow_through 0.10。四项信念由 "
    "bounded_evidence_blend_v1 从截止日前 Context 派生并携带 evidence_ids。"
)


def derive_p_success(beliefs: EnterpriseBeliefState) -> float:
    """加权合成 P(success)，并裁剪到 [0, 1]。"""
    total = sum(FORECAST_WEIGHTS.values())
    weighted = sum(
        FORECAST_WEIGHTS[key] * getattr(beliefs, key)
        for key in FORECAST_WEIGHTS
    )
    return min(max(weighted / total, 0.0), 1.0)


def derive_outcome_forecast(
    *,
    case_id: str,
    company_id: str,
    cutoff_at: str,
    beliefs: EnterpriseBeliefState,
    ground_truth: str,
    evidence_ids: list[str] | None = None,
) -> OutcomeForecast:
    """从企业信念推导一条结局预测，并附证据链与逐样本 Brier 贡献。"""
    p = derive_p_success(beliefs)
    predicted = "success" if p >= 0.5 else "failure"
    is_known = ground_truth in {"success", "failure"}
    correct = (predicted == ground_truth) if is_known else None
    y = 1.0 if ground_truth == "success" else 0.0
    brier = (p - y) ** 2 if is_known else None
    breakdown = {key: getattr(beliefs, key) for key in FORECAST_WEIGHTS}
    return OutcomeForecast(
        case_id=case_id,
        company_id=company_id,
        cutoff_at=cutoff_at,
        p_success=round(p, 4),
        predicted_direction=predicted,
        ground_truth=ground_truth,
        evidence_ids=list(evidence_ids or beliefs.evidence_ids or []),
        signal_breakdown={key: round(value, 4) for key, value in breakdown.items()},
        basis=FORECAST_BASIS,
        is_correct_direction=correct,
        brier_contribution=round(brier, 6) if brier is not None else None,
    )


def evaluate_forecasts(
    forecasts: Sequence[OutcomeForecast],
    *,
    leakage_passed: bool = True,
) -> OutcomePredictionReport:
    """聚合逐案例预测，输出 Brier / log-loss / ECE / AUC / 方向命中率。"""
    scored = [item for item in forecasts if item.ground_truth in {"success", "failure"}]
    if not scored:
        return OutcomePredictionReport(
            calibrated_case_count=0,
            leakage_passed=leakage_passed,
            score_basis=_SCORE_BASIS,
            limitations=["没有已核验成功/失败结局的案例，无法计算预测指标。"],
            forecasts=[],
        )
    y = [1.0 if item.ground_truth == "success" else 0.0 for item in scored]
    p = [item.p_success for item in scored]
    report = OutcomePredictionReport(
        brier_score=round(brier_score(y, p), 6),
        log_loss=round(log_loss(y, p), 6),
        expected_calibration_error=round(expected_calibration_error(y, p), 6),
        direction_accuracy=round(direction_accuracy(y, p), 6),
        calibrated_case_count=len(scored),
        leakage_passed=leakage_passed,
        score_basis=_SCORE_BASIS,
        limitations=[
            "仅基于判断账四项信念合成的 P(success)，不是独立校准的概率模型。",
            f"当前仅有 {len(scored)} 个已核验案例，聚合指标具示意性，不具统计显著性。",
        ],
        forecasts=list(scored),
    )
    if len(set(y)) == 2:
        report.roc_auc = round(roc_auc_score(y, p), 6)
    else:
        report.limitations.append("成功/失败两类案例不齐全，无法计算 ROC-AUC。")
    return report


_SCORE_BASIS = {
    "brier_score": "mean((p-y)^2)，proper scoring rule，越小越好（0=完美）",
    "log_loss": "-(y·log p+(1-y)·log(1-p))，同时衡量校准与判别，越小越好",
    "expected_calibration_error": "等宽分箱比较平均预测概率与真实频率的偏差",
    "roc_auc": "Mann-Whitney U，判别成功/失败案例的排序能力，不依赖阈值",
    "direction_accuracy": "0.5 阈值方向命中率，等价于原 direction_score",
}
