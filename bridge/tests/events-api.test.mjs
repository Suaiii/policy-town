import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_PORT = 5278;
const AGENT_PORT = 5279;
const BASE = `http://127.0.0.1:${BRIDGE_PORT}`;

let child;
let ready = false;

function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const resp = await fetch(`${BASE}/api/health`);
        if (resp.ok) {
          const body = await resp.json();
          if (body.agent?.ready && body.events?.ready) return resolve();
        }
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('bridge health timeout'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function postAction(input) {
  const resp = await fetch(`${BASE}/api/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { status: resp.status, body: await resp.json() };
}

async function getGraph(step) {
  const query = step === undefined ? '' : `?step=${step}`;
  const resp = await fetch(`${BASE}/api/graph${query}`);
  return { status: resp.status, body: await resp.json() };
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    detached: true,
    env: {
      ...process.env,
      BRIDGE_PORT: String(BRIDGE_PORT),
      SIM_AGENT_PORT: String(AGENT_PORT),
      SIM_AGENT_STUB: '1',
      EVENTS_DB: ':memory:',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (d) => { logs += d.toString(); });
  child.stderr.on('data', (d) => { logs += d.toString(); });
  try {
    await waitForHealth();
    ready = true;
  } catch (error) {
    console.error(logs);
    throw error;
  }
});

after(() => {
  if (child) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
});

test('health 报告事件日志状态', async () => {
  const resp = await fetch(`${BASE}/api/health`);
  const body = await resp.json();
  assert.equal(body.events.ready, true);
  assert.equal(body.events.latestStep, 0);
});

test('POST /api/actions 追加 invest 事件并分配 seq', async () => {
  const { status, body } = await postAction({
    type: 'invest',
    actor: 'gov',
    target: 'enterprise-a',
    at: 'S1',
    visibility: 'public',
    reveal_at: null,
    payload: { amount: 6000 },
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.event.seq, 1);
  assert.equal(body.event.type, 'invest');
});

test('POST 非法事件返回 400', async () => {
  const { status, body } = await postAction({ type: 'bribe', actor: 'gov', target: 'x' });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('GET /api/graph 返回投影图，含投资边', async () => {
  const { status, body } = await getGraph();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.step, 1);
  assert.equal(body.graph.revision, 1);
  const gov = body.graph.nodes.find((node) => node.id === 'gov');
  assert.equal(gov.kind, 'government');
  const edge = body.graph.edges.find((item) => item.id === 'e-1');
  assert.equal(edge.relation, '投资');
  assert.equal(edge.source, 'gov');
  assert.equal(edge.target, 'enterprise-a');
  assert.equal(edge.label, '¥6000');
});

test('秘密边在揭示前不可见，investigate 后可见', async () => {
  await postAction({
    type: 'secret_deal',
    actor: 'enterprise-a',
    target: 'enterprise-b',
    at: 'S1',
    visibility: 'secret',
    reveal_at: null,
    payload: { parties: ['enterprise-a', 'enterprise-b'] },
  });
  let { body } = await getGraph();
  let deal = body.graph.edges.find((item) => item.id === 'e-2');
  assert.equal(deal.secret, true);
  assert.equal(deal.revealed, false);

  await postAction({
    type: 'investigate',
    actor: 'gov',
    target: 'gov',
    at: 'S3',
    visibility: 'public',
    reveal_at: null,
    payload: { edge_id: 'e-2' },
  });
  ({ body } = await getGraph());
  deal = body.graph.edges.find((item) => item.id === 'e-2');
  assert.equal(deal.revealed, true);
});

test('revoke 移除边', async () => {
  const { body } = await postAction({
    type: 'revoke',
    actor: 'gov',
    target: 'enterprise-a',
    at: 'S4',
    visibility: 'public',
    reveal_at: null,
    payload: { edge_id: 'e-1' },
  });
  assert.equal(body.ok, true);
  const graph = await getGraph();
  assert.equal(graph.body.graph.edges.find((item) => item.id === 'e-1'), undefined);
});

test('GET /api/graph?step=N 只投影到该步', async () => {
  const { body } = await getGraph(2);
  assert.equal(body.ok, true);
  assert.equal(body.step, 2);
  assert.equal(body.graph.revision, 2);
  assert.ok(body.graph.edges.find((item) => item.id === 'e-2'));
  assert.equal(body.graph.edges.find((item) => item.id === 'e-3'), undefined);
});

test('shock 事件生成事件节点', async () => {
  const { body } = await postAction({
    type: 'shock',
    actor: 'gov',
    target: 'gov',
    at: 'S2',
    visibility: 'public',
    reveal_at: null,
    payload: { name: '市场寒流冲击', affects: ['enterprise-a', 'enterprise-c'] },
  });
  assert.equal(body.event.seq, 5);
  const graph = await getGraph();
  const eventNode = graph.body.graph.nodes.find((node) => node.id === 'ev-5');
  assert.equal(eventNode.kind, 'event');
  assert.equal(eventNode.name, '市场寒流冲击');
});

test('GET /api/events 返回事件列表，支持 step 截断', async () => {
  const resp = await fetch(`${BASE}/api/events`);
  const body = await resp.json();
  assert.equal(body.ok, true);
  assert.equal(body.events.length, 5);
  assert.deepEqual(body.events.map((event) => event.seq), [1, 2, 3, 4, 5]);
  assert.equal(body.events[0].type, 'invest');

  const truncated = await fetch(`${BASE}/api/events?step=2`);
  const truncatedBody = await truncated.json();
  assert.equal(truncatedBody.events.length, 2);
});

test('health 的 latestStep 随事件追加更新', async () => {
  const resp = await fetch(`${BASE}/api/health`);
  const body = await resp.json();
  assert.equal(body.events.latestStep, 5);
});
