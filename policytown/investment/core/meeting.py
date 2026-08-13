"""部门通信编排 — 冲突识别 / 定向质询 / 立场修订 / 会议纪要（文档 4.5 / 5.5）。

纯确定性：同 memoranda 输入 → 同冲突、同质询、同纪要。LLM 只负责质询回应
（agents.professional.ChallengeResponderAgent），超时/断网回退 deterministic.challenge_response。
不改任何数值；产出只进视图与纪要。规则引擎仍按玩家采纳的条件结算（P2 接入）。
"""
from __future__ import annotations

from typing import Dict, List, Optional

REC_LADDER = {"support": 0, "conditional_support": 1, "hold": 2, "oppose": 3}
_KIND_RANK = {"recommendation_gap": 3, "missing_info_high": 2, "redline_vs_condition": 1}
_DEPTS = ("fiscal", "economy", "sci_tech", "development")
_ROLE_NAMES = {"fiscal": "财政部门", "economy": "经信部门",
               "sci_tech": "科技部门", "development": "发改部门"}
_MAX_PER_COMPANY = 2
MAX_PER_STAGE = 6
_RECO_BANDS = ((55, "support"), (40, "conditional_support"), (30, "hold"))

_REQUIRED_CHALLENGE = ["conflict_id", "challenge_id", "stage_id", "company_id",
                       "kind", "from", "to", "from_ref", "to_ref", "severity",
                       "question", "evidence_ids", "status"]
_CHALLENGE_KINDS = ("recommendation_gap", "missing_info_high", "redline_vs_condition")
_SEVERITIES = ("high", "medium", "low")


def find_memorandum(memoranda: List[dict], agent: str,
                    company_id: Optional[str] = None) -> Optional[dict]:
    """按部门与企业取备忘录；财政全局一份，匹配任何企业。"""
    for m in memoranda:
        if m.get("agent") != agent:
            continue
        if agent == "fiscal":
            return m
        if m.get("company_id") == company_id:
            return m
    return None


def _grouped(memoranda: List[dict]) -> Dict[str, List[dict]]:
    """按企业分组；财政全局备忘录并入每组（每组 = 3 部门 + 财政）。"""
    groups: Dict[str, List[dict]] = {}
    fiscal = [m for m in memoranda if m.get("agent") == "fiscal"]
    for m in memoranda:
        cid = m.get("company_id")
        if cid is None:
            continue
        groups.setdefault(cid, []).append(m)
    for memos in groups.values():
        memos.extend(fiscal)
    return groups


def _ref(obj: dict, kind: str, text: str) -> dict:
    return {"ref_id": obj.get("claim_id") or obj.get("redline_id") or obj.get("condition_id")
            or obj.get("info_id") or "?",
            "kind": kind, "text": text, "evidence_ids": list(obj.get("evidence_ids", []))}


def _claim_ref(memo: dict, claim_type: str) -> dict:
    for claim in memo.get("core_claims", []):
        if claim.get("claim_type") == claim_type and claim.get("statement"):
            return _ref(claim, "claim", claim["statement"])
    if memo.get("core_claims"):
        c = memo["core_claims"][0]
        return _ref(c, "claim", c["statement"])
    return {"ref_id": "?", "kind": "claim", "text": memo.get("reasoning_summary", ""),
            "evidence_ids": []}


