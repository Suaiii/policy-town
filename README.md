# 合肥产业投资推演系统（Hefei Town）

> 让玩家在 2007—2016 年的真实历史空间中扮演合肥市政府，对六个真实产业项目进行连续决策，并检验「如果政府在历史节点做出真实选择，系统能否推演出真实历史结果」。

系统不是固定公式驱动的经营游戏，而是把真实历史变成可反证的 Agent 沙盘：真实数据 + 信息截止 + 确定性规则结算 + 后台 Historical Replay 盲测。

## 核心机制

- **截止日冻结推演**：每条数据同时携带 `effective_date` 与 `information_available_date`，运行中的 Agent 只能看到截止日前已公开的材料；后来的年报、评级报告与真实结果只在终局 Replay 解锁，避免未来信息泄漏。
- **确定性规则引擎**：财政点数、企业财务、建设进度由规则结算；Agent 只输出方向性意向，不生成人数与数值。
- **真实数据溯源**：`source_id → 原 URL → 本地归档 → SHA-256` 可复核；财政点数明确标注 `scenario_assumption`，不冒充真实可投资亿元。
- **Historical Replay**：输入真实政府决策序列时，引擎应在容差内复现历史方向；改变关键决策则长出另一条未来。

## 快速开始

要求 Python 3.10 或更高版本。

```powershell
python -m pip install -r requirements.txt

# 1. 重建 SQLite 真实数据库并审计
python scripts/seed_hefei_database.py
python scripts/audit_hefei_database.py

# 2. 查看某个截止日的真实 Context（信息截止过滤）
python -m policytown investment-context --cutoff 2008-09-30

# 3. 跑 S1—S4 产业投资推演
python -m policytown investment-run --companies company_a company_d

# 4. 导出历史案例回放包（盲测校准）
python scripts/export_hefei_case_package.py --case CASE-04 --cutoff 2010-08-30 --output data/historical_cases/hefei_ldk_2010

# 5. 测试
python -m unittest discover -s tests -p "test_*.py"
```

## 当前交付

- 确定性投资引擎：S1—S4 四阶段、滚动财政池、六企业原型、路径依赖与阶段反馈。
- SQLite 真实数据库：合肥 2007—2016 财政/产业数据、企业年报、政策库与事件库，带信息截止过滤与来源 SHA-256。
- 六个真实案例：京东方（成功）、长鑫存储（成功）、鑫昊等离子（失败）、赛维 LDK（失败）、熔安/熔盛（部分核验）、北大未名（待核验）。
- 深校准回放包：`data/historical_cases/hefei_boe_2008/`、`data/historical_cases/hefei_ldk_2010/`。
- 政企协商闭环（四部门初审 → 定向质询 → 企业反提案 → 承诺账 → 规则结算）开发中，当前以确定性 fallback 运行。

## 目录结构

```text
.
├── contracts/
│   └── investment_simulation_v0_1.py   # 投资推演契约
├── policytown/
│   └── investment/                     # 内核：context / engine / loader / real_data / deliberation
├── database/
│   └── hefei_simulation_schema.sql     # SQLite Schema
├── scripts/
│   ├── seed_hefei_database.py          # 建库
│   ├── audit_hefei_database.py         # 审计
│   ├── export_hefei_case_package.py    # 导出案例回放包
│   └── archive_hefei_sources.py        # 来源归档（URL + SHA-256）
├── data/
│   ├── hefei_mvp/                      # 冻结的 MVP 数据包
│   ├── historical_cases/               # 案例回放包（pre_cutoff / withheld / targets）
│   └── source_archive/                 # 原始来源归档
├── tests/
│   └── test_investment_*.py
└── docs/                               # 产品、数据工程与审计文档
```

## 数据说明

`data/hefei_industry_simulation.sqlite3` 由 `scripts/seed_hefei_database.py` 生成，是唯一数据来源。所有数值分为三类并在界面标注：

- `现实规则`：有可追溯的政策或统计来源；
- `场景设定`：为推演而输入的城市与事件参数（如财政点数、企业反应概率）；
- `模拟结果`：当前规则、随机种子和主体样本下的输出。

系统不预测真实城市一定发生什么，而是在行动前暴露方案的结构性盲区。

## 能力边界

| ✅ 能做 | ❌ 不能做 |
|---|---|
| 揭示决策路径与机制方向 | 校准过的点预测 |
| 二阶效应与路径依赖提示 | 因果证明 |
| 方案相对排序 | 绝对量级 |
| 群体分布 | 个体预测 |

## 许可

当前仓库尚未指定开源许可证，默认保留所有权利。引入第三方代码或服务前，需单独核对其许可和署名要求。
