# 大厂 Town（Policy Town）

面向就业政策发布前压力测试的多智能体推演内核。三方 Agent 负责有理由的策略响应，规则引擎负责可复核的人数、流量与指标，检测器负责机械触发建议。

## 主体架构联调

```bash
python -m policytown validate
python -m policytown run draft --rounds 2
python -m policytown report draft
python -m unittest tests.test_kernel -v
```

队友对接说明见 `docs/INTEGRATION_ARCHITECTURE.md`，方案统一注册于 `scenarios/manifest.json`。前端与具体 Agent 均不是核心内核的运行依赖。

## 当前交付

- `contracts/schema.py`：契约 v1.2，定义政策、企业动作、员工动作和前端快照。
- `mock/build_mock.py`：生成 8 轮 A/B 世界线快照。
- `mock/verify.py`：检查 H0 预设的关键演示现象。
- `data/run_A`：无管制基线，共 8 轮。
- `data/run_B`：稳就业管制世界线，共 8 轮。
- `CONTRACT.md`：H0 契约冻结公告与联调约定。
- `docs/产品框架_v3.md`：当前产品与 5 分钟演示方案。
- `docs/当前执行口径.md`：文档优先级和当前交付边界。

## 快速开始

要求 Python 3.10 或更高版本。

```bash
python -m pip install -r requirements.txt
python mock/build_mock.py
python mock/verify.py
python -m policytown firm-reality --output-dir data/run_firm_A_narrow
python scripts/run_m_harness.py
```

M 技术主线的 `firm-reality` 入口会校验公开证据包，运行匿名企业 A 的 A0–A3 对照与四轮信念轨迹，并输出可复核报告。企业 Agent 仅输出方向性 `FirmIntent`，所有人数由确定性的 `RuleLedger` 结算。

前端仅需读取：

```text
data/run_{A,B}/round_1.json ... round_8.json
```

## 目录结构

```text
.
├── CONTRACT.md
├── contracts/
│   └── schema.py
├── data/
│   ├── run_A/
│   └── run_B/
├── mock/
│   ├── build_mock.py
│   └── verify.py
└── docs/
    ├── 产品框架_v3.md
    ├── 价值主张与能力边界.md
    ├── 当前执行口径.md
    ├── DELIVERY_H0.md
    ├── archive/
    └── references/
```

## 数据说明

`data/` 中的数据是用于前端联调和产品演示的 Mock 快照，不是现实预测或实验结论。字段名已经按照 `CONTRACT.md` 冻结；如需调整，请先升级契约版本并同步所有消费方。

## 项目状态

H0 已完成：契约、Mock 生成器、A/B 快照和验证脚本。下一阶段将接入真实推演引擎和前端政策驾驶舱。

## 许可

当前仓库尚未指定开源许可证，默认保留所有权利。引入第三方代码或服务前，需要单独核对其许可和署名要求。