def _conflict_rules(a: dict, b: dict, cid: str) -> Optional[dict]:
    """按优先级返回该对部门的第一类冲突，无冲突返回 None。"""
    ra, rb = REC_LADDER[a["recommendation"]], REC_LADDER[b["recommendation"]]

    # 规则 1：建议分歧 ≥2 档（support/conditional_support/hold/oppose）
    if abs(ra - rb) >= 2:
        neg, pos = (a, b) if ra > rb else (b, a)
        return {
            "stage_id": "", "company_id": cid, "kind": "recommendation_gap",
            "from": neg["agent"], "to": pos["agent"],
            "from_ref": _claim_ref(neg, "risk"),
            "to_ref": _claim_ref(pos, "positive"),
            "severity": "high",
            "question": "你（%s）建议%s，而%s建议%s。请引用证据说明你支持的判断依据，"
                        "并回应对方主张。"
                        % (_ROLE_NAMES[pos["agent"]], pos["recommendation"],
                           _ROLE_NAMES[neg["agent"]], neg["recommendation"]),
            "evidence_ids": [e for e in pos.get("evidence_ids", [])][:3],
        }

    # 规则 2：存在 high 级缺失信息却仍建议支持
    high = [m for m in (a, b)
            if any(mi.get("severity") == "high" for mi in m.get("missing_info", []))]
    if high and high[0]["recommendation"] in ("support", "conditional_support"):
        h = high[0]
        o = b if h is a else a
        if REC_LADDER[o["recommendation"]] > REC_LADDER[h["recommendation"]]:
            desc = next((mi["description"] for mi in h.get("missing_info", [])
                         if mi["severity"] == "high"), "?")
            return {
                "stage_id": "", "company_id": cid, "kind": "missing_info_high",
                "from": o["agent"], "to": h["agent"],
                "from_ref": _claim_ref(o, "risk"),
                "to_ref": _claim_ref(h, "positive"),
                "severity": "medium",
                "question": "你（%s）存在 high 级缺失信息（%s）却建议%s。"
                            "请说明在缺失情况下仍支持的理由，或调整建议。"
                            % (_ROLE_NAMES[h["agent"]], desc, h["recommendation"]),
                "evidence_ids": [],
            }

    # 规则 3：一方红线与另一方可接受条件冲突（关键词：追加）
    holder = next((m for m in (a, b)
                   if any("追加" in rl.get("condition", "") for rl in m.get("red_lines", []))),
                  None)
    if holder is not None:
        other = b if holder is a else a
        conds = [c for c in other.get("acceptable_conditions", [])
                 if "追加" in c.get("condition", "")]
        if conds and other["recommendation"] in ("support", "conditional_support"):
            rl = next(r for r in holder.get("red_lines", []) if "追加" in r.get("condition", ""))
            return {
                "stage_id": "", "company_id": cid, "kind": "redline_vs_condition",
                "from": holder["agent"], "to": other["agent"],
                "from_ref": _ref(rl, "red_line", rl["condition"]),
                "to_ref": _ref(conds[0], "condition", conds[0]["condition"]),
                "severity": "low",
                "question": "你（%s）的条件“%s”与%s的红线“%s”冲突。"
                            "请说明追加承诺如何与财政暴露上限协调。"
                            % (_ROLE_NAMES[other["agent"]], conds[0]["condition"],
                               _ROLE_NAMES[holder["agent"]], rl["condition"]),
                "evidence_ids": [],
            }
    return None


def detect_conflicts(memoranda: List[dict], stage_id: str = "S1") -> List[dict]:
    """识别真实分歧：每对部门最高优先级一条；每企业最多 _MAX_PER_COMPANY 条。"""
    conflicts: List[dict] = []
    seq = 0
    for cid, memos in _grouped(memoranda).items():
        candidates: List[dict] = []
        seen_pairs = set()
        for i, a in enumerate(memos):
            for b in memos[i + 1:]:
                pair = frozenset((a["agent"], b["agent"]))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                conf = _conflict_rules(a, b, cid)
                if conf is not None:
                    candidates.append(conf)
        candidates.sort(key=lambda c: -_KIND_RANK[c["kind"]])
        for conf in candidates[:_MAX_PER_COMPANY]:
            seq += 1
            conf["stage_id"] = stage_id
            conf["conflict_id"] = "CF-%s-%02d" % (stage_id, seq)
            conflicts.append(conf)
    return conflicts[:MAX_PER_STAGE]


def validate_challenge(ch: dict) -> None:
    missing = [k for k in _REQUIRED_CHALLENGE if k not in ch]
    if missing:
        raise ValueError("challenge missing keys: %s" % missing)
    if ch.get("kind") not in _CHALLENGE_KINDS:
        raise ValueError("invalid challenge kind: %r" % ch.get("kind"))
    if ch.get("from") not in _DEPTS or ch.get("to") not in _DEPTS:
        raise ValueError("invalid challenge party: from=%r to=%r" % (ch.get("from"), ch.get("to")))
    if ch.get("severity") not in _SEVERITIES:
        raise ValueError("invalid severity: %r" % ch.get("severity"))
    if not ch.get("question", "").strip():
        raise ValueError("challenge without question")
    if ch.get("status") not in ("pending", "answered"):
        raise ValueError("invalid status: %r" % ch.get("status"))


