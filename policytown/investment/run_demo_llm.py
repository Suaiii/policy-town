"""LLM 版端到端演示：DeepSeek v4 Flash 驱动四专业 Agent + 企业 Agent。

与 run_demo.py（确定性 fallback）共用同一脚本与状态机，对比输出与终局评分。

  python3 -m policytown.investment.run_demo_llm

运行说明：
- 首次运行会逐轮调用模型（约 50 次），结果写入 .cache/llm_cache.json；
- 二次运行全部命中缓存（同 seed 同输入 → 输出一致，验收标准 7）；
- 断网/超时自动降级 fallback（confidence=0），演示不中断。
"""
from __future__ import annotations

import json
import os

from .agents.llm_client import make_llm_fn
from .core.orchestrator import Orchestrator
from .replay.replay import replay_historical
from .run_demo import PICK, PLAYER_SCRIPT, CID


def main() -> None:
    llm_fn = make_llm_fn(use_cache=True, progress=True)
    print("开始 LLM 推演（. 表示一次 Agent 调用）：")
    orch = Orchestrator(run_id="demo-llm-001", seed=42, llm_fn=llm_fn)
    orch.start(PICK, "S1")
    rounds = []
    for stage_id in ("S1", "S2", "S3", "S4"):
        view = orch.open_stage()
        out = orch.submit_decisions(PLAYER_SCRIPT[stage_id])
        out["_stage_label"] = view["stage"]["label"]
        rounds.append(out)
        print("[LLM %s] 结算完成，支出 %s / 预算剩 %s"
              % (stage_id, out["budget"]["spent"], out["budget"]["after"]),
              flush=True)
        if stage_id != "S4":
            orch.advance_stage()
    final = orch.finish()

    baseline = replay_historical(PICK, seed=42)["historical_replay"]

    demo = {"run_id": "demo-llm-001", "model": "opencode-go/deepseek-v4-flash",
            "seed": 42, "pick": PICK, "rounds": rounds, "final": final,
            "deterministic_baseline": baseline}
    path = os.path.join(os.path.dirname(__file__), "demo_run_llm.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(demo, f, ensure_ascii=False, indent=2)

    print("\n== 终局四评分（LLM 玩家世界线） ==")
    print(json.dumps(final["historical_replay"], ensure_ascii=False, indent=2))
    print("\n== 确定性基线（同输入，fallback 大脑） ==")
    print(json.dumps(baseline, ensure_ascii=False, indent=2))
    print("\n样例：企业 Agent 的自主动作与理由")
    for r in rounds:
        for a in r["company_actions"][:2]:
            print("  %s → %s（conf=%.2f）" % (a["company_id"], a["action"], a["confidence"]))
    print("\ndemo_run_llm.json 已写出：%s" % path)


if __name__ == "__main__":
    main()
