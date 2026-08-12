# MiroFish Relationship Network HTML Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained interactive HTML prototype for a MiroFish-compatible relationship network in the approved pixel-portrait visual style.

**Architecture:** One HTML file contains semantic layout, scoped CSS, an SVG graph surface and vanilla JavaScript. A local fixture follows the existing MiroFish graph payload field names; render functions convert it into interactive nodes, edges, filtering, selection and a details drawer.

**Tech Stack:** HTML, CSS, inline SVG, vanilla JavaScript.

---

### Task 1: Define fixture data and the stable graph scene

**Files:**
- Create: `relationship-network-prototype.html`

- [ ] **Step 1: Define MiroFish-shaped data and deterministic positions**

Create entities with the fields below. Use the selected centre entity and at least one node for every supported type.

```js
const nodes = [{
  uuid: 'smic',
  name: '中芯国际（SMIC）',
  labels: ['Entity', 'Company'],
  summary: '中国领先的晶圆代工企业。',
  attributes: { industry: 'Foundry', role: '中心企业' },
  x: 760,
  y: 440,
}];
const edges = [{
  uuid: 'edge-smic-001',
  source_node_uuid: 'smic',
  target_node_uuid: 'ministry-industry',
  name: '产业扶持',
  fact_type: 'PolicySupport',
  fact: '主管部门通过专项政策支持先进制程能力建设。',
}];
```

- [ ] **Step 2: Add edge and node renderers**

```js
function renderGraph() {
  edgeLayer.replaceChildren(...edges.map(renderEdge));
  nodeLayer.replaceChildren(...nodes.map(renderNode));
}
function renderEdge(edge) {
  const source = nodeById.get(edge.source_node_uuid);
  const target = nodeById.get(edge.target_node_uuid);
  return svgEl('path', { d: `M ${source.x} ${source.y} L ${target.x} ${target.y}`, class: 'edge' });
}
```

- [ ] **Step 3: Verify the static scene**

Open `relationship-network-prototype.html` in a browser. Expected: the centre company, people, institutions, legend and dashed relationships are visible without console errors.

### Task 2: Implement full graph interactions

**Files:**
- Modify: `relationship-network-prototype.html`

- [ ] **Step 1: Add selection and one-hop focus state**

```js
function selectNode(node) {
  selectedNodeId = node.uuid;
  const neighbors = neighborIds(node.uuid);
  document.querySelectorAll('[data-node-id]').forEach((el) => {
    el.classList.toggle('is-muted', !neighbors.has(el.dataset.nodeId));
    el.classList.toggle('is-selected', el.dataset.nodeId === node.uuid);
  });
  document.querySelectorAll('[data-edge-id]').forEach((el) => {
    el.classList.toggle('is-active', edgeTouches(el.dataset.edgeId, node.uuid));
  });
  renderDrawer(node);
}
```

- [ ] **Step 2: Add pan, zoom and node dragging**

```js
viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  scale = clamp(scale + (event.deltaY < 0 ? 0.1 : -0.1), 0.55, 1.8);
  applyTransform();
}, { passive: false });
```

Use pointer events to pan the canvas when no node is targeted, and update the dragged node position plus its incident edge paths when a node is targeted.

- [ ] **Step 3: Add type filters, search and reset**

```js
function setTypeEnabled(type, enabled) {
  enabledTypes[type] = enabled;
  renderGraph();
}
function resetView() {
  selectedNodeId = null;
  scale = 1;
  translate = { x: 0, y: 0 };
  renderGraph();
  closeDrawer();
}
```

- [ ] **Step 4: Verify interaction acceptance cases**

Manually confirm: wheel zoom remains centred on the graph; blank-canvas drag pans; a node drag changes its connected edge endpoints; a type filter hides both its nodes and orphan edges; search selects and centres a matching node; selection opens details and highlights only its one-hop relations; reset restores the overview.

### Task 3: Polish the visual hierarchy and deliver the prototype

**Files:**
- Modify: `relationship-network-prototype.html`

- [ ] **Step 1: Apply the approved design tokens**

```css
:root {
  --ink: #172b46;
  --coral: #ff7768;
  --company: #42ada8;
  --government: #4d7dcc;
  --media: #9b75c7;
  --investor: #e8a33a;
}
```

Implement a subtle dot-grid background, pixel avatar treatment, institutional icon cards, lightweight dashed edges, and low-opacity muted elements.

- [ ] **Step 2: Check responsive layout**

At desktop width keep title, tools, legend and 360px details drawer visible. At widths below 900px collapse the control panel and show the details drawer as a bottom sheet.

- [ ] **Step 3: Deliver**

Provide an absolute file link to `relationship-network-prototype.html` and a local preview URL. State that fixture fields mirror the existing MiroFish `GraphPanel.vue` input and no backend change was made.
