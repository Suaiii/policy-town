# 剧情编写指南（Scenario Authoring）

本系统只有一个创作入口：**剧情文件**。人设与剧情写在同一份文件里互相约束——
改剧情即改角色。Demo 的运行只需要两样东西：一份剧情文件 + 一个 LLM API Key（可选）。

## 一、它如何工作

```
剧情文件（frontend/scenarios/*.scenario.ts）
  ├─ meta       剧情标题与背景
  ├─ roles      角色人设（身份/动机/策略/边界/语言风格 + 图坐标）
  ├─ relations  角色间关系（支持 support / 牵制 check / 依赖 depend / 规避 avoid）
  ├─ edges      关系图上可见的连线
  └─ rounds     分轮剧情（每轮 = 场景 + 各角色事件 beat）
        │
        ▼  编译器  frontend/src/features/scenario/compiler.ts
  Agent 档案 + 关系图节点/边（关系网页面立即反映）
        │
        ▼  推演引擎 frontend/src/features/scenario/simulation.ts
  页面右上角"▶ 推进一轮"：
  · 无 API Key → 逐字回放剧情脚本，状态/记忆逐轮点亮
  · 有 API Key → LLM 按人设润色生成（失败自动回退脚本）
```

## 二、写一份新剧情

复制 `frontend/scenarios/nanshan-talent.scenario.ts`，改五段内容：

1. **meta**：`id`（唯一）、`title`、`premise`（一句话背景，会进 LLM prompt）。
2. **roles**：每个角色一段。注意：
   - `kind`：`government / enterprise / talent / institution`，决定节点分组；
   - `persona` 五个字段会**逐字**进入 Agent 档案的"系统提示词"，请当正式设定写；
   - `position` 是关系图世界坐标（1600×950），确定性布局；
   - `portrait` 可省略，UI 会自动走图标/空状态；
   - 机构类角色补 `summary / attributes / icon`。
3. **relations**：`from → to` 单向描述，四选一类型 + 一句话说明。会在档案卡
   "关系上下文"中展示，点击可高亮连线并过滤双方记忆。
4. **edges**：图上连线，`name` 是关系名，`fact` 是悬停说明。
5. **rounds**：推演剧本。每轮每条 beat：
   - `actor`：事件归属角色（记忆记在他名下）；
   - `summary`：发生了什么；`stance`：support / oppose / cautious / neutral；
   - `relatedAgentIds`：影响对象（驱动"只看与此人有关的记忆"）；
   - `decision`：此事件触发的决策（可选）；
   - `statusAfter`：该轮后此角色的"当前状态"（可选，档案卡头部展示）。

**纪律**：所有 id 必须存在于 `roles`；round 编号不重复。保存后编译器与测试
会自动校验（`validateScenario`），引用写错会直接报出来。

## 三、切换剧情

改 `frontend/src/features/scenario/activeScenario.ts` 中的一行导入即可。
（后续可做多剧情选择器。）

## 四、接入 LLM

在环境变量中配置（如项目根目录 `.env.local`）：

```bash
VITE_LLM_API_KEY=sk-...
# 可选：
VITE_LLM_ENDPOINT=https://api.openai.com/v1/chat/completions
VITE_LLM_MODEL=gpt-4o-mini
```

任何 OpenAI 兼容的 chat completions 接口都可用。LLM 拿到的输入是：
剧情背景 + 本轮出场角色人设 + 本轮剧情大纲，输出受人设约束的行动记录；
大纲的立场与结论不会被改变（LLM 只润色细节），接口失败时静默回退到脚本。

## 五、验证

```bash
npm test     # 含剧情校验、编译器、推演引擎用例
npx tsc      # 类型检查
```

页面上：打开 `#/relationship`，右上角 `▶ 推进一轮`，点开任意角色档案卡，
应看到记忆时间线按 R1→Rn 逐轮点亮、"当前状态"随 `statusAfter` 更新。
