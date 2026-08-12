# M 技术与架构主线任务书

## 目标

把公开案例中可验证的机制转换成匿名企业 A 的规则、证据链和检查器。企业 Agent 仅输出方向性意图，RuleLedger 独占人数结算权。

## 架构边界

- `data/real_world` 只存公开事实、机制与未知项；未知项不得由模型补齐。
- `FirmIntent` 是企业 Agent 唯一输出结构，不含任何人数结果。
- `RuleLedger` 根据场景假设、岗位容量、技能匹配、迁移接受度和政策工具结算人数。
- `DecisionTrace` 将企业状态、意图、政策工具、规则结果和限制装入同一条可回放链。
- `reality_detectors` 仅机械识别内部转岗失败、工具与病因错配、对照顺序异常。

## 本轮任务与验收

| ID | 任务 | 验收条件 |
|---|---|---|
| M1 | 登记公开事实与未知项 | 五个 YAML 文件齐全；人数未知项明确禁止补齐 |
| M2 | 冻结匿名企业 A 状态 | 数字统一标记为 `scenario_assumption` |
| M3 | 分离 Agent 意图与规则结算 | `FirmIntent` 不含人数，`RuleLedger` 结算守恒 |
| M4 | 建立 A0–A3 对照 | 净失业随工具增加不升高，A3 优于 A0 |
| M5 | 建立真实性检查器 | 必须检出转岗失败和工具错配；不得出现对照顺序异常 |
| M6 | 形成回放产物 | 输出 comparison 与 harness-result JSON |
| M7 | 四轮企业轨迹与信念更新 | 六项信念可审计，政策工具只改变边界参数而不改写战略目标 |
| M8 | 统一入口与报告 | 一个 orchestrator 输出对照、轨迹、报告与 harness；报告包含数据源、指标、基线、目的、解释和限制 |

## Harness

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
python scripts/run_m_harness.py
python -m policytown validate
python -m policytown firm-reality --output-dir data/run_firm_A_narrow
```

`scripts/run_m_harness.py` 返回非零即表示 M 主线不通过。通过仅仅说明机制级对照自洽，并不表示复原或预测任何真实企业人数。
