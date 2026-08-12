# H0 第一批交付清单

整理日期：2026-08-12

## 输入文件与落位

| 原始交付 | 工作区位置 | 处理 |
|---|---|---|
| `policy-town-H0.tar.gz` | 仓库根目录下的规范结构 | 解包并排除压缩包中误生成的字面量花括号空目录 |
| `CONTRACT.md` | `CONTRACT.md` | 与压缩包版本一致，仅保留一份 |
| `schema.py` | `contracts/schema.py` | 与压缩包版本一致，仅保留一份 |
| `build_mock.py` | `mock/build_mock.py` | 与压缩包版本一致，仅保留一份 |
| `round_4.json` | `data/run_B/round_4.json` | 与压缩包版本一致，仅保留一份 |

四个单独文件均已通过 SHA-256 比较，确认与压缩包中的对应文件完全一致。

## 整理结果

- 契约和代码保留在仓库根目录的规范路径。
- 当前产品文档放入 `docs/`。
- v2 历史方案放入 `docs/archive/`。
- 自动会议纪要放入 `docs/references/`，仅作背景参考。
- 临时解包目录由 `.gitignore` 排除，不进入版本控制。

## 验证记录

```bash
python -m compileall -q contracts mock
python mock/verify.py
```

验证结果：

- Python 3.12 编译通过；
- A/B 两条世界线各 8 轮数据可读取；
- 19 人批次聚集、B 厂招聘收缩、外包占比和隐性失业等 H0 演示现象可由验证脚本复现。

## 注意

H0 数据是 Mock 联调快照，仅用于产品开发和演示，不代表现实预测或正式实验结论。
