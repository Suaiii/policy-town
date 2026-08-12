# 终极实施方案：AI 裁员背景下的政府人才应对模拟器

> 状态：架构冻结，进入开发。
>
> 产品用户：市人社局就业促进处及跨部门政策工作组。
>
> 决策时刻：头部企业宣布在两个季度内调整约 5000 个岗位后的周一上午。
>
> 产品任务：在 2 亿元场景预算、六类工具、一个季度考核周期和一年观察期内，对政府应对方案进行可追溯的 Agent 推演，发现工具错配、时钟错位、资格遗漏、替代效应和统计盲区，形成可执行的人才承接措施。

## 0. 最终产品定义

一句话：

> 输入一次大规模岗位调整事件和一套政府工具组合，模拟政府、企业与劳动者在 AI 转型背景下如何响应，比较不同方案对人才承接、等待期保障和长期就业的影响。

本产品不是：

- 真实城市裁员人数预测器；
- 具名企业行为预测器；
- 让 LLM 随机扮演几千人的聊天室；
- 自动替政府决定政策优劣的系统。

本产品输出的是：

```text
危机简报
→ 政策工具组合
→ 多方 Agent 决策
→ 规则引擎结算
→ 人才流动与双时钟画面
→ 风险体检卡
→ 政府人才应对建议
```

## 1. 先修正四个政策口径

这些修正必须进入数据、Prompt 和报告，避免产品建立在过度推断上。

### 1.1 文件日期

人社部发〔2026〕39号发布日期为 **2026 年 6 月 18 日**，不是“2026 年 7 月”。

### 1.2 稳岗返还不是“发生裁员就必然失格”

真实条件是：参保企业足额缴纳失业保险费 12 个月以上，且上年度未裁员或裁员率不高于规定目标；30 人及以下企业适用单独裁员率条件。

因此模型必须计算：

```text
上年度裁员率
企业规模
缴费状态
地方执行规则
```

不能写成：

```text
企业当前裁了人 → 自动不能领取稳岗返还
```

本场景可以提出“稳岗返还与战略换血型裁员的政策目标错配”，但资格是否满足必须由规则计算。

### 1.3 技能提升补贴并非只有在职人员可领

2026 年通知覆盖“参加失业保险 12 个月以上的企业在职职工或领取失业保险金人员”，并要求取得符合规定的证书。

因此 46 岁传统岗位人员不是天然被排除；他的结果取决于：

```text
是否累计参保达到要求
是否正在领取失业保险金
是否取得匹配证书
当地证岗相适细则
```

### 1.4 失业不会自动把既有参保年限清零

领取失业保险金的基本条件是失业前累计缴费满一年、非因本人意愿中断就业、完成失业登记并有求职要求。不能使用“失业导致断缴，断缴导致失格”作为普遍结论。

产品应检测的是：

```text
失业前累计缴费不足
解除关系性质不符合条件
未完成登记或没有求职要求
地方经办差异
```

报告用语统一为：

> 部分劳动者可能因失业前累计缴费不足、解除关系性质或登记条件而无法领取失业保险金。

## 2. 现实数据进入产品的最终规则

### 2.1 五级数据链

```text
Source 现实来源
  → Fact 可核验事实
  → Constraint 场景约束
  → Event / Metric 模拟事件与指标
  → Finding / Recommendation 发现与建议
```

每条报告结论必须携带：

```text
source_ids
constraint_ids
event_ids 或 metric_ids
confidence
claim_limit
```

### 2.2 数据分诊

| 数据 | 是否进入计算 | 用途 |
|---|---:|---|
| 政策资格、标准、计算规则 | 是 | `hard_rule` |
| 城市就业、行业、年龄、参保结构 | 是 | 城市基线或校准范围 |
| 企业正式披露的 AI 重构机制 | 间接 | `mechanism_support` |
| 学术实证中的行为方向 | 间接 | 行为规则与先验范围 |
| 行业裁员总数、AI归因比例 | 否 | 开场背景锚点 |
| 企业传闻、未证实裁员数字 | 否 | 不进入正式流程 |

### 2.3 三类标签必须进入界面

- `现实规则`：有正式来源，可直接复核；
- `场景设定`：5000 人、2 亿元、岗位构成等演示输入；
- `模拟结果`：当前规则、主体样本、模型版本和随机种子下的输出。

## 3. 最终场景与方案库

### 3.1 触发事件

