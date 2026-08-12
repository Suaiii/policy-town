# 企业 Agent 落地与三人分工执行方案

> 目标：让“头部企业因 AI 转型进行大规模岗位调整”的企业侧推演具备现实上下文、制度约束、可复核决策链和公开证据支撑。
>
> 核心原则：使用真实企业案例校准机制，不冒充真实企业内部 Agent，不编造企业未公开的人员数量、内部对话或决策原话。

## 一、先确定真实企业案例的使用边界

本期可接入的腾讯文档案例是一个公开报道的现实参照：报道显示，腾讯文档对部分区域职场团队进行调整，以深圳为核心办公地，原因与聚焦 AI 业务战略、提高 AI 产品团队协同效率有关；对受影响员工开放深圳、北京等地内部转岗机会，并表示尊重员工个人选择。[公开报道汇总](https://cloud.tencent.com/developer/news/3955852)

这组信息可以支持：

```text
AI战略重构不等于企业经营失败
办公地/组织中心调整是正式裁员之外的缓冲路径
内部活水是企业自处理的第一道防线
内部转岗的效果取决于技能、地域和岗位匹配
公开信息中的“调整”不等于可观测的净失业人数
```

这组信息不能支持：

```text
腾讯文档真实裁员人数
腾讯内部员工的真实年龄、技能和薪资分布
腾讯内部转岗成功率
腾讯未来一定会采取的决策
把腾讯高管或员工写成可代表其真实立场的 Agent
```

因此，产品中的企业 A 应使用：

```text
企业类型：头部平台办公产品企业
现实校准案例：腾讯文档公开组织调整案例
模拟身份：匿名化的“头部平台企业 A”
```

## 二、腾讯现实上下文数据包

新增一个只读的案例证据包：

```text
data/real_world/cases/tencent_docs_2026/
  source.yaml
  facts.yaml
  mechanisms.yaml
  timeline.yaml
  unknowns.yaml
```

### 2.1 `source.yaml`

```yaml
case_id: tencent_docs_2026_regional_adjustment
title: 腾讯文档区域职场团队调整公开报道
source_type: media_report_with_company_response
publisher: 腾讯云开发者社区转载公开报道
published_at: 2026-05-22
source_url: https://cloud.tencent.com/developer/news/3955852
verification: secondary_public_source
identity_policy: do_not_impersonate_company
```

### 2.2 `facts.yaml`

```yaml
- fact_id: work_center_shift
  statement: 部分区域职场团队办公重心调整至深圳
  status: reported
  confidence: L2

- fact_id: ai_strategy_reason
  statement: 公开回应将调整与聚焦AI业务战略、提升产品团队协同效率联系起来
  status: reported
  confidence: L2

- fact_id: internal_mobility_offer
  statement: 向受影响员工开放深圳、北京等地内部活水转岗机会
  status: reported
  confidence: L2

- fact_id: employee_choice
  statement: 公开回应称会与员工沟通并尊重个人意愿与选择
  status: reported
  confidence: L2
```

### 2.3 `unknowns.yaml`

```yaml
unknowns:
  - exact_affected_headcount
  - exact_role_mix
  - exact_internal_transfer_acceptance_rate
  - exact_severance_terms
  - exact_number_of_people_leaving_beijing
  - exact_number_of_people_entering_ai_roles
```

未知项必须保持未知，不由 LLM 补齐。它们在模拟中使用显式场景参数，并显示为 `scenario_assumption`。

### 2.4 `mechanisms.yaml`

```yaml
- mechanism_id: regional_consolidation
  source_fact_ids: [work_center_shift]
  action_intents:
    - consolidate_office_center
    - offer_relocation
    - offer_internal_transfer
  affected_dimensions: [location, relocation_cost, job_continuity]

- mechanism_id: ai_coordination_restructuring
  source_fact_ids: [ai_strategy_reason]
  action_intents:
    - reduce_traditional_coordination_roles
    - increase_ai_product_roles
  affected_dimensions: [skill_match, internal_transfer_capacity]

- mechanism_id: internal_mobility_buffer
  source_fact_ids: [internal_mobility_offer, employee_choice]
  action_intents:
    - offer_internal_transfer
    - accept_or_reject_transfer
  affected_dimensions: [net_unemployment, relocation_burden, income_change]
```

## 三、把企业 Agent 从“写理由”升级为“受约束的企业决策器”

企业 Agent 的现实感不来自长篇 reasoning，而来自五种可检查的状态：

```text
战略目标
组织与地域结构
岗位与技能结构
政策/监管约束
内部与外部劳动力市场选项
```

### 3.1 企业 Agent 状态

```yaml
firm_id: A
archetype: platform_product_company
calibration_case: tencent_docs_2026_regional_adjustment
business_state:
  revenue_trend: stable_or_growing
  ai_transition_pressure: high
  cost_distress: low
strategy:
  objective: concentrate_ai_product_coordination
  horizon_months: 6
organization:
  office_centers: [北京, 深圳]
  consolidation_target: 深圳
  relocation_support: true
roles:
  affected: [运营, 测试, 客服支持, 中后台协调]
  receiving: [AI产品, 数据治理, 模型应用, 工具工程]
internal_mobility:
  offered: true
  capacity: 900
  skill_gate: true
  location_gate: true
external_options:
  outsource_capacity: 700
  severance_budget_constraint: medium
policy_beliefs:
  consultation_effect_on_strategy: low
  policy_trust: 0.55
  future_hiring_cost: 0.45
```

数值如 `capacity: 900`、`policy_trust: 0.55` 是场景假设，不是腾讯公开数据。必须在界面中标注“模拟参数”。

### 3.2 企业 Agent 的决策顺序

每轮按照以下优先级生成行动意向：

```text
1. 是否仍需完成 AI 组织目标
2. 哪些岗位必须减少，哪些 AI 岗位必须补充
3. 内部转岗能消化多少人
4. 地域迁移会使多少人拒绝转岗
5. 外包能消化多少非核心工作
6. 政府工具能改变哪一个边际决策
7. 形成分批、转岗、外包和正式裁员的组合
```

政府约谈不能直接把战略目标改成“停止裁员”。它只能影响：

```text
披露节奏
内部转岗容量
培训/承接合作
分批时间
外包合规成本
```

### 3.3 LLM 输出与规则结算分离

企业 Agent 只能输出：

```json
{
  "strategy_priority": "ai_reorganization",
  "layoff_direction": "maintain",
  "internal_transfer_direction": "expand",
  "relocation_direction": "offer",
  "outsource_direction": "moderate",
  "magnitude": "moderate",
  "reasoning_summary": "内部转岗优先，但传统技能和地域迁移形成门槛",
  "worry": "公开承诺后仍无法满足所有受影响员工"
}
```

规则引擎再根据：

```text
AI转型压力
内部岗位容量
技能匹配
地域迁移成本
企业预算
政府工具
上一轮信念
```

计算具体的 `internal_transfer_accepted`、`layoff_formal`、`channel_transfer` 和 `channel_outsource`。

## 四、真实上下文如何进入 Agent Memory

### 4.1 共享事实记忆

企业 Agent 看到：

```text
公开政策规则
公开市场环境
自己的组织状态
已经公开的企业回应
政府已发布的工具组合
```

企业 Agent 看不到：

```text
其他企业未公开的内部计划
未公开劳动者个人信息
政府尚未发布的内部妥协
其他企业本轮尚未公开的行动意向
```

### 4.2 企业信念集

企业只保留 6 个直接影响决策的信念：

```text
ai_strategy_urgency
internal_transfer_can_absorb
relocation_acceptance
government_consultation_effect
future_hiring_cost
public_reputation_risk
```

例如：

```json
{
  "belief_id": "relocation_acceptance",
  "value": 0.42,
  "prior": 0.55,
  "updated_at_round": 2,
  "evidence_refs": ["episode:r2:transfer_declined_by_traditional_cohort"],
  "update_rule": "peer_outcome_location_v1"
}
```

如果一批传统技能员工拒绝迁移，企业更新的不是一句故事，而是 `relocation_acceptance` 的概率，进而影响下一轮外包和正式裁员比例。

### 4.3 现实案例只更新机制先验

腾讯文档案例可以初始化：

```text
internal_mobility_buffer = enabled
regional_consolidation = plausible
ai_coordination_restructuring = plausible
```

不能初始化：

```text
腾讯内部转岗成功率 = 某个确定百分比
腾讯真实裁员人数 = 某个确定人数
```

## 五、企业 Agent 的最小可验证场景

必须先做一个“腾讯文档类型企业 A”的窄场景，不直接从 5000 人全量开始：

```text
企业：匿名化平台办公产品企业
事件：北京办公中心向深圳集中
动因：AI产品协同与组织重构
第一道防线：内部活水
第二道防线：地域迁移
第三道防线：外包/培训
第四道结果：正式裁员、失业或退出
```

四个对照：

| 方案 | 变化 |
|---|---|
| A0 | 不提供内部转岗 |
| A1 | 提供内部转岗，但不提供迁移支持 |
| A2 | 提供内部转岗与迁移支持 |
| A3 | 提供内部转岗、迁移支持和政府承接岗位 |

要验证的不是“是否还原腾讯”，而是：

```text
内部转岗是否降低净失业
地域迁移成本是否使转岗效果下降
传统技能与 AI 岗位错配是否使活水失效
政府承接岗位是否比单纯约谈更改变量结果
```

## 六、说服评委的真实性证据链

演示中每个企业行动都按以下顺序展示：

```text
公开案例事实
→ 本产品采用的机制
→ 当前匿名企业状态
→ Agent行动意向
→ 规则结算结果
→ 对照方案差异
→ 结论边界
```

示例：

```text
公开事实：案例中出现区域办公中心调整与内部活水
机制：企业先用内部转岗缓冲正式裁员
当前状态：A有900个内部岗位容量，但传统技能匹配率低
Agent意向：优先提供转岗并集中办公地
结算结果：AI技能群体转岗较多，传统技能群体部分拒绝迁移
对照差异：增加迁移支持后，外部失业和退出下降
边界：这是机制级场景推演，不是对真实企业人数的复原
```

## 七、三人分工：在原计划上增加“企业真实化”任务

### M：产品与真实性主线

唯一目标：定义什么结论算成立，并把现实事实转成规则和检查器。

| 时段 | 任务 | 交付物 |
|---|---|---|
| H0–H1 | 冻结契约、登记腾讯案例事实与未知项 | `schema.py`、`source.yaml`、`facts.yaml` |
| H1–H2 | 写匿名化企业 A 状态与四轮时间线 | `firm_profiles.yaml`、`timeline.yaml` |
| H2–H4 | 实现内部转岗、地域迁移、技能匹配、政府工具约束 | `RuleLedger` 规则与测试 |
| H4–H5 | 企业真实性检测器 | `internal_transfer_failure`、`tool_disease_mismatch` |
| H5 | 检查点一：腾讯类型企业 A 是否能按时间线跑通 | 一条可回放企业轨迹 |
| H6–H8 | 写企业/政府/劳动者 Prompt 与证据链文案 | prompts、decision schemas |
| H9 | 接入真实跑批，核验事件链 | `run_*` 快照 |
| H10–H12 | 把结果改写为七问报告与政府措施 | 报告内容、PolicyPatch |
| H13–H14 | Demo 台词与三次排练 | 最终脚本、固定快照 |

M 不碰前端，不在 H9 后改契约，不把公开案例写成企业内部事实。

### T：Harness 与可复现管道

唯一目标：让所有 Agent 在正确的可见信息和轮次中稳定运行，且失败可降级。

| 时段 | 任务 | 交付物 |
|---|---|---|
| H0 | ReplayCache | 缓存键、落盘格式、命中测试 |
| H1–H2 | StructuredCall 与 JSON Schema 校验 | 重试与默认动作 |
| H2–H3 | TurnBarrier、VisibilityMatrix | 冻结世界状态与可见性测试 |
| H3–H5 | BeliefStore、企业信念更新 | 信念历史与 evidence refs |
| H5 | 检查点一支持：跑通匿名企业 A 窄场景 | 无 LLM/有 LLM 两种路径 |
| H6–H8 | 批量运行四方案、固定 seed、落盘 | `data/run_*` |
| H8 | 检查点二：缓存命中率与重复运行一致性 | 对比报告 |
| H9–H10 | 覆盖 mock，验证真实运行快照 | schema 校验 |
| H10–H12 | 失败降级、断网回放、日志清理 | demo 可用管道 |
| H13–H14 | 归档固定 seed、协助排练 | 可复现演示包 |

T 不改契约、不让 LLM 输出人数、不碰 Convex/AI Town，不用真实企业名称作为 Agent 身份。

### F：可见性与说服力主线

唯一目标：让评委看见“现实案例—企业机制—人才结果”的链路。

| 时段 | 任务 | 交付物 |
|---|---|---|
| H0–H1 | 接入 mock，建立静态数据适配 | `policyFeed.ts` |
| H1–H3 | 做企业 A 时间线与内部活水图层 | 企业状态、转岗通道 |
| H3–H5 | 双时钟画面 | 培训时钟、储蓄时钟 |
| H5 | 检查点一：拖动轮次时画面真实响应 | 前端停工验收 |
| H6–H8 | 一进一出、地域迁移、技能门槛 | 三类事件动画 |
| H8 | 检查点二：报告和溯源抽屉入口可用 | 前端降级验收 |
| H9 | 一行切换到 T 的真实快照 | 不改业务逻辑 |
| H10–H12 | 溯源抽屉、现实/设定/模拟标签、企业案例卡 | 证据链面板 |
| H13–H14 | 报告页、排练、截图和录屏 | 最终演示 |

F 不在运行时 fetch，不等待 T 才开始，不写死企业人数，不把案例报道展示成“腾讯内部真实数据”。

## 八、两次检查点与失败预案

### H5：企业 Agent 真实性检查点

必须能回答：

```text
A为什么要调整？
A为什么先提供内部转岗？
为什么传统技能群体转岗失败更多？
政府约谈到底改变了什么？
每个结论能否回到公开事实或明确场景假设？
```

不通过时：砍掉复杂社会传播，只保留企业时间线、内部转岗、技能匹配和 RuleLedger。

### H8：真实跑批检查点

必须满足：

```text
ReplayCache 可用
同 seed 重放一致
LLM 输出没有具体人数
真实快照能覆盖 mock
前端不依赖网络
```

不通过时：使用规则默认动作生成真实快照，保留企业案例证据链；不把未完成的 LLM 跑批冒充完成。

## 九、最终演示链路

```text
1. 展示公开案例：区域办公重心调整 + AI战略 + 内部活水
2. 声明：我们不复原腾讯，而是把公开机制放进匿名化城市企业
3. 展示 A 的组织状态：传统岗位减少、AI岗位增加、深圳集中
4. 政府选择约谈、培训、迁移支持和承接补贴
5. A Agent 先给内部转岗意向
6. RuleLedger 按技能和地域成本结算转岗、外包、失业和退出
7. 双时钟显示培训启动时谁还等得到
8. 点击传统技能员工，查看资格、储蓄、参保和信念更新
9. 对比无迁移支持与有迁移支持
10. 输出政府措施：先做内部活水和等待期保障，再做培训和外部承接
```

## 十、产品有效性的最终论证

产品有效性不靠声称“预测了腾讯”，而靠五个可检查事实：

1. 使用了公开企业案例中真实出现的机制，而非凭空设定；
2. 对未公开的企业数据明确标记为场景假设；
3. 企业 Agent 的行动被战略、岗位、地域、政策和信念共同约束；
4. 具体人数、预算和指标由规则引擎结算并可复算；
5. 政府建议可以通过对照方案验证，而不是由 LLM 直接宣布。

最终对外表述：

> 我们没有把腾讯员工编成会替腾讯发言的数字人。我们提取公开案例中真实发生的“AI组织重构、区域集中和内部活水”机制，将其放入匿名化的头部平台企业 Agent，在同一套城市、岗位和劳动者约束下比较政府措施。系统展示的不是某家企业的秘密，而是政策工作组在危机发生时真正需要看见的：内部转岗能接住谁，地域和技能会挡住谁，培训和生活保障是否来得及，以及政策怎样把人送到下一份工作。

