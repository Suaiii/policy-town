# Dual-provider LLM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate chat and embedding provider configuration without changing the cognitive-agent interface.

**Architecture:** Keep chat on `getLLMConfig`; resolve a small embedding-only configuration inside the existing LLM module. The memory layer remains unchanged and receives 1024-dimensional vectors from SiliconFlow.

**Tech Stack:** TypeScript, Convex, Jest, OpenAI-compatible HTTP APIs.

---

### Task 1: Add independent embedding configuration

**Files:**
- Create: `convex/util/llm.test.ts`
- Modify: `convex/util/llm.ts`

- [ ] **Step 1: Write failing configuration tests**

```ts
expect(getEmbeddingConfig()).toMatchObject({
  url: 'https://api.siliconflow.cn/v1',
  model: 'BAAI/bge-m3',
  apiKey: 'embedding-key',
});
```

- [ ] **Step 2: Run the focused test and observe failure**

Run: `npm test -- convex/util/llm.test.ts --runInBand`

- [ ] **Step 3: Resolve embeddings from `EMBEDDING_API_*`**

```ts
const config = getEmbeddingConfig();
fetch(config.url + '/embeddings', { headers: embeddingAuthHeaders(config) });
```

- [ ] **Step 4: Run focused and full checks**

Run: `npm test -- convex/util/llm.test.ts --runInBand && npm test -- --runInBand && npx tsc --noEmit`
