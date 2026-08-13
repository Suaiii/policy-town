"""投后随访与单线终局（文档 4.9 / 9.2 / P2.5）。

每阶段只随访承诺账中最重要的一项到期承诺：判定履约状态（确定性阈值）→
写回现实图谱 → 更新企业判断账 → 进入下一阶段 Context。
终局：故事性时间线（分歧/核验/承诺/随访/结果）+ 关键命题复盘（终局揭示 withheld 结论）。
"""
from __future__ import annotations

from typing import Dict, List, Optional

STATUS_LABELS = {"fulfilled": "已完成", "delayed": "延期", "breached": "未完成",
                 "insufficient_evidence": "证据不足"}
SIGNAL = {"fulfilled": 0.85, "delayed": 0.5, "insufficient_evidence": 0.45, "breached": 0.2}


def select_follow_up(ledger, stage_id: str):
    """最重要的到期承诺：按插入序取第一条（最早承诺优先）。"""
    due = ledger.due_in(stage_id)
    return due[0] if due else None


def resolve_follow_up(commitment, comp) -> dict:
    """企业承诺履约判定（确定性阈值）：产能/建设里程碑决定状态（文档 9.2）。"""
    ramp = comp.metrics.get("production_ramp", 0)
    construction = comp.metrics.get("construction_progress", 0)
    if ramp >= 50:
        status = "fulfilled"
    elif construction >= 60:
        status = "delayed"
    elif construction < 40:
        status = "breached"
    else:
        status = "insufficient_evidence"
    return {"commitment_id": commitment.commitment_id,
            "company_id": comp.company_id,
            "stage_id": commitment.due_stage,
            "promise": commitment.promise,
            "status": status,
            "status_label": STATUS_LABELS[status],
            "explanation": "%s：建设进度 %d / 产能爬坡 %d" % (
                STATUS_LABELS[status], construction, ramp),
            "evidence_ids": list(commitment.source_ids)}


def build_timeline(stage_records: Dict[str, dict], follow_ups: List[dict],
                   stages: Dict[str, dict]) -> List[dict]:
    """单线叙事（文档 4.9.1）：每阶段保留五个节点：分歧/核验/承诺/随访/结果。"""
    out = []
    for stage_id in ("S1", "S2", "S3", "S4"):
        rec = stage_records.get(stage_id)
        if not rec:
            continue
        out.append({
            "stage_id": stage_id,
            "window": stages[stage_id]["window"],
            "worried": rec.get("worries", []),
            "negotiated": rec.get("negotiation"),
            "committed": rec.get("committed", []),
            "followed_up": [f for f in follow_ups if f["stage_id"] == stage_id],
            "result": rec.get("result", {}),
        })
    return out
