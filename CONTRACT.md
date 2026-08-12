# 契约冻结公告 · v1.2

**契约 v1.2 已冻结，字段名不许改。改字段先找 P0，我在群里广播，版本号 +0.1。
私自改字段导致的联调事故，谁改谁修。**

---

## 一、你们现在就能开工

```
policy-town/
├── contracts/schema.py      ← 四个模型，所有人的唯一真相
├── mock/build_mock.py       ← 手写 8 轮数据的生成器
├── mock/verify.py           ← 一键检查三个现象还在不在
└── data/
    ├── run_A/round_1..8.json   无管制基线
    └── run_B/round_1..8.json   直接管制（R3 出台）
```

**P3 前端**：只读 `data/run_{A,B}/round_*.json`，glob 就行。不要调任何后端接口。
H6 换真数据时你只改一个路径。

**P2 引擎**：按 `contracts/schema.py` 写。`mock/build_mock.py` 里的 `compute()`
已经把匹配规则和指标口径实现了一遍，你可以直接抄过去改，也可以推翻重写，
**但输出的 Metrics 字段和口径要一致**，否则 A/B 组没法对比。

**P1**：你对外只需要吐两个数——`sentiment_heat` 和 `group_mood`（都是 0-1）。
现在 mock 里用的是外生数组，你通了我直接替换。**你没通不阻塞任何人。**

---

## 二、跑一下

```bash
cd policy-town
pip install pydantic
python mock/build_mock.py    # 生成 16 个 snapshot
python mock/verify.py        # 检查三个现象
```

---

## 三、mock 里埋了什么（Demo 全靠它们）

| # | 现象 | 在哪个字段 | 现在的数 |
|---|---|---|---|
| ① | **裁员批次尖峰卡在 19 人** | `firms[].layoff_batches` | run_B 里 19 人出现 11 次，run_A 完全无聚集 |
| ② | **B 厂招聘腰斩** ★ | `firms[1].hiring_campus + hiring_social` | 95 → 41 |
| ③ | 因果链证据 | `firms[1].expected_future_firing_cost` | 0.20 → 0.84 |
| ④ | **外包那一支变粗** | `flows` 里 `A → D` | R6 有 87 人 |
| ⑤ | **传统技能进不去 C 厂** | `flows` 里 `market → C` | R6：AI 进去 12 人，传统只有 1 人 |
| ⑥ | 四部门 KPI 反向 | `metrics.kpi` | 人社 0.27→0.46 涨，财政/产业/监管全塌 |
| ⑦ | 隐性失业 | `metrics.hidden_unemployment` | 108 → 236 |
| ⑧ | 联席会妥协记录 | `policy.compromise_log` | 4 条，R3 起有 |

**最好用的一句演示台词，数据已经支持了**：

> 官方失业率 A 组 6.7%，B 组 6.2% —— **管制之后失业率更好看了**。
> 但总就业 8204 → 8110，隐性失业 108 → 236。
> **人少了，数字好了。**

---

## 四、两个口径坑，已经踩过了，别再踩

**① 外包商 D 不能有独立入口。**
D 的 `hiring_social` 是**承接能力上限**，不是新增人头。A 打包过来的人已经占掉一部分，
剩下的才能从市场再吸。写成独立入口的话 D 会凭空长人，总就业算出来 B 组反而更好。

**② 必须有应届生池（`entrants` 节点）。**
如果 B 厂只从"被裁的人"里招，那 A 少裁 = 池子小 = B 不招也无所谓，
**监管悖论在数字上会消失**。现实里 B 厂砍的主要是校招，那批人本来就不在池子里。
每轮 60 个应届生，`hiring_campus` 接不住的直接进失业。
这一环是整个悖论成立的地方，`FlowNode` 里的 `entrants` 不许删。

---

## 五、字段里三个不许砍的

任何降级方案动到这三个，先问我：

- `FirmAction.hiring_campus / hiring_social` —— 监管悖论的唯一证据
- `WorkerAction.skill_type` —— 结构性错配的载体
- `Policy.compromise_log` —— 溯源面板最好看的东西

---

## 六、下一步（P0 自己的 H1）

四部门提案 prompt。三条硬要求已经写进 schema 注释：

1. 每个 agent 必须输出 `reasoning`，prompt 里要求"先说权衡和犹豫，再给结论"
2. 企业 prompt 必须显式给出`expected_future_firing_cost`这个考量项，
   否则 B 厂不会自己想到"未来裁人成本"，监管悖论跑不出来
3. 四部门 prompt **互相不许看对方的 KPI**，冲突要留到联席会才暴露