```yaml
event_type: mass_job_adjustment
announced_jobs: 5000
cause: ai_and_organizational_restructuring
affected_roles: [运营, 测试, 客服支持, 中后台]
adjustment_horizon_months: 6
public_attention: high
data_status: scenario_assumption
```

“宣布调整 5000 个岗位”不等于“净失业 5000 人”。必须依次经过：

```text
内部转岗
跨地区调动
正式裁员
外包转移
自然流失
再就业
退出劳动力市场
```

### 3.2 六类政府工具

```text
enterprise_consultation    企业沟通与节奏协调
stability_refund           稳岗返还/稳岗支持
job_matching               专场招聘与承接对接
absorption_subsidy         吸纳/扩岗补助
skill_conversion_training  技能转换与证书支持
income_support             失业保险衔接与等待期生活保障
```

每个工具统一保存：

```text
enabled
start_month
duration_months
budget_yuan
unit_cost_yuan
capacity
eligibility
measurement_basis
source_ids
data_status
```

### 3.3 四套 P0 方案

| ID | 方案 | 目的 |
|---|---|---|
| `base` | 不增加危机干预 | 常驻度量尺 |
| `draft` | 应急工具组合 | 展示快速工具与长期人才承接的错位 |
| `fix1` | 等待期生活保障与培训同步 | 检验人能否撑到培训和岗位匹配 |
| `fix2` | 资格分档与补充审核 | 检验政策资格遗漏是否下降 |

`fix3`“事前培育 AI 承接生态”保留为 P1，但必须作为**历史路径反事实**单独展示。它改变了危机发生前的产业基础，不能和危机发生后的三套方案伪装成同起点、同条件实验。

## 4. Agent 架构冻结

### 4.1 只有决策主体使用 LLM Agent

LLM Agent：

```text
政府四部门 Agent
联席会议 Agent
企业 A/B/C/D Agent
10 个劳动者代表 Agent
```

非 LLM 服务：

```text
Evidence Registry
Ontology Store
Belief Store
Environment Scheduler
Rule Ledger
Market Matcher
Metrics Engine
Detectors
Report Assembler
```

Evidence、结算、指标和检测器不应人格化。它们需要确定性、可测试和可复核，不需要“思考语气”。

### 4.2 企业角色

| Agent | 最终设定 | 允许动作 |
|---|---|---|
| A 头部企业 | 盈利或业务稳定，但主动进行 AI 资源重配 | 内部转岗、地域调动、分批、正式裁员、外包 |
| B 承接企业 | 有扩张可能，关注未来用工成本与政策稳定性 | 扩招、维持、收缩、岗位改造 |
| C 转型企业 | 同时消灭传统岗位并创造 AI 岗位 | 换岗、招 AI 人才、拒绝错配、提供实训 |
| D 人力服务商 | 外包与培训承接方 | 承接外包、提供培训、调整质量与价格 |

A 对约谈的反应应设为“弱但非零”，不能写死为完全无效。政府沟通仍可能影响节奏、信息披露、内部转岗和承接合作，但不应轻易改变战略调整总量。

### 4.3 劳动者四个核心维度

删除 `rights_prior` 作为主维度，换成更直接的资格和生计约束：

```text
age_band
skill_type / certificate_type
insured_months_cumulative
savings_months
```

另增加一个事件字段：

```text
separation_type
```

它决定是否属于非因本人意愿中断就业，比抽象“维权先验”更直接。

代表 Agent 负责讲清楚选择；cohort 负责人数。LLM 不得生成 cohort 总量。

### 4.4 企业内部活水

新增：

```text
internal_transfer_offered
internal_transfer_accepted
internal_transfer_target_skill
internal_transfer_location
```

AI 相关技能与传统技能的接受率可以使用不同先验，但 `0.60/0.15` 只能标记为场景参数，不能写成现实事实。后续通过敏感性分析检查结论是否依赖该取值。

## 5. 本体与 Memory 冻结

### 5.1 核心本体

```text
Actor
  GovernmentDepartment
  Firm
  WorkerRepresentative
  WorkerCohort

Policy
  PolicyPackage
  PolicyTool
  EligibilityRule

LaborMarket
  Job
  Skill
  Certificate
  TrainingProgram
  Benefit

Simulation
  Fact
  Belief
  Norm
  Episode
  Decision
  Event
  Metric
  Finding
  Recommendation
```

核心关系：

