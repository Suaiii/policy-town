"""判断账（企业级动态记忆）— 文档 5.4.2。

只保留四类会直接改变企业决策的判断：市场、融资、技术项目、政府履约。
更新规则 bounded_evidence_blend_v1：新证据与旧信念加权混合，单次最多修正一半差距，
防止信念突变；每次变化都要保留触发证据与更新阶段。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

_UPDATE_RULE = "bounded_evidence_blend_v1"
BELIEF_KEYS = ("market_recovery", "financing_continuity",
               "tech_execution", "government_fulfillment")


@dataclass
class BeliefEntry:
    belief_id: str
    value: float
    confidence: float
    evidence_ids: List[str] = field(default_factory=list)
    updated_at: str = ""
    update_rule: str = _UPDATE_RULE

    def to_dict(self) -> dict:
        return {"belief_id": self.belief_id, "value": round(self.value, 2),
                "confidence": round(self.confidence, 2),
                "evidence_ids": list(self.evidence_ids),
                "updated_at": self.updated_at, "update_rule": self.update_rule}


class BeliefLedger:
    def __init__(self) -> None:
        self.entries: Dict[str, BeliefEntry] = {}

    def init_defaults(self, values: Dict[str, float]) -> None:
        for k, v in values.items():
            self.entries.setdefault(k, BeliefEntry(belief_id=k, value=v, confidence=0.5))

    def update(self, belief_id: str, signal: float, signal_weight: float,
               stage_id: str, evidence_ids: List[str]) -> BeliefEntry:
        """bounded_evidence_blend_v1：
        w = clamp(0.05, 0.5, signal_weight)；new = clamp(0,1, old*(1-w) + signal*w)。
        置信度随证据强度温和上升；证据去重追加。
        """
        e = self.entries.setdefault(
            belief_id, BeliefEntry(belief_id=belief_id, value=0.5, confidence=0.3))
        w = min(0.5, max(0.05, signal_weight))
        blended = e.value * (1 - w) + signal * w
        e.value = max(0.0, min(1.0, blended))
        e.confidence = min(1.0, e.confidence + w * 0.2)
        e.evidence_ids = list(dict.fromkeys(e.evidence_ids + list(evidence_ids)))
        e.updated_at = stage_id
        return e

    def get(self, belief_id: str) -> BeliefEntry:
        return self.entries[belief_id]

    def to_dict(self) -> List[dict]:
        return [e.to_dict() for e in self.entries.values()]


def make_default_beliefs(risk_preference: float) -> Dict[str, float]:
    """风险偏好决定初始信念：越保守（risk→0）→ 初始判断越谨慎（base→0.4）；
    越激进（risk→1）→ 初始判断越乐观（base→0.6）。"""
    base = round(0.5 + (risk_preference - 0.5) * 0.2, 3)
    return {k: base for k in BELIEF_KEYS}
