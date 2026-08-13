"""概率预测评估指标（纯标准库实现）。

本项目后端约束为“仅标准库 + pydantic/PyYAML”，无法直接依赖 scikit-learn。
本模块把概率预测领域最常用的五个评估算法，按 scikit-learn 的算法定义改写为
纯 Python 实现，数值行为对标：

- ``sklearn.metrics.brier_score_loss``   -> :func:`brier_score`
- ``sklearn.metrics.log_loss``           -> :func:`log_loss`
- ``sklearn.metrics.calibration_curve``  -> :func:`expected_calibration_error`
- ``sklearn.metrics.roc_auc_score``      -> :func:`roc_auc_score`
- （阈值方向命中，见 :func:`direction_accuracy`）

算法出处：scikit-learn（BSD-3-Clause License，Copyright (c) 2007-2024
The scikit-learn developers）。本模块仅复用其公开的算法定义，未复制其源码。

指标语义：
- Brier score / log-loss 是 proper scoring rule，衡量概率预测的校准 + 判别；
- ECE 衡量“预测概率与实际频率”的系统偏差（校准曲线）；
- ROC-AUC 衡量区分成功/失败案例的判别能力（不依赖阈值）；
- direction accuracy 是 0.5 阈值下的方向命中率，等价于当前引擎的 direction_score。
"""

from __future__ import annotations

import math


def _as_lists(y_true, p_pred) -> tuple[list[float], list[float]]:
    y = [1.0 if v else 0.0 for v in y_true]
    p = [float(v) for v in p_pred]
    if len(y) != len(p):
        raise ValueError("y_true 与 p_pred 长度必须一致")
    if not y:
        raise ValueError("空输入不能计算指标")
    return y, p


def brier_score(y_true, p_pred) -> float:
    """Brier 分数 = mean((p - y)^2)，越小越好（0 为完美）。

    对标 ``sklearn.metrics.brier_score_loss``。它是概率预测最基础的
    proper scoring rule，同时惩罚“方向错”与“过度自信”。
    """
    y, p = _as_lists(y_true, p_pred)
    return sum((pi - yi) ** 2 for yi, pi in zip(y, p)) / len(y)


def log_loss(y_true, p_pred, eps: float = 1e-15) -> float:
    """对数损失 = -(1/N) Σ [y·log p + (1-y)·log(1-p)]，越小越好。

    对标 ``sklearn.metrics.log_loss``。概率先裁剪到 [eps, 1-eps] 避免 log(0)。
    与 Brier 相比，log-loss 对“方向错且非常自信”的惩罚更重。
    """
    y, p = _as_lists(y_true, p_pred)
    total = 0.0
    for yi, pi in zip(y, p):
        pi = min(max(pi, eps), 1.0 - eps)
        total += yi * math.log(pi) + (1.0 - yi) * math.log(1.0 - pi)
    return -total / len(y)


def direction_accuracy(y_true, p_pred, threshold: float = 0.5) -> float:
    """0.5 阈值下的方向命中率 = mean((p >= threshold) == y)。

    这是当前引擎 ``direction_score`` 的等价定义，仅作为对照保留；
    概率校准质量应以 Brier / log-loss / ECE / AUC 为准。
    """
    y, p = _as_lists(y_true, p_pred)
    hits = sum(1 for yi, pi in zip(y, p) if (pi >= threshold) == bool(yi))
    return hits / len(y)


def expected_calibration_error(y_true, p_pred, n_bins: int = 5) -> float:
    """期望校准误差（ECE），越小越好。

    对标 ``sklearn.metrics.calibration_curve`` 的等宽分箱思路：
    把预测概率按 [0,1] 切成 n_bins 个等宽区间，每个区间内比较
    “平均预测概率”与“真实正例频率”之差，按样本量加权求和。

    只有 1 个样本时分箱退化为单箱，ECE 仍可计算；样本不足时
    应把该指标视为示意性而非统计显著。
    """
    y, p = _as_lists(y_true, p_pred)
    if n_bins < 1:
        raise ValueError("n_bins 必须 >= 1")
    bins: list[list[tuple[float, float]]] = [[] for _ in range(n_bins)]
    for yi, pi in zip(y, p):
        idx = min(n_bins - 1, int(pi * n_bins))
        bins[idx].append((yi, pi))
    ece = 0.0
    for group in bins:
        if not group:
            continue
        mean_pred = sum(pi for _, pi in group) / len(group)
        mean_true = sum(yi for yi, _ in group) / len(group)
        ece += (len(group) / len(y)) * abs(mean_pred - mean_true)
    return ece


def roc_auc_score(y_true, scores) -> float:
    """ROC 曲线下面积，等价于 Mann-Whitney U 统计量，越接近 1 越好。

    对标 ``sklearn.metrics.roc_auc_score``（无类别权重的二分类）。
    采用秩和法 + 平均秩处理并列分：AUC = (Σ正例平均秩 - n_pos(n_pos+1)/2)
    / (n_pos · n_neg)。要求至少一个正例和一个负例。

    判别能力指标：只衡量排序好坏，不依赖阈值，也不衡量校准。
    """
    y, s = _as_lists(y_true, scores)
    n_pos = int(sum(y))
    n_neg = len(y) - n_pos
    if n_pos == 0 or n_neg == 0:
        raise ValueError("roc_auc 需要至少一个正例和一个负例")

    order = sorted(range(len(y)), key=lambda i: (s[i], y[i]))
    ranks = [0.0] * len(y)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and s[order[j + 1]] == s[order[i]]:
            j += 1
        avg_rank = (i + 1 + j + 1) / 2.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1

    rank_sum_pos = sum(ranks[idx] for idx in range(len(y)) if y[idx] == 1.0)
    return (rank_sum_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)
