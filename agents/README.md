# agents/ · 星河市智能体设定目录

本目录存放星河市所有智能体（persona）与企业（firm）的 YAML 设定，是"Agent 设定文档注入管线"（P0）的输入源。

## 快速开始（30 秒跑通）

```bash
# 1. 用预置的 6 企业 + 4 角色初始化（可先浏览再复制）
cp agents/seed/firms.yaml agents/firms.yaml
mkdir -p agents/personas
cp agents/seed/personas/*.yaml agents/personas/

# 2. 注入（--dry-run 先看解析结果）
python3 scripts/inject_agents.py --dry-run
python3 scripts/inject_agents.py

# 3. 启动模拟（reverie 交互：run <步数> 推进，fin 结束）
cd reverie/backend_server && python3 reverie.py
```

> agents/personas/ 与 agents/firms.yaml 是"你的世界配置"（可自由增删改）；agents/seed/ 是预置样例（只读参考）。

## 管线工作流

```bash
# 1. 编写设定
cp agents/example_persona.yaml agents/personas/李四.yaml   # 按注释填写
cp agents/example_firms.yaml agents/firms.yaml             # 若需自定义企业

# 2. 注入环境（校验必填字段、自动推导 segment、写入记忆与台账）
python3 scripts/inject_agents.py

# 3. 启动模拟（reverie 交互命令：run / fin）
cd reverie && python3 reverie.py
```

> `inject_agents.py` 尚未合入时，先完成本目录的模板即可，注入脚本属于后续任务。

## persona 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 全名，persona 唯一标识 |
| `age` | 是 | 整数 |
| `gender` | 否 | 男/女，默认 `未知` |
| `education_tier` | 是 | `名校` / `普通` |
| `major_type` | 是 | `紧缺` / `一般` |
| `innate` | 是 | 短特质列表（斯坦福认知架构使用） |
| `learned` | 是 | 背景故事 |
| `lifestyle` | 是 | 作息 |
| `daily_plan_req` | 是 | 每日计划要求 |
| `initial_memories` | 否 | 初始记忆流，写入 associative_memory，建议不超过 10 条 |
| `employer` | 是 | 企业名（不在 firms.yaml 时给出警告，视为镇内既有雇主），`null` 表示待业 |
| `salary` | 是 | 年薪（万元） |
| `savings_months` | 是 | 储蓄月数 |
| `risk_aversion` | 是 | 0-1，1=极度保守 |
| `family_tie` | 是 | `本地` / `外地` |
| `living_area` | 否 | 默认缺省时自动分配 |

`segment`（A/B/C/D 型）由注入脚本根据 `education_tier` + `major_type` 自动推导，**不要手填**。

## 四类人群对照表

| 类型 | 标签 | 政策敏感度 |
| --- | --- | --- |
| A型 | 名校 + 紧缺 | 补贴敏感度中等：offer 多、议价能力强，对补贴最不敏感 |
| B型 | 普通 + 紧缺 | 补贴敏感度最高：就业机会多但议价弱，最容易被补贴打动 |
| C型 | 名校 + 一般 | 补贴敏感度较低：能力自信，看重大城市长期发展而非短期补贴 |
| D型 | 普通 + 一般 | 补贴敏感度较高：就业机会少，一有补贴/利好政策倾向抓住 |

## 常见问题

- **employer 不匹配只警告不报错**：persona 中的 `employer` 名称若与 `agents/firms.yaml` 中某个 `firms[].name` 不一致，脚本给出警告，视为镇内既有雇主（不纳入政策引擎台账）；待业写 `null`。
- **initial_memories 建议不超过 10 条**：实现不截断，超出会全部写入。
- **bootstrap 文件为覆盖写**：同名 persona 的 scratch / spatial / associative 记忆文件会被覆盖；`meta.json` 的 `persona_names` 追加不重复。
- **运行后如何启动模拟**：`cd reverie && python3 reverie.py`，在交互界面使用 `run` 推进模拟、`fin` 结束并保存。
