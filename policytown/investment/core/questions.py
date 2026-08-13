"""核验问题卡生成（文档 4.6 / P1.5）。

卡片来源（按优先级）：
1. 核心案例关键未穿透项（enterprise_agents.json key_proposition.verification_questions）；
2. 部门备忘录 missing_info severity=high 的兜底问题（非核心案例/额外缺口）。
纯确定性：同 memoranda + enterprises → 同卡片序列。每企业每轮最多 2 张。
"""
from __future__ import annotations

from typing import Dict, List

_MAX_PER_COMPANY = 2
_CARD_SOURCES = ("key_proposition", "department_gap")

_REQUIRED_CARD = ["card_id", "company_id", "question", "targets", "source"]


def build_question_cards(memoranda: List[dict], enterprises: Dict[str, dict],
                         stage_id: str = "S1") -> List[dict]:
    """为每家企业生成核验问题卡：关键命题问题优先，缺失信息问题兜底。"""
    cards: List[dict] = []
    seq = 0
    by_company: Dict[str, List[dict]] = {}
    for m in memoranda:
        cid = m.get("company_id")
        if cid:
            by_company.setdefault(cid, []).append(m)
    for cid in sorted(by_company):
        proto_id = "proto_%s" % cid.split("_")[-1]
        ent = enterprises.get(proto_id) or {}
        kp = ent.get("key_proposition") or {}
        for q in kp.get("verification_questions", []):
            if len([c for c in cards if c["company_id"] == cid]) >= _MAX_PER_COMPANY:
                break
            seq += 1
            cards.append({
                "card_id": "CARD-%s-%02d" % (stage_id, seq),
                "company_id": cid,
                "question": q["question"],
                "targets": list(q.get("targets", [])),
                "source": "key_proposition",
                "proposition_id": kp.get("proposition_id", ""),
            })
        if len([c for c in cards if c["company_id"] == cid]) >= _MAX_PER_COMPANY:
            continue
        for m in by_company[cid]:
            for mi in m.get("missing_info", []):
                if mi.get("severity") != "high":
                    continue
                if len([c for c in cards if c["company_id"] == cid]) >= _MAX_PER_COMPANY:
                    break
                seq += 1
                cards.append({
                    "card_id": "CARD-%s-%02d" % (stage_id, seq),
                    "company_id": cid,
                    "question": "请说明「%s」的核实情况与影响评估（部门关注）。"
                                % mi["description"],
                    "targets": [],
                    "source": "department_gap",
                    "department": m["agent"],
                })
    return cards


def validate_question_card(card: dict) -> None:
    missing = [k for k in _REQUIRED_CARD if k not in card]
    if missing:
        raise ValueError("question card missing keys: %s" % missing)
    if card.get("source") not in _CARD_SOURCES:
        raise ValueError("invalid card source: %r" % card.get("source"))
    if not card.get("question", "").strip():
        raise ValueError("card without question")
