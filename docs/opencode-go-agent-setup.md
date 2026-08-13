# OpenCode Go Agent 接入

本地 Agent 已预留 OpenAI-compatible provider。当前接入目标是 OpenCode Go 的
`deepseek-v4-flash`，仅仅负责生成四部门的结构化判断文本；财政点数、最终同意金额、
状态变化和两本账仍由确定性规则引擎结算。

## 配置

复制 `.env.example` 为 `.env.local`，填写：

```text
LLM_PROVIDER=custom
LLM_API_URL=https://opencode.ai/zen/go/v1
LLM_API_KEY=<OpenCode Go API key>
LLM_MODEL=deepseek-v4-flash
INVESTMENT_AGENT_LLM=1
```

浏览器剧情润色使用对应的 `VITE_*` 变量。Convex 的认知记忆还需要单独的向量模型，
因为 OpenCode Go chat endpoint 仅仅提供对话模型，不自动提供 embeddings：

```text
EMBEDDING_API_URL=https://api.siliconflow.cn/v1
EMBEDDING_API_KEY=<embedding provider key>
EMBEDDING_MODEL=BAAI/bge-m3
```

## 连接验证

```powershell
$env:NODE_OPTIONS='--experimental-vm-modules'
npx jest convex/util/llm.test.ts --runInBand
npx tsc --noEmit
```

已验证 OpenCode Go `/v1/models` 返回 `deepseek-v4-flash`，并完成一次
`/v1/chat/completions` 请求。服务端密钥不要提交到 Git；本仓库的 `.env.local` 已被
`.gitignore` 忽略。由于密钥曾在聊天中出现，建议在服务端轮换。

投资推演的真实 Agent 闭环使用：

```powershell
python scripts/run_s1_agent_loop_live.py
```

该命令会让四部门初审、分歧质询和企业核验回应真正调用 OpenCode Go。模型输出仍须通过
Pydantic Schema、冻结证据白名单和截止日校验；失败时单个 Agent 回退，不影响规则结算。