```text
Evidence supports Fact
Fact constrains PolicyTool
PolicyTool targets WorkerCohort
EligibilityRule determines BenefitAccess
Episode updates Belief
Belief influences Decision
Decision proposes ActionIntent
RuleLedger settles ActionIntent into Event
Event updates WorldState
Metric aggregates Event
Finding cites Metric and Evidence
Recommendation patches PolicyPackage
```

### 5.2 四层 Memory

| 层 | 内容 | 生命周期 |
|---|---|---|
| L0 Facts | 政策、公告、公开数据 | 场景级共享，只读 |
| L1 Episodes | 主体经历过的事件 | Agent 私有，随轮次累积 |
| L2 Beliefs | 对可得性、信任、风险和机会的概率判断 | 决策直接输入 |
| L3 Norms | 对公平、稳定、转型等价值偏好 | Persona 固定或缓慢变化 |

L2 使用结构化记录：

```json
{
  "belief_id": "subsidy_obtainable",
  "value": 0.30,
  "prior": 0.70,
  "updated_at_round": 4,
  "evidence_refs": ["episode:r4:application_rejected"],
  "update_rule": "direct_experience_v1"
}
```

### 5.3 检索不用通用向量 RAG

8 轮、少量角色的场景使用决策类型映射：

```text
expand_hiring
  → future_firing_cost + policy_trust + peer_hiring_lagged

accept_training
  → training_value + remaining_buffer + benefit_access + recent_peer_outcome

accept_internal_transfer
  → skill_match + relocation_cost + income_change + job_search_expectation
```

固定映射能复核每次决策看到了什么。向量检索只作为未来扩展，不进入 P0。

### 5.4 信念更新必须确定化

亲历、同侪和公告可影响信念，但更新幅度由规则表计算，LLM 只解释变化：

```text
直接亲历：高权重
同侪事件：中权重 × 关系可信度 × 时间衰减
政府公告：公告权重 × 当前政府可信度
```

不能让 LLM 随意给 `delta`，否则同一事件无法复核。

## 6. Harness 最终设计

P0 只做七个小组件：

```text
TurnBarrier
VisibilityMatrix
ContextBuilder
BeliefStore
StructuredCall
RuleLedger
ReplayCache
```

### 6.1 TurnBarrier

同一轮全部 Agent 基于同一份冻结世界状态决策；提交后才统一结算，避免调用顺序改变结果。

### 6.2 VisibilityMatrix

明确：

```text
政策公告：公开
企业内部计划：企业私有
劳动者经历：本人私有
社交信息：半公开且带可信度
同业动作：滞后一轮可见
```

### 6.3 ContextBuilder

根据 `actor_type + decision_type` 从本体、可见事实和映射后的 Memory 中构造最小信息集，并写入审计记录。

### 6.4 BeliefStore

提供：

```text
get(actor_id, belief_ids)
apply_evidence(actor_id, evidence_event)
history(actor_id, belief_id)
```

### 6.5 StructuredCall

流程：

```text
构造最小 Prompt
→ JSON Schema 输出
→ 校验失败重试两次
→ 仍失败使用规则默认动作
→ 记录降级原因
```

LLM 允许输出：

```json
{
  "direction": "contract",
  "magnitude": "moderate",
  "channel_preferences": ["internal_transfer", "outsource"],
  "belief_updates_requested": [],
  "reasoning_summary": "...",
  "worry": "..."
}
```

LLM 禁止输出最终人数、预算和指标。

### 6.6 RuleLedger

唯一有权生成：

```text
人数
流量
预算余额
资格结果
剩余储蓄缓冲
退出人数
指标
```

每笔结算产生 ledger entry，支持反向追溯。

### 6.7 ReplayCache

缓存键不能只有 `prompt_hash + seed`，应包括：

```text
model_id
model_settings
system_prompt_version
schema_version
context_hash
seed
```

原始 LLM API 即使设置 seed 也不保证绝对确定。产品所承诺的“同输入同输出”来自**缓存重放和冻结模型配置**，不是来自模型本身。

## 7. 单轮执行顺序

```text
0. 载入世界快照和当轮外部事件
1. 冻结可见世界状态
2. 四部门并行提出方案
3. 联席会议形成政策工具包
4. 预算、资格与合法性预校验
5. A/B/C/D 并行输出行动意向
6. 劳动者代表并行输出选择意向
7. RuleLedger 统一结算人数与资金
8. MarketMatcher 结算岗位匹配和培训队列
9. BeliefStore 根据已结算事件更新信念
10. MetricsEngine 生成两套指标
11. Detectors 生成发现与参数补丁
12. Snapshot、调用日志和证据链落盘
```

