# 内嵌关系网 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在合肥产业投资决策沙盘中嵌入并保留素白关系网 UI，使政府—企业关系及边上的环境注释从同一 bridge 事件日志实时投影。

**Architecture:** 将 5173 的素白关系网组件作为视觉与交互基线迁入沙盘，图数据由一个边界清晰的 adapter 从 `GraphSnapshot` 转换而来。沙盘的关键状态跃迁经纯映射函数写入 bridge 事件存储；bridge 再将事件投影为节点只含政府/企业、环境信息附在边标签上的关系网快照。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、现有 Node bridge 及 `packages/events` 事件契约。

---

## 文件结构

- Create: `src/integration/relationshipEvents.ts` — 纯函数，将沙盘状态跃迁映射为 `SandboxEventInput[]`。
- Create: `src/integration/relationshipEvents.test.ts` — 映射的单元测试。
- Create: `src/components/relationship-network/graphAdapter.ts` — bridge 图快照到素白关系网展示模型的唯一适配层。
- Create: `src/components/relationship-network/graphAdapter.test.ts` — 节点过滤、边注释和布局的单元测试。
- Create: `src/components/relationship-network/RelationshipNetworkView.tsx` — 从 5173 迁入的素白关系网视图；只依赖展示模型与回调。
- Create: `src/components/relationship-network/relationship-network.css` — 从 5173 抽取、作用域限制到 `.rn-app` 的原 UI 样式。
- Modify: `src/components/RelationNetwork.tsx` — 由深色 HTML 注入 demo 改为渲染素白视图；保留宿主的 active 生命周期。
- Modify: `src/integration/agentApi.ts` — 增加 `appendSandboxEvent`，在写入成功后派发 `relationship-network:updated` 浏览器事件。
- Modify: `src/App.tsx` — 在提交条件单、企业响应、冲击揭示与结算等状态跃迁后异步同步事件，且不阻断沙盘。
- Modify: `packages/events/src/index.ts` — 将 `shock` 投影为政府—企业边上的“影响”注释，禁止生成环境事件节点。
- Modify: `packages/events/src/index.test.ts` — 覆盖环境事件不产生节点且写入边标签。
- Modify: `src/components/RelationNetwork.tsx` tests or Create: `src/components/RelationNetwork.test.tsx` — 覆盖激活和同步通知触发刷新。

### Task 1: 修正事件图投影，使环境永远不成为节点

**Files:**
- Modify: `packages/events/src/index.ts:100-190`
- Modify: `packages/events/src/index.test.ts`

- [ ] **Step 1: 写入失败测试，声明 shock 只生成边注释**

```ts
it('projects a shock as an annotation edge without an environment node', () => {
  const graph = projectGraph([ev(1, {
    type: 'shock', actor: 'gov', target: 'enterprise-a',
    payload: { label: '信贷与需求转弱' },
  })])

  expect(graph.nodes.map((node) => node.kind)).not.toContain('event')
  expect(graph.edges).toContainEqual(expect.objectContaining({
    source: 'gov', target: 'enterprise-a', relation: '影响', label: '信贷与需求转弱',
  }))
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- packages/events/src/index.test.ts`

Expected: FAIL；当前实现会产生 `kind: 'event'` 节点。

- [ ] **Step 3: 用最小投影替换 shock 特例**