def build_challenges(conflicts: List[dict], stage_id: str = "S1") -> List[dict]:
    """每条冲突 → 一次定向质询（一轮，不追问不闲聊）。冲突已带 stage_id，不得覆盖。"""
    out = []
    for i, c in enumerate(conflicts, 1):
        ch = dict(c)
        ch["challenge_id"] = "CH-%s-%02d" % (stage_id, i)
        ch["status"] = "pending"
        out.append(ch)
    return out


_REQUIRED_RESPONSE = ["response_id", "challenge_id", "stage_id", "from", "to",
                      "response_type", "statement", "evidence_ids", "confidence"]
_RESPONSE_TYPES = ("maintain", "soften", "change", "concede_insufficient")


def validate_challenge_response(out: dict) -> None:
    missing = [k for k in _REQUIRED_RESPONSE if k not in out]
    if missing:
        raise ValueError("challenge response missing keys: %s" % missing)
    if out.get("response_type") not in _RESPONSE_TYPES:
        raise ValueError("invalid response_type: %r" % out.get("response_type"))
    if not out.get("statement", "").strip():
        raise ValueError("response without statement")
    if out.get("from") not in _DEPTS or out.get("to") not in _DEPTS:
        raise ValueError("invalid response party: from=%r to=%r" % (out.get("from"), out.get("to")))


def _reco_by_score(score: float) -> str:
    for band, reco in _RECO_BANDS:
        if score >= band:
            return reco
    return "oppose"


_REQUIRED_REVISION = ["revision_id", "stage_id", "agent", "company_id",
                      "trigger_challenge_id", "trigger_evidence_ids",
                      "before", "after", "reason"]


def position_revision(challenge: dict, memo: dict, challenger_memo: dict,
                      response: dict) -> Optional[dict]:
    """立场变化留痕：maintain → None；soften/change/concede → 记录变化前后与触发证据。"""
    rtype = response["response_type"]
    if rtype == "maintain":
        return None
    before = {"recommendation": memo["recommendation"], "score": memo["score"],
              "red_lines": [dict(r) for r in memo.get("red_lines", [])],
              "acceptable_conditions": [dict(c) for c in memo.get("acceptable_conditions", [])]}
    delta = {"soften": -12, "change": -25, "concede_insufficient": -30}[rtype]
    score = round(max(0.0, memo["score"] + delta), 1)
    reco = "hold" if rtype == "concede_insufficient" else _reco_by_score(score)
    conds = [dict(c) for c in before["acceptable_conditions"]]
    extra = next(iter(challenger_memo.get("acceptable_conditions", [])), None)
    if extra and extra["condition"] not in {c["condition"] for c in conds} and len(conds) < 4:
        conds.append(dict(extra))
    return {
        "revision_id": "REV-%s" % response["challenge_id"].replace("CH-", ""),
        "stage_id": challenge.get("stage_id", ""),
        "agent": memo["agent"],
        "company_id": memo.get("company_id"),
        "trigger_challenge_id": challenge["challenge_id"],
        "trigger_evidence_ids": [e for e in
                                 challenge.get("evidence_ids", []) + response.get("evidence_ids", [])],
        "before": before,
        "after": {"recommendation": reco, "score": score,
                  "red_lines": before["red_lines"],
                  "acceptable_conditions": conds},
        "reason": "%s：%s" % (rtype, response["statement"]),
    }


def validate_position_revision(rev: dict) -> None:
    missing = [k for k in _REQUIRED_REVISION if k not in rev]
    if missing:
        raise ValueError("position revision missing keys: %s" % missing)
    if rev.get("agent") not in _DEPTS:
        raise ValueError("invalid revision agent: %r" % rev.get("agent"))
    for side in ("before", "after"):
        for k in ("recommendation", "score"):
            if k not in rev.get(side, {}):
                raise ValueError("revision %s missing key: %s" % (side, k))


# ---------- P1 Task 2：定向质询构建 + 立场修订（另一会话已实现） ----------
def _shared_evidence(memoranda: List[dict]) -> List[str]:
    """在任一组内被 ≥3 个部门引用的证据视为共享证据。"""
    counts: Dict[str, int] = {}
    for memos in _grouped(memoranda).values():
        for m in memos:
            for eid in set(m.get("evidence_ids", [])):
                counts[eid] = counts.get(eid, 0) + 1
    return sorted(eid for eid, n in counts.items() if n >= 3)


