"""现实图谱（场景级共享、只读）— 文档 5.4.1。

记录"这个世界里什么事实成立"：subject / predicate / value / effective_at /
available_at / visibility / source_ids。对 Agent 只读：运行时无写接口暴露给 Agent。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class FactRecord:
    fact_id: str
    subject: str
    predicate: str
    value: str
    effective_at: str
    available_at: str
    visibility: str = "public"   # public | private | withheld
    source_ids: List[str] = field(default_factory=list)

    def visible_at(self, cutoff: str, viewer: str = "public") -> bool:
        if self.visibility == "withheld":
            return False
        if self.visibility == "private" and viewer == "public":
            return False
        return self.available_at <= cutoff


class FactGraph:
    def __init__(self) -> None:
        self.records: List[FactRecord] = []

    def add(self, rec: FactRecord) -> None:
        self.records.append(rec)

    def visible(self, cutoff: str, viewer: str = "public") -> List[FactRecord]:
        return [r for r in self.records if r.visible_at(cutoff, viewer)]

    def to_dict(self, cutoff: str, viewer: str = "public") -> List[dict]:
        return [{"fact_id": r.fact_id, "subject": r.subject, "predicate": r.predicate,
                 "value": r.value, "effective_at": r.effective_at,
                 "available_at": r.available_at, "visibility": r.visibility,
                 "source_ids": list(r.source_ids)}
                for r in self.visible(cutoff, viewer)]
