"""承诺账（政企共同账目）— 文档 5.4.3。

记录政府承诺的投入/配套/融资协调、企业承诺的出资/建设/技术/订单里程碑、
下一笔资金触发条件、违约/暂停追加/退出条款与当前履约状态。
必须机器可读：规则引擎与投后随访（P2.5）将直接读取本账目。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

STATUSES = ("pending", "fulfilled", "delayed", "breached", "insufficient_evidence")


@dataclass
class CommitmentRecord:
    commitment_id: str
    party: str            # company_a | government
    promise: str
    due_stage: str
    condition: str
    status: str = "pending"
    source_ids: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"commitment_id": self.commitment_id, "party": self.party,
                "promise": self.promise, "due_stage": self.due_stage,
                "condition": self.condition, "status": self.status,
                "source_ids": list(self.source_ids)}


class CommitmentLedger:
    def __init__(self) -> None:
        self.records: List[CommitmentRecord] = []

    def add(self, rec: CommitmentRecord) -> None:
        self.records.append(rec)

    def due_in(self, stage_id: str) -> List[CommitmentRecord]:
        """该阶段到期且仍未履约的承诺（随访与触发下一笔投资的输入）。"""
        return [r for r in self.records if r.due_stage == stage_id and r.status == "pending"]

    def mark(self, commitment_id: str, status: str) -> None:
        if status not in STATUSES:
            raise ValueError("invalid commitment status: %r" % status)
        for r in self.records:
            if r.commitment_id == commitment_id:
                r.status = status
                return
        raise KeyError(commitment_id)

    def to_dict(self) -> List[dict]:
        return [r.to_dict() for r in self.records]
