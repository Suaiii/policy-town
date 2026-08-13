# hefei_mvp · 企业Agent 阶段化Context档案

- `enterprise_agents.json` — 6 家企业的 Agent 设定：`system_prompt`（第一阶段唯一输入）+ `stage_contexts`（随时间注入）
- `prototypes.json` — 六原型（校准用，永不进入 Context）
- `stages.json` — S1—S4 阶段定义与候选池

## 阶段化注入规则

| 概念 | 说明 |
| --- | --- |
| `enter_stage` | 企业入局阶段。入局阶段（第一阶段）**只有 system_prompt**，不注入任何阶段 Context |
| `stage_contexts` | 入局之后的每个阶段注入该阶段的 Context 列表（`as_of` 标注可得时间） |
| 截止日纪律 | 每个注入项 `as_of <= 该阶段 cutoff_at`（数据层校验 + `CompanyAgent.plan` runtime 二次过滤） |
| 事后信息 | 一律排除；迟于 S4 截止日的事件（如北大未名 2019 年调查报道）不注入 |
| 匿名性 | 真实企业名只存在于企业 Agent 的私有 prompt；政府玩家看到的公开 Context 保持匿名（企业A—F） |

## 六企业入场时间表（对应各案决策截止日）

| 企业 | enter_stage | decision_cutoff | 系统提示时点 |
| --- | --- | --- | --- |
| 熔盛重工（熔安动力） | S1 | 2007-06-30 | 2007 年中：在建船坞+订单、无交船记录、财务缺失 |
| 京东方 | S1 | 2008-08-31 | 2008 年中：5代线量产、H1 盈利改善、项目条款未落地 |
| 鑫昊等离子 | S2 | 2009-06-30 | 2009 年中：新设项目公司、PDP 厂商退出信号已现 |
| 赛维LDK | S2 | 2010-06-30 | 2010 年中：20-F 数据、高短债、合肥项目未公开落地 |
| 北大未名 | S3 | 2013-06-30 | 2013 年中：集团财务不透明、200亿级规划未公开 |
| 长鑫存储 | S4 | 2016-06-30 | 2016 年中：17 天新公司、DRAM 低谷、国家战略 |

> 长鑫在 S4 入场（最后一个阶段），按"第一阶段只有 system prompt"规则不再注入阶段 Context；
> 2016 年下半年 DRAM 上行由阶段事件 EVT-S4-MEMORY 经市场 Context 传导，不写入企业档案。

## 新增文件说明

| 文件 | 变更 |
| --- | --- |
| `data/hefei_mvp/enterprise_agents.json` | 新增：6 企业档案 |
| `agents/company.py` | CompanyAgent 支持企业档案：企业专属 system prompt + 阶段 Context 注入 + 显式输出契约 |
| `core/orchestrator.py` | 加载企业档案、按 prototype 映射、`plan()` 传入当前 stage_id |
| `data/hefei_mvp/stages.json` | `candidate_pool` 对齐各案决策窗口 |
| `tests/test_enterprise_agents.py` | 阶段隔离 / 截止日过滤 / 匿名性测试（9 个） |

## 验证

```bash
python3 -m unittest policytown.investment.tests.test_smoke \
                    policytown.investment.tests.test_enterprise_agents -v
python3 -m policytown.investment.run_demo          # 确定性（断网可跑）
python3 -m policytown.investment.run_demo_llm      # LLM 版（需 OPENCODE_GO_API_KEY）
```