社会传播 P0 采用规则扩散；LLM 只生成一条代表性帖子或表达，不让自由对话阻塞主循环。

## 8. 数据契约 1.3

### 8.1 Policy

新增：

```text
budget_total
tools[]
eligibility_rules[]
policy_package_version
source_ids[]
```

### 8.2 FirmActionIntent 与 FirmSettlement 分离

LLM 输出：

```text
direction
magnitude
channel_preferences
reasoning_summary
worry
```

规则结算：

```text
layoff_batches
layoff_formal
internal_transfer_offered
internal_transfer_accepted
channel_outsource
hiring_campus
hiring_social
subsidized_hires
```

### 8.3 WorkerProfile 与 WorkerDecision 分离

Profile：

```text
age_band
skill_type
certificate_type
insured_months_cumulative
savings_months
separation_type
cohort_weight
```

Decision：

```text
action_preference
target_preference
reasoning_summary
hesitation
```

### 8.4 Event

```text
event_id
scenario_id
round
actor_id
event_type
count
causes[]
policy_tool_ids[]
constraint_ids[]
ledger_entry_ids[]
```

### 8.5 Metrics

保留并新增：

```text
employment_total
effective_employment
unemployment_rate
hidden_unemployment
labor_force_exit
reemployment_rate
skill_mismatch_gap
rescue_reach_rate
eligibility_exclusion_rate
waiting_support_gap
non_target_hiring_contraction
subsidy_additionality
budget_spent
```

## 9. 检测器与政府措施闭环

| 检测器 | 发现 | 政府可执行措施 |
|---|---|---|
| `tool_disease_mismatch` | 工具面向经营困难，事件却是战略换血 | 转向内部转岗、承接岗位、技能转换和过渡保障 |
| `rescue_arrives_too_late` | 人在培训启动前耗尽缓冲 | 培训与等待期生活保障同步，或提前采购培训 |
| `eligibility_exclusion` | 高风险群体被资格线排除 | 分档、补充审核、地方增量兜底 |
| `internal_transfer_failure` | 内部活水对传统技能无效 | 政企共建转岗课程和岗位能力清单 |
| `substitution_effect` | 受补贴招聘没有形成相应净增岗位 | 补贴与净增就业、稳定就业期挂钩 |
| `consultation_spillover` | A节奏变化有限，B招聘预期却恶化 | 同步发布稳定预期和承接支持措施 |
| `statistical_blind_spot` | 官方失业率改善但有效就业下降 | 增加退出、低质量就业与一年期跟踪指标 |

建议引擎只输出预定义 `PolicyPatch`，例如：

```json
{
  "patch_id": "sync_waiting_support",
  "changes": {
    "income_support.start_month": 1,
    "income_support.target": "training_waitlist"
  },
  "requires_new_authority": false,
  "validation_metrics": ["rescue_reach_rate", "hidden_unemployment"]
}
```

## 10. 三个 P0 画面

### 10.1 双时钟

```text
政策时钟：工具启动月
个人时钟：remaining_buffer
```

培训启动时停帧，展示已退出、仍等待、因保障而仍能等待、救援可达率。

### 10.2 工具与病症不匹配

政府进入 A，A 的战略调整总量变化有限；稳岗工具资格和适用对象面板亮起，说明“最快的工具不一定打中这类冲击”。

### 10.3 内部活水与技能门槛

A 的 AI 相关人员进入内部转岗通道，传统岗位人员在能力门槛前停下；未承接部分随后进入人才市场、培训、外包或退出路径。

“一进一出”和“走出地图”作为同一事件流中的次级动画保留。

## 11. Harness 验收门槛

### 11.1 守恒

```text
期初人数 + 外部流入 - 外部流出 = 期末人数
预算总额 = 已用预算 + 剩余预算
正式裁员 = sum(layoff_batches)
```

### 11.2 资格

- 年龄、身份、参保月数、证书条件按工具分别判断；
- 不把稳岗返还企业资格误套到劳动者；
- 不把扩岗补助误写成劳动者直接补贴；
- 不把技能提升补贴误写成仅限在职人员；
- 失业保险使用累计缴费与解除关系条件。

### 11.3 LLM 越权

- 最终人数只能由 RuleLedger 写入；
- 最终预算和指标只能由确定性模块写入；
- 未知来源不得由 Agent 补齐；
- Schema 失败必须重试或降级；
- 每次决策保存最小信息集和 Prompt 版本。

### 11.4 对照方向