在 `applyEvent` 中以 `makeEdge` 的同等结构创建 `source: ev.actor`、`target: ev.target`、`relation: '影响'` 的边；标签取 `payload.label`，不创建 `ev-${seq}` 节点或 `evlink-*` 边。保留其他 `EventType` 的原有行为。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- packages/events/src/index.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/events/src/index.ts packages/events/src/index.test.ts
git commit -m "feat: project environment as relationship annotations"
```

### Task 2: 建立可测试的“沙盘状态 → 关系事件”映射

**Files:**
- Create: `src/integration/relationshipEvents.ts`
- Create: `src/integration/relationshipEvents.test.ts`

- [ ] **Step 1: 写入失败测试，覆盖条件单与环境注释**

```ts
it('maps an allocation into investment, support, and environment events', () => {
  const before = openAllocation(openAnalysis(enterApplications(initialState)))
  const after = toggleSupportTool(updateAllocation(before, 'enterprise-a', 42), 'investment')
  const events = relationshipEventsForTransition(before, after, 'allocation-updated')

  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'invest', actor: 'gov', target: 'enterprise-a', payload: expect.objectContaining({ amount: 42 }) }),
    expect.objectContaining({ type: 'subsidize', actor: 'gov', target: 'enterprise-a' }),
    expect.objectContaining({ type: 'shock', actor: 'gov', target: 'enterprise-a', payload: expect.objectContaining({ label: '信贷与需求转弱' }) }),
  ]))
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/integration/relationshipEvents.test.ts`

Expected: FAIL；映射函数尚不存在。

- [ ] **Step 3: 实现纯映射函数**

实现 `relationshipEventsForTransition(before, after, reason)`：比较每家企业的 allocation、supportTools、action、lastSettlementDelta 以及 `after.event`。事件统一使用 `{ actor: 'gov', target: enterprise.id, at: stages[after.stageIndex].date, visibility: 'public', reveal_at: null }`；财政配置映射为 `invest`，工具映射为 `subsidize` 或 `approve`，企业响应、市场背景与结算影响映射为带 `payload.label` 的 `shock`。当对应字段未变化时返回空数组。

- [ ] **Step 4: 增加幂等测试并运行全部映射测试**

```ts
it('returns no events for an unchanged transition', () => {
  expect(relationshipEventsForTransition(initialState, initialState, 'no-op')).toEqual([])
})
```

Run: `npm test -- src/integration/relationshipEvents.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/integration/relationshipEvents.ts src/integration/relationshipEvents.test.ts
git commit -m "feat: map sandbox changes to relationship events"
```

### Task 3: 提供事件写入客户端与同步通知

**Files:**
- Modify: `src/integration/agentApi.ts:1-70`
- Create: `src/integration/agentApi.test.ts`

- [ ] **Step 1: 写入失败测试，验证成功后通知关系网**

```ts
it('posts a sandbox event and dispatches a relationship refresh notification', async () => {
  const received = vi.fn()
  window.addEventListener('relationship-network:updated', received)
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

  await expect(appendSandboxEvent(validEvent)).resolves.toBe(true)
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:5274/api/actions', expect.objectContaining({ method: 'POST' }))
  expect(received).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/integration/agentApi.test.ts`

Expected: FAIL；`appendSandboxEvent` 尚不存在。

- [ ] **Step 3: 实现最小客户端**

在 `agentApi.ts` 导出 `appendSandboxEvent(event: SandboxEventInput): Promise<boolean>`。向 `${BRIDGE_BASE}/api/actions` POST JSON，成功时 `window.dispatchEvent(new CustomEvent('relationship-network:updated'))` 并返回 `true`；超时、非 2xx 或异常时返回 `false`，不抛出。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/integration/agentApi.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/integration/agentApi.ts src/integration/agentApi.test.ts
git commit -m "feat: publish relationship event updates"
```

### Task 4: 迁入素白关系网并建立 bridge 图适配边界

**Files:**
- Create: `src/components/relationship-network/graphAdapter.ts`
- Create: `src/components/relationship-network/graphAdapter.test.ts`
- Create: `src/components/relationship-network/RelationshipNetworkView.tsx`
- Create: `src/components/relationship-network/relationship-network.css`
- Modify: `src/components/RelationNetwork.tsx`

- [ ] **Step 1: 写入失败测试，锁定展示模型契约**

```ts
it('keeps only government and companies and exposes environment labels on edges', () => {
  const model = toRelationshipViewModel({ schemaVersion: '0.1', revision: 2, nodes: [gov, company, eventNode], edges: [impactEdge] })
  expect(model.nodes.map((node) => node.kind)).toEqual(['Government', 'Project'])
  expect(model.edges[0]).toMatchObject({ fact: '信贷与需求转弱', fact_type: '影响' })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/relationship-network/graphAdapter.test.ts`

Expected: FAIL；adapter 尚不存在。

- [ ] **Step 3: 实现图适配器**

实现 `toRelationshipViewModel(snapshot)`：保留 `government` 和 `company`；在视图模型中分别映射成 5173 UI 的 `Government` 与 `Project`，使用确定性的固定坐标布局；每条边的 `fact_type` 取 `relation`，`fact` 取 `label ?? relation`。不从 payload 或 snapshot 生成第三类节点。

- [ ] **Step 4: 迁入原素白 UI，最小化数据层改动**

从 `/Users/hubin/Documents/ChatGPT/政务agent/frontend/src/features/relationship/RelationshipGraph.tsx` 和其图层样式提取当前 5173 的白底 DOM、SVG、拖拽、缩放、搜索、筛选、适应视图与标签开关。将固定 fixture 导入替换为 `model` prop；删除仅适用于人物 Agent 档案的抽屉与音效依赖。样式加 `.rn-app` 根选择器，避免沙盘深色全局样式渗入。

将 `RelationNetwork` 改为管理 `fetchGraph()`、初次加载、激活刷新和 `relationship-network:updated` 监听，并把转换后的 model 传给 `RelationshipNetworkView`。失败时保留最后一次成功模型，在白底画布上显示“关系数据暂未同步”。

- [ ] **Step 5: 运行适配器测试与现有样式隔离测试**

Run: `npm test -- src/components/relationship-network/graphAdapter.test.ts src/components/relation-network/prefixCss.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/RelationNetwork.tsx src/components/relationship-network src/components/relation-network
git commit -m "feat: embed white relationship network"
```

### Task 5: 在沙盘状态跃迁后写入关系事件

**Files:**
- Modify: `src/App.tsx:185-275`
- Create: `src/integration/relationshipSync.ts`
- Create: `src/integration/relationshipSync.test.ts`

- [ ] **Step 1: 写入失败测试，验证写入不阻塞 UI 状态**

```ts
it('commits transition state even when event persistence fails', async () => {
  appendSandboxEventMock.mockResolvedValue(false)
  const next = await syncRelationshipTransition(before, after, 'allocation-updated')
  expect(next).toBe(false)
  expect(after.phase).toBe('allocation')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/integration/relationshipSync.test.ts`

Expected: FAIL；同步协调函数尚不存在。

- [ ] **Step 3: 实现非阻断同步协调函数**

实现 `syncRelationshipTransition(before, after, reason)`：调用 `relationshipEventsForTransition`，顺序调用 `appendSandboxEvent`，任何一次失败时返回 `false`，不抛出。无事件时返回 `true`。在 `App.tsx` 创建 `commitStateTransition(reason, updater)`，先 `setState` 提交 `after`，再 `void syncRelationshipTransition(before, after, reason)`；用它替换条件单应用、Agent 驱动响应、冲击揭示和结算的状态写入点。

- [ ] **Step 4: 运行同步与模拟测试**

Run: `npm test -- src/integration/relationshipSync.test.ts src/game/simulation.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx src/integration/relationshipSync.ts src/integration/relationshipSync.test.ts
git commit -m "feat: synchronize sandbox decisions to relationship graph"
```

### Task 6: 端到端验证与构建验收

**Files:**
- Modify: `bridge/tests/events-api.test.mjs`
- Modify: `README.md`（仅增加启动 bridge 与前端的关系网同步说明）

- [ ] **Step 1: 写入 bridge API 失败测试**

```js
test('environment annotation is returned on a government-to-company graph edge', async () => {
  await postEvent({ type: 'shock', actor: 'gov', target: 'enterprise-a', payload: { label: '信贷与需求转弱' } })
  const graph = await getGraph()
  assert.equal(graph.nodes.some((node) => node.kind === 'event'), false)
  assert.equal(graph.edges.some((edge) => edge.source === 'gov' && edge.target === 'enterprise-a' && edge.label === '信贷与需求转弱'), true)
})
```

- [ ] **Step 2: 运行 bridge 测试确认失败**

Run: `node --test bridge/tests/events-api.test.mjs`

Expected: FAIL before Task 1 behavior is available in the bridge test fixture.

- [ ] **Step 3: 执行测试、构建与浏览器验收**

Run:

```bash
npm test
npm run build
node --test bridge/tests/events-api.test.mjs
```

Expected: all commands PASS.

在 `http://localhost:5273/` 中完成一次条件单、企业响应和结算；打开“关系网”标签，确认：页面未跳转、白底 UI 完整、仅有政府与三家企业节点、边上出现“信贷与需求转弱”等环境注释。返回沙盘并再次操作，重新打开关系网后确认图更新。

- [ ] **Step 4: 提交**

```bash
git add bridge/tests/events-api.test.mjs README.md
git commit -m "test: verify embedded relationship network sync"
```

## 自检

- 覆盖规格中“同页内嵌、素白 UI、同一 bridge 日志、仅政府和企业节点、环境作为边注释、非阻断失败、激活与更新时刷新”的每一项要求。
- 所有数据转换均有单元测试；bridge 与浏览器流程分别验证服务端和用户可见结果。
- 图模型字段在 Task 4 固定为 `toRelationshipViewModel` 的输出，后续任务不绕过该边界。