def _majority(memos: List[dict]) -> str:
    """组内建议的中位档（保守方向）作为多数意见。"""
    ladder = sorted(REC_LADDER[m["recommendation"]] for m in memos)
    med = ladder[len(ladder) // 2]
    return _reco_by_score({0: 99, 1: 50, 2: 35, 3: 20}[med])


def _dedup_conditions(items: List[dict]) -> List[dict]:
    seen = set()
    out = []
    for it in items:
        key = (it["condition"], it["company_id"])
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def _build_proposals(memoranda: List[dict]) -> List[dict]:
    support, cautious = [], []
    for cid, memos in _grouped(memoranda).items():
        for m in memos:
            if m["recommendation"] in ("support", "conditional_support"):
                for c in m.get("acceptable_conditions", []):
                    support.append({"condition": c["condition"], "reason": c["reason"],
                                    "proposing_department": m["agent"], "company_id": cid})
            else:
                for rl in m.get("red_lines", []):
                    cautious.append({"condition": rl["condition"], "reason": rl["reason"],
                                     "proposing_department": m["agent"], "company_id": cid})
    return [
        {"proposal_id": "PLAN-A", "title": "进取支持方案",
         "basis": "支持与有条件支持部门的合并条件",
         "conditions": _dedup_conditions(support)},
        {"proposal_id": "PLAN-B", "title": "审慎风控方案",
         "basis": "反对/暂缓部门红线转化及财政暴露上限",
         "conditions": _dedup_conditions(cautious)},
    ]


def make_minutes(memoranda: List[dict], challenges: List[dict], responses: List[dict],
                 revisions: List[dict], stage_id: str = "S1") -> dict:
    """联席会议纪要：共识 / 未解决分歧 / ≥2 方案 / 少数意见 / 待调查问题。"""
    resp_by_ch = {r["challenge_id"]: r for r in responses}
    disagreements = []
    for ch in challenges:
        r = resp_by_ch.get(ch["challenge_id"])
        rtype = r["response_type"] if r else "pending"
        disagreements.append({
            "conflict_id": ch["conflict_id"], "kind": ch["kind"],
            "from": ch["from"], "to": ch["to"], "company_id": ch["company_id"],
            "question": ch["question"],
            "response_type": rtype,
            "resolved": rtype in ("change", "concede_insufficient"),
            "summary": r["statement"] if r else "未回应",
        })
    per_company = _grouped(memoranda)
    consensus = {
        "shared_evidence_ids": _shared_evidence(memoranda),
        "majority_by_company": {cid: _majority(memos) for cid, memos in per_company.items()},
    }
    minority = []
    for cid, memos in per_company.items():
        maj = consensus["majority_by_company"][cid]
        for m in memos:
            if m["recommendation"] != maj:
                minority.append({"company_id": cid, "agent": m["agent"],
                                 "recommendation": m["recommendation"],
                                 "reasoning_summary": m.get("reasoning_summary", "")})
    open_questions = [
        {"challenge_id": ch["challenge_id"], "from": ch["from"], "to": ch["to"],
         "company_id": ch["company_id"], "question": ch["question"]}
        for ch in challenges
        if resp_by_ch.get(ch["challenge_id"], {}).get("response_type") in ("maintain", "soften", None)
    ]
    return {
        "stage_id": stage_id,
        "consensus": consensus,
        "disagreements": disagreements,
        "proposals": _build_proposals(memoranda),
        "minority_opinions": minority,
        "open_questions": open_questions,
        "revision_count": len(revisions),
    }


_REQUIRED_MINUTES = ["stage_id", "consensus", "disagreements", "proposals",
                     "minority_opinions", "open_questions", "revision_count"]


def validate_minutes(minutes: dict) -> None:
    missing = [k for k in _REQUIRED_MINUTES if k not in minutes]
    if missing:
        raise ValueError("minutes missing keys: %s" % missing)
    if len(minutes.get("proposals", [])) < 2:
        raise ValueError("minutes must contain at least 2 proposals")
    for p in minutes.get("proposals", []):
        if not p.get("proposal_id") or not p.get("title"):
            raise ValueError("proposal missing id/title")
        for c in p.get("conditions", []):
            if not c.get("proposing_department"):
                raise ValueError("proposal condition without proposing_department")
