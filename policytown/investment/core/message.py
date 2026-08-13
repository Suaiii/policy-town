"""统一消息协议 + 收件箱。

三条通道：
- company_to_government：企业主动沟通（跨回合桥梁，结算末产生 → 下轮 Context 消费）
- government_to_company：玩家五动作（编排器翻译给引擎，不必入箱）
- 企业↔企业不直接通信：竞争走共享池零和结算（engine.settle 步骤 a）
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import List

COMPANY_MSG_TYPES = ("capital_request", "distress_call", "progress_report",
                     "threat", "counter_proposal", "info_disclosure")
GOV_ACTIONS = ("invest", "support", "follow_on", "restructure", "exit")


@dataclass
class Message:
    channel: str          # company_to_government | government_to_company
    sender: str
    to: str
    type: str
    urgency: float
    state_evidence: List[str]
    content: str
    created_stage: str
    expires_after_stages: int = 2
    message_id: str = ""
    _stage_seq: int = 0   # 内部排序用，不进契约

    def __post_init__(self) -> None:
        if not self.message_id:
            self.message_id = "msg-%s-%s-%s" % (self.created_stage, self.sender, self.type)

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("_stage_seq", None)
        d["from"] = d.pop("sender")
        return d


class Inbox:
    """消息队列：按阶段过期。只增不删，活跃视图由 active() 给出。"""

    def __init__(self) -> None:
        self._messages: List[Message] = []
        self._stage_order: List[str] = []

    def register_stage(self, stage_id: str) -> None:
        if stage_id not in self._stage_order:
            self._stage_order.append(stage_id)

    def add(self, msg: Message) -> None:
        self.register_stage(msg.created_stage)
        msg._stage_seq = self._stage_order.index(msg.created_stage)
        self._messages.append(msg)

    def active(self, current_stage: str) -> List[Message]:
        self.register_stage(current_stage)
        cur = self._stage_order.index(current_stage)
        return [m for m in self._messages
                if m.channel == "company_to_government"
                and cur - m._stage_seq < m.expires_after_stages]

    def all(self) -> List[Message]:
        return list(self._messages)

    def to_list(self, current_stage: str) -> List[dict]:
        return [m.to_dict() for m in self.active(current_stage)]
