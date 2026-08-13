"""企业 Agent Memory：一图两账（文档 5.4）。

- 现实图谱（fact_graph.py）：场景级共享只读，挂 WorldState
- 判断账（belief_ledger.py）：企业级动态信念
- 承诺账（commitment_ledger.py）：政企共同账目

企业身份、管理层目标、扩张惯性与风险偏好属于固定"决策底色"（enterprise_agents.json
的 decision_baseline），不属于 Memory。
"""
from __future__ import annotations

from .fact_graph import FactGraph, FactRecord
from .belief_ledger import BeliefEntry, BeliefLedger, make_default_beliefs
from .commitment_ledger import CommitmentLedger, CommitmentRecord, STATUSES

__all__ = ["FactGraph", "FactRecord", "BeliefEntry", "BeliefLedger",
           "make_default_beliefs", "CommitmentLedger", "CommitmentRecord",
           "STATUSES", "EnterpriseMemory"]


class EnterpriseMemory:
    """单局企业记忆容器（每个 run_id 独立，互不污染，文档 5.4.4）。"""

    def __init__(self, risk_preference: float = 0.5) -> None:
        self.beliefs = BeliefLedger()
        self.beliefs.init_defaults(make_default_beliefs(risk_preference))
        self.commitments = CommitmentLedger()

    def to_dict(self) -> dict:
        return {"beliefs": self.beliefs.to_dict(),
                "commitments": self.commitments.to_dict()}
