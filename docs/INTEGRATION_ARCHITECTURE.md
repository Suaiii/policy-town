# Policy Town 主体集成架构

## 唯一主线

系统只服务“政策发布前压力测试”：政策草案进入，三方 Agent 给出有理由的策略，规则引擎结算人数，检测器机械识别风险，最终产出可复核报告。

```text
政策草案 → PolicyParser
         → GovernmentAgents（四部门提案 + 联席会）
         → FirmAgents（A/B/C/D）
         → WorkerAgents（10 个 cohort 代表）
         → SocialEngine
         → MarketEngine（人数与流量）
         → MetricsEngine
         → Snapshot v1.2
         → Detectors → PolicyReport
```

## 队友对接边界

- Agent 队友：实现 `policytown/ports.py` 中对应 Protocol，只输出结构化决策，不计算城市总人数。
- 规则引擎队友：实现 `SocialEngine`、`MarketEngine`、`MetricsEngine`，同一 seed 下必须可复现。
- 数据队友：每个方案写入 `data/run_<scenario>/round_1..8.json`，每份必须通过 `Snapshot` 校验。
- 前端队友：只消费 `Snapshot v1.2` 或 `policyFeed.ts`，不依赖运行时后端。
- 报告队友：消费 `PolicyReport`；建议只能来自 `detectors.py` 的检测器映射。

## 场景注册

所有方案只在 `scenarios/manifest.json` 注册。`base` 是常驻参考线；尚无快照的方案标为 `planned`，不得伪装成可运行方案。

## 稳定接口

1. 外部输入：`RunRequest`。
2. 推演输出：8 个 `Snapshot v1.2`。
3. 风险输出：`RiskFinding[]`。
4. 最终交付：`PolicyReport`。
5. 运行追踪：`StageRecord[]`，后续可接日志、进度 UI 或审计页。

## 本地联调

```bash
python -m policytown validate
python -m policytown run draft --rounds 2
python -m policytown report draft
python -m unittest tests.test_kernel -v
python -m policytown firm-reality --output-dir data/run_firm_A_narrow
```

## M 企业真实性纵切

`FirmRealityOrchestrator` 是匿名企业 A 的单一入口：先校验公开案例证据包，再通过 `FirmDecisionGateway` 限制 Agent 仅输出方向意图，随后由 `RuleLedger` 运行 A0–A3 对照，更新六项企业信念，执行真实性检测器，最后生成面向评委的报告与 harness 结果。该纵切不修改冻结的 Snapshot 契约，也不要求前端接入运行时后端。

当前 `replay` 模式是所有队友共用的集成基线。任何真实 Agent 或规则模块未完成时，系统仍能用冻结快照走完整接口；模块完成后替换对应端口，不修改消费者。

真实模块组装时创建 `ProviderBundle`，依次注入环境、政府、企业、个人、社交、市场、指标和 cohort 对账实现，再以 `RunRequest(mode="live")` 运行。编排器固定执行九阶段时序并生成 `StageRecord`，队友之间不互相直接 import。

## 不允许跨越的边界

- LLM 不直接生成 Metrics 或宏观 Flow 数量。
- 前端不直接读取 Agent 私有结构。
- 检测器不调用 LLM 现编建议。
- 具体 Provider 不写入核心模型。
- Convex/Clerk 不成为离线演示依赖。
