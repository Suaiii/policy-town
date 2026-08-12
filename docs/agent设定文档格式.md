# Agent 设定文档格式与运行手册

本系统是“交付一份文档 → 小镇世界跑起来”的唯一入口：你按本格式写一份 Agent 设定
文档，跑一条命令解析写入，这些角色就会作为**认知 Agent**（斯坦福 generative_agents
架构：感知 → 检索 → 规划 → 执行 → 反思 → 对话）在小镇里生活、对话、积累记忆并
推进事件。

```
Agent 设定文档（.md / .docx）
      │  node scripts/parse_agent_doc.mjs <文档路径>
      ▼
data/customCharacters.ts（自动生成的角色数据）
      │  npx convex run init（世界为空时生成 Agent）
      ▼
小镇世界 + 认知大脑（worldStatus.cognitiveEnabled = true）
      │
      ▼
前端小镇页面：角色移动、搭话、对话、记忆、按动机推进日常
```

## 一、文档格式

每个角色一个 `##` 小节，标题为 `姓名｜职务·派系`，正文用列表写字段：

```markdown
# 我的小镇剧情（标题随意）

## 世界观
（可选）写在这里的背景会注入每个 Agent 的认知，例如时代、地点、核心矛盾。

## 严国强｜县委书记·激进改革派
- **职务**：江州省南山县委书记
- **原型**：李达康式强执行力 + 合肥模式推手（可选）
- **身份**：你是……（第一/第二人称正式设定）
- **动机**：追求政绩最大化与产业升级……（**必填**，驱动日常计划与目标）
- **策略**：（可选，多条直接换行写编号）
  1. 主动使用政府引导基金撬动重大产业项目。
  2. 面对行政阻力时强力施压。
- **边界**：不能显性违反上级红线……（可选）
- **语言风格**：强势、果断、短句。口头禅：“拿不出方案，就换能干的人上！”（可选，影响对话台词）
- **阅读偏好**：《置身事内》……（可选）

## 陈世荣｜县长·本土关系网掌门
- **职务**：……
- **动机**：……
```

规则：

- **必填**：姓名（小节标题）+ `动机`。其余字段均可省略。
- **字段别名**：身份=Role/身份设定；动机=Motivation/核心动机；策略=Strategy/决策策略；
  边界=行为边界；语言风格=Style/口头禅。大小写不敏感。
- **非角色小节**（如“角色关系总览”“附录”）没有任何可识别字段时会自动跳过，
  不会变成 Agent。
- 没有 `##` 标题的纯标签式文档（如 docx 转出的 `1. 姓名（职务·派系）` + `[Role] …`
  `[Motivation] …`）同样支持，两种写法可混用。
- `.docx` 文件直接传给解析脚本即可（内部调 macOS 自带 textutil 转换）。

字段如何进入认知大脑：

| 文档字段 | 去向 |
| --- | --- |
| 姓名 | Agent 名字（对话、记忆中互相称呼） |
| 职务/身份/原型/策略/边界/语言风格/阅读偏好 | 拼入 `identity` → scratch traits + 对话 prompt 人设 |
| 动机 | `plan` → 驱动每日规划与行动目标 |
| 世界观小节 | 注入所有角色的 identity 前缀 |

## 二、运行步骤

```bash
# 1. 解析设定文档，写入 data/customCharacters.ts
node scripts/parse_agent_doc.mjs path/to/设定文档.md

# 2. 启动后端 + 前端（首次会初始化 convex）
npm run dev

# 3. 在世界中生成 Agent（仅当世界为空时生效）
npx convex run init

# 4. 开启认知大脑（worldId 见 Convex dashboard 的 worldStatus 表）
npx convex run cognitive/admin:setCognitiveEnabled '{"worldId":"<worldId>","cognitiveEnabled":true}'
```

需要 LLM：认知规划与对话依赖 OpenAI 兼容接口，先配置（如
`npx convex env set OPENAI_API_KEY 'sk-...'`，其他提供商见 `convex/util/llm.ts`）。

**换一份文档重跑**：先清空世界再重建——

```bash
npx convex run testing:wipeAllTables
node scripts/parse_agent_doc.mjs path/to/新文档.md
# 重启 npm run dev 后执行上面的 3-4
```

不加 `--check` 时解析脚本会在成功后直接打印上述后续命令。只想校验文档不写入：

```bash
node scripts/parse_agent_doc.mjs path/to/设定文档.md --check
```

## 三、验证

```bash
npm test     # 含解析器测试（bullet 式 / 标签式 / 校验 / 生成）
npx tsc      # 类型检查
```

参考样例：`docs/各agent设定.md`（bullet 式，解析出严国强/陈世荣/宋平安）。
