# 合肥产业投资 Agent 推演：数据缺口与实施规划

## 当前结论

工程附录中的已核验 Seed Data 已进入 SQLite 数据库。数据库仅仅保存附录中明确给出的观测值；未核验内容进入 `data_gap`，没有用猜测值补齐。

当前数据足以验证数据库结构、信息截止查询和案例时间线，但不足以开展可信的 2007—2016 全周期 Agent Replay。最主要的阻塞项不是模型，而是财政约束、产业年度序列、企业年度财务和来源元数据。

## 数据库入口

- 数据库：`data/hefei_industry_simulation.sqlite3`
- 建表脚本：`database/hefei_simulation_schema.sql`
- 重建脚本：`scripts/seed_hefei_database.py`

重建：

```powershell
python scripts/seed_hefei_database.py
```

按历史信息截止日读取 Agent 可见信息：

```sql
SELECT entity_id, indicator_id, value_number, unit, effective_date, confidence
FROM agent_visible_observations
WHERE information_available_date <= '2008-09-30'
ORDER BY entity_id, indicator_id;
```

读取未解决缺口：

```sql
SELECT priority, domain, entity_or_case, period, missing_fields_json, required_source
FROM data_gap
WHERE status = 'open'
ORDER BY priority, domain;
```

## 关键缺口

| 优先级 | 缺口 | 对推演的影响 |
|---|---|---|
| P0 | 合肥 2007—2016 财政、税收、土地出让、国资和债务 | 无法形成政府预算约束，也无法判断单个项目对财政的占用 |
| P0 | 来源 URL、发布日期、页码/表号、内容哈希 | 无法可靠执行 information cutoff 和证据复核 |
| P0 | 每条数据准确的最早可知日期与版本关系 | 存在未来信息泄漏风险 |
| P1 | 六类产业逐年市场、价格、产能、利用率、利润和 CAPEX | 产业 Agent 仅仅能看静态切片，不能识别周期和拐点 |
| P2 | 六案例逐年财务、产能、订单、融资和政府支持 | 企业 Agent 与财政 Agent 缺少核心输入 |
| P2 | 熔安和北大未名的项目证据链 | 两个案例不能进入正式 Random Scenario Pool |
| P3 | 2007—2016 逐年事件幅度与持续期 | State Transition 只能识别事件名称，不能结算真实变量变化 |

## Agent 推演最小闭环

1. `Context Builder` 按模拟日期读取城市、产业、企业、项目、政策和事件数据，并强制执行 `information_available_date <= cutoff`。
2. `财政 Agent` 判断预算占用、资本结构、或有负债和退出风险。
3. `产业 Agent` 判断产业链匹配、周期位置、产能与竞争格局。
4. `企业 Agent` 判断现金流、杠杆、研发、订单和兑现能力。
5. `技术 Agent` 判断技术成熟度、替代风险、设备/IP/材料约束。
6. `市场 Agent` 判断需求、价格、竞争和进入时点。
7. `Judge Agent` 汇总证据冲突，输出结构化决策与不确定性，不直接写“成功率加减”。
8. `State Transition Engine` 用政府决策、事件和规则更新下一年度状态。
9. `Historical Replay Evaluator` 将轨迹与真实历史的结果、指标路径和事件顺序比较。

## 推荐实施顺序

### 阶段一：数据可用性

- 为全部来源补齐原始 URL、发布日期、页码/表号和哈希。
- 完成合肥 2007—2016 财政表。
- 将现有期末占位的 `information_available_date` 换成真实发布日期。
- 为缺失值保留空值，并记录缺失原因；不要用插值结果冒充观测值。

验收条件：2007—2016 每个决策年都能生成不含未来信息的城市与财政 Context。

### 阶段二：案例可回放

- 优先完成京东方与长鑫两个成功案例，以及赛维与鑫昊两个失败案例。
- 每个案例至少补齐 T0、谈判、决策、投资、建设、投产和结果节点。
- 结果节点标记为 withheld，仅供后台评分。

验收条件：四个案例均满足附录 P 的八项准入标准。

### 阶段三：Agent 与状态转移

- 先固定结构化输入输出 Schema，再接入模型。
- 所有 Agent 输出包含：主张、支持证据 ID、反对证据 ID、关键假设、不确定性和建议动作。
- 用确定性规则结算财政余额、政府持股、建设进度等硬状态；模型只负责判断和提出动作。

验收条件：同一数据、同一 seed、同一模型版本可复现；删除未来数据后输出不包含结果泄漏。

### 阶段四：Replay 与反事实

- 先跑真实决策基线，再逐项改变投资金额、持股、土地、补贴和退出条款。
- 评分至少覆盖历史结果一致性、指标轨迹一致性、决策解释一致性和反事实稳定性。

验收条件：系统能解释“为何当时应投/不应投”，并明确哪些证据改变会导致决策翻转。