在其他条件一致时：

```text
等待期保障提前 → 因缓冲耗尽退出的人数不应增加
培训提前 → 救援可达率不应下降
资格放宽 → 资格遗漏率不应上升
内部转岗容量增加 → 直接进入外部失业的人数不应增加
```

### 11.5 回放

- 冻结配置后，缓存重放逐字段一致；
- 无缓存的实时 LLM 运行只承诺可记录，不承诺字节级确定；
- 演示默认使用经过验证的真实运行快照，不依赖现场网络。

## 12. 施工批次

### Phase 0：冻结与保护现场

1. 保留当前 dirty worktree，不覆盖现有 `run_A/run_B` 和 UI 修改；
2. 契约版本升级到 1.3，并提供 1.2 读取兼容；
3. 新场景使用新目录和新 ID；
4. 所有新增文本使用 UTF-8，修复新增文件中的中文编码问题。

验收：旧测试仍通过，旧回放仍能打开。

### Phase 1：确定性骨架

1. ReplayCache；
2. Event 与 Ledger；
3. PolicyTool、WorkerProfile、FirmIntent 契约；
4. 预算、资格、缓冲和内部转岗规则；
5. 守恒与资格测试。

验收：不调用 LLM 也能用规则默认动作跑完 8 轮。

### Phase 2：Agent Harness

1. TurnBarrier；
2. VisibilityMatrix；
3. ContextBuilder；
4. StructuredCall；
5. BeliefStore 和固定检索映射；
6. 政府、企业、劳动者 Prompt。

验收：Agent 只输出意向，RuleLedger 产生全部人数；失败时能降级跑完。

### Phase 3：方案与检测器

1. `base/draft/fix1/fix2`；
2. 同 seed 对照；
3. 七个检测器；
4. PolicyPatch 重跑闭环；
5. 报告证据链。

验收：`draft → rescue_arrives_too_late → fix1 → 重跑 → 指标改善` 全链可复核。

### Phase 4：产品画面

1. 双时钟；
2. 工具与病症不匹配；
3. 内部活水与技能门槛；
4. 统计盲区；
5. 体检卡与七问报告。

验收：所有画面只消费 Snapshot/Event/Metric，不写死另一套数字。

### Phase 5：演示与压测

1. 三次完整排练；
2. 断网回放；
3. LLM 超时降级；
4. 缓存损坏恢复；
5. 预算与人数守恒审计；
6. 报告来源逐条点击检查。

验收：五分钟内完成“配置—推演—发现—修正—对照—报告”。

## 13. 第一条必须打通的纵向切片

```text
录入：培训第6月启动
→ WorkerProfile：2/3/5/8月储蓄缓冲
→ Agent：选择等待、求职、外包或转岗
→ RuleLedger：逐轮扣减缓冲并生成退出事件
→ 双时钟：培训启动时停帧
→ Detector：命中 rescue_arrives_too_late
→ PolicyPatch：生活保障第1月覆盖培训等待者
→ fix1 同条件重跑
→ rescue_reach_rate 上升、hidden_unemployment 下降
→ 报告回溯到事件、规则和来源
```

这条切片跑通后，才依次增加资格遗漏、内部活水、补贴替代和约谈溢出。

## 14. 开工后的冻结规则

以下内容从现在起冻结：

- 用户与决策时刻；
- AI 战略换血型大规模岗位调整；
- A/B/C/D 四类企业；
- 四部门与联席会议；
- 10 个代表 Agent + cohort；
- 六类政策工具；
- 四套 P0 方案；
- 四层 Memory；
- LLM 只输出行动意向，规则层结算人数；
- 双时钟为第一核心画面；
- 第一纵向切片为 P0 验收目标。

后续新增数据只能进入 `Source/Fact/Constraint`，不能再次改变产品问题。新增机制先进入 P1，不打断 P0 纵向切片。

## 15. 最终对外表述

> AI 驱动的裁员不是企业“撑不下去”，而可能是主动的组织换血。政府原有工具中，有些用于预防经营困难型裁员，有些服务青年扩岗或持证技能提升，未必能及时覆盖被调整的中年传统岗位人员。
>
> 我们用 Agent 模拟政府、企业和劳动者如何判断与行动，用规则引擎结算人数、预算和资格，再比较不同工具组合：谁能通过内部转岗留下，谁能等到培训，谁被资格线遗漏，谁从统计口径中消失。系统不预测真实城市一定发生什么，而是在行动前暴露方案的结构性盲区。

