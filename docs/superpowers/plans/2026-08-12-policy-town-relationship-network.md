# Policy Town Relationship Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing profile-card relationship graph with a neutral, data-driven 18-agent Policy Town network and anime dialogue interaction.

**Architecture:** Keep the current route and SVG viewport. Replace the fixture with neutral group/template/status data and no initial edges; render deterministic group zones. A focused dialogue component owns all selected-node information, so future graph payloads replace data without creating profiles or business-specific UI branches.

**Tech Stack:** React 18, TypeScript, SVG, Tailwind CSS, Jest.

---

### Task 1: Establish a neutral graph fixture

**Files:**
- Modify: `frontend/src/features/relationship/types.ts`
- Modify: `frontend/src/features/relationship/graph.fixture.ts`
- Modify: `frontend/src/features/relationship/agentProfiles.fixture.test.ts`

- [ ] **Step 1: Write failing fixture tests**

Assert that the fixture contains four government, four enterprise and ten worker nodes; has zero initial edges; and every node supplies only generic group/template/status fields.

- [ ] **Step 2: Run the fixture test to verify it fails**

Run: `npm test -- --runInBand frontend/src/features/relationship/agentProfiles.fixture.test.ts`

Expected: FAIL because the current fixture contains seven former project-government nodes and relation edges.

- [ ] **Step 3: Implement the generic types and 18-node fixture**

Use `NodeKind = 'Government' | 'Enterprise' | 'Worker'`; create named departments and enterprises plus `员工 01` through `员工 10`. Keep `graphEdges` empty and assign deterministic group-zone positions.

- [ ] **Step 4: Run the fixture test to verify it passes**

Run: `npm test -- --runInBand frontend/src/features/relationship/agentProfiles.fixture.test.ts`

Expected: PASS.

### Task 2: Replace card interaction with an anime dialogue

**Files:**
- Create: `frontend/src/features/relationship/AgentDialogue.tsx`
- Modify: `frontend/src/features/relationship/RelationshipGraph.tsx`

- [ ] **Step 1: Write a failing source-level interaction test**

Assert the relation screen imports `AgentDialogue`, does not import the drawer/hover-card modules, and does not attach node dragging handlers.

- [ ] **Step 2: Run the interaction test to verify it fails**

Run: `npm test -- --runInBand tests/relationship-network-prototype.test.mjs`

Expected: FAIL because the former UI imports drawer/preview and starts a node drag.

- [ ] **Step 3: Implement the dialogue and simplify graph interaction**

Render a bottom RPG dialogue box when a node is selected. Remove profiles, hover previews, drawer, ripples, fisheye and node drag. Preserve blank-canvas pan, wheel zoom, search, group filtering and selection highlighting.

- [ ] **Step 4: Run the interaction test to verify it passes**

Run: `npm test -- --runInBand tests/relationship-network-prototype.test.mjs`

Expected: PASS.

### Task 3: Verify the route

**Files:**
- No production-file changes required.

- [ ] **Step 1: Run targeted relationship tests**

Run: `npm test -- --runInBand frontend/src/features/relationship/agentProfiles.fixture.test.ts tests/relationship-network-prototype.test.mjs`

- [ ] **Step 2: Run the full test suite and production build**

Run: `npm test -- --runInBand && npm run build`

- [ ] **Step 3: Open `http://localhost:5199/policy-town/#/relationship` and visually inspect**

Confirm group zones, 18 template nodes, zero default edges, no cards/drawer and a dialogue box after node selection.
