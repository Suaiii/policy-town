"""端到端演示：三企业（显示/半导体/光伏）× S1—S4，断网确定性运行。

  cd policytown/investment && python3 run_demo.py
产出 demo_run.json：每轮完整契约输出 + 图投影 + 终局四评分 + 历史 Replay 对照。
"""
from __future__ import annotations

import json
import os

from .core.orchestrator import Orchestrator
from .replay.replay import replay_historical

PICK = ["proto_a", "proto_d", "proto_b"]  # 显示 / 光伏 / 半导体
CID = {"proto_a": "company_a", "proto_d": "company_d", "proto_b": "company_b"}

# 玩家世界线：S1 重投显示、冷落光伏；S2 追加显示、半导体起步；S3 救光伏失败；S4 长期加注
PLAYER_SCRIPT = {
    "S1": [{"company_id": CID["proto_a"], "action": "invest", "capital_points": 40,
            "support_focus": "infrastructure"},
           {"company_id": CID["proto_a"], "action": "support", "capital_points": 10,
            "support_focus": "supply_chain"}],
    "S2": [{"company_id": CID["proto_a"], "action": "follow_on", "capital_points": 25,
            "support_focus": "supply_chain"},
           {"company_id": CID["proto_b"], "action": "invest", "capital_points": 35,
            "support_focus": "talent"}],
    "S3": [{"company_id": CID["proto_d"], "action": "restructure", "capital_points": 10,
            "support_focus": "financing"},
           {"company_id": CID["proto_b"], "action": "follow_on", "capital_points": 30,
            "support_focus": "financing"}],
    "S4": [{"company_id": CID["proto_b"], "action": "follow_on", "capital_points": 25,
            "support_focus": "supply_chain"},
           {"company_id": CID["proto_a"], "action": "support", "capital_points": 10,
            "support_focus": "talent"}],
}


def main() -> None:
    orch = Orchestrator(run_id="demo-001", seed=42)
    orch.start(PICK, "S1")
    rounds = []
    for stage_id in ("S1", "S2", "S3", "S4"):
        view = orch.open_stage()
        out = orch.submit_decisions(PLAYER_SCRIPT[stage_id])
        out["_stage_label"] = view["stage"]["label"]
        rounds.append(out)
        if stage_id != "S4":
            orch.advance_stage()
    final = orch.finish()

    historical = replay_historical(PICK, seed=42)

    demo = {"run_id": "demo-001", "seed": 42, "pick": PICK,
            "rounds": rounds, "final": final, "historical_replay_baseline": historical}
    path = os.path.join(os.path.dirname(__file__), "demo_run.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(demo, f, ensure_ascii=False, indent=2)

    print("== 玩家世界线 ==")
    for r in rounds:
        b = r["budget"]
        print("[%s %s] 预算 %s→%s（支出 %s，回收 %s）" % (
            r["stage_id"], r["_stage_label"], b["before"], b["after"], b["spent"], b["recovered"]))
        for c in r["companies"]:
            print("   %s(%s) 状态=%s 现金=%.1f 建设=%.0f 产能=%.0f 里程碑=%s" % (
                c["anon_label"], c["industry"], c["status"], c["cash_points"],
                c["metrics"]["construction_progress"], c["metrics"]["production_ramp"],
                c["milestones_done"]))
        msgs = [m["type"] for m in r["messages_new"]]
        if msgs:
            print("   收件箱新增：%s" % msgs)
    print("\n== 终局四评分（玩家世界线 vs 各原型校准目标） ==")
    print(json.dumps(final["historical_replay"], ensure_ascii=False, indent=2))
    print("\n== 历史 Replay 基线（真实决策序列重放） ==")
    print(json.dumps(historical["historical_replay"], ensure_ascii=False, indent=2))
    print("\ndemo_run.json 已写出：%s" % path)


if __name__ == "__main__":
    main()
