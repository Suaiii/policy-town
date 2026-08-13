"""政企协商端到端演示（P1.5 + P2）：问题卡 → 核验 → 联席方案 → 条件单 → 反提案 → 确认 → 结算。

  python3 -m policytown.investment.run_demo_negotiation

产出 demo_negotiation.json：每轮协商轨迹 + 结算 + 终局评分。
"""
from __future__ import annotations

import json
import os

from .core.orchestrator import Orchestrator

PICK = ["proto_a", "proto_d", "proto_b"]


def main() -> None:
    orch = Orchestrator(run_id="demo-neg-001", seed=42)
    orch.start(PICK, "S1")
    rounds = []
    for stage_id in ("S1", "S2", "S3", "S4"):
        view = orch.open_stage()
        cards = view["question_cards"]
        verification = None
        if cards:
            verification = orch.request_verification(cards[0]["card_id"])["verification_response"]
        plan_id = view["meeting_minutes"]["proposals"][0]["proposal_id"]
        sheets = orch.apply_plan(plan_id, {"company_a": 25.0, "company_d": 15.0,
                                           "company_b": 20.0})
        sheets = [s for s in sheets if s["company_id"] in {"company_a", "company_d", "company_b"}]
        orch.submit_conditions(sheets)
        confirmations = {s["company_id"]: {"action": "accept"} for s in sheets}
        out = orch.finalize_negotiation(confirmations)
        out["_stage_label"] = view["stage"]["label"]
        out["_verification"] = verification
        rounds.append(out)
        print("[%s %s] 支出 %s / 剩 %s | 核验: %s | 承诺: %d 条"
              % (stage_id, view["stage"]["label"], out["budget"]["spent"],
                 out["budget"]["after"],
                 verification["response_type"] if verification else "无",
                 len(orch._state().government_commitments.records)))
        if stage_id != "S4":
            orch.advance_stage()
    final = orch.finish()
    demo = {"run_id": "demo-neg-001", "seed": 42, "pick": PICK,
            "rounds": rounds, "final": final}
    path = os.path.join(os.path.dirname(__file__), "demo_negotiation.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(demo, f, ensure_ascii=False, indent=2, default=str)
    print("== 终局四评分 ==")
    print(json.dumps(final["historical_replay"], ensure_ascii=False, indent=2))
    print("demo_negotiation.json 已写出：%s" % path)


if __name__ == "__main__":
    main()
