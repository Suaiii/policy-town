import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_PORT = 5276;
const AGENT_PORT = 5277;
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
          if (body.agent?.ready) return resolve();
        }
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('bridge/python agent health timeout'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

const MEMORY_PATH = path.join(ROOT, 'tests', '.test-memories.json');

before(async () => {
  try { await import('node:fs').then((fs) => fs.promises.unlink(MEMORY_PATH)); } catch { /* noop */ }
  child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    detached: true,
    env: {
      ...process.env,
      BRIDGE_PORT: String(BRIDGE_PORT),
      SIM_AGENT_PORT: String(AGENT_PORT),
      SIM_AGENT_STUB: '1',
      SIM_AGENT_MEMORY: MEMORY_PATH,
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

test('health reports bridge and python agent', async () => {
  const resp = await fetch(`${BASE}/api/health`);
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.equal(body.bridge, 'up');
  assert.equal(body.agent.ready, true);
  assert.equal(body.agent.stub, true);
});

test('firm-request proxy returns stub request', async () => {
  const resp = await fetch(`${BASE}/api/agent/firm-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firm: {
        alias: '远景显示',
        profile: { request: 42, requestedTools: ['investment', 'infrastructure'] },
        metrics: { cash: 42, debt: 46, progress: 8, technology: 62, orders: 48, risk: 52, employment: 12 },
      },
      stage: { code: 'S1', event: '全球信贷快速收紧' },
      city: { fiscal: 100, industry: 58, supplyChain: 52, talent: 61, infrastructure: 67 },
    }),
  });
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.equal(body.ok, true);
  assert.equal(body.request.amount, 42);
  assert.ok(Array.isArray(body.request.tools));
});

test('firm-response proxy returns stub action', async () => {
  const resp = await fetch(`${BASE}/api/agent/firm-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firm: { alias: '远景显示', metrics: { cash: 42, risk: 52 } },
      allocation: 35,
      tools: ['investment', 'infrastructure'],
      coverage: 0.83,
      stage: { code: 'S1', event: '全球信贷快速收紧' },
    }),
  });
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.equal(body.ok, true);
  assert.equal(body.action.action, '扩建并研发');
});

test('gov-review proxy returns four departments', async () => {
  const resp = await fetch(`${BASE}/api/agent/gov-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: '合肥',
      budget: 100,
      stage: { code: 'S1', event: '全球信贷快速收紧' },
      firms: [
        { code: 'A', request_amount: 42, profile: { alias: '远景显示', industry: '新型显示' } },
        { code: 'B', request_amount: 34, profile: { alias: '曙光能源', industry: '新能源' } },
        { code: 'C', request_amount: 26, profile: { alias: '精微装备', industry: '集成电路装备' } },
      ],
    }),
  });
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.equal(body.ok, true);
  assert.equal(body.review.departments.length, 4);
  assert.ok(body.review.consensus);
});

test('agent memory: request writes, response writes, next turn reads', async () => {
  const firm = {
    id: 'enterprise-a',
    alias: '远景显示',
    role: '决策负责人',
    industry: '新型显示',
    background: '背景',
    metrics: { cash: 42, debt: 46, progress: 8, technology: 62, capacity: 6, orders: 48, risk: 52, employment: 12 },
    profile: { request: 42, requestedTools: ['investment', 'infrastructure'] },
  };
  const stage = { code: 'S1', date: '2008 Q3', event: '全球信贷快速收紧' };
  const city = { fiscal: 100, industry: 58, supplyChain: 52, talent: 61, infrastructure: 67 };

  const post = async (path, body) => {
    const resp = await fetch(`${BASE}/api/agent/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(resp.status, 200);
    return resp.json();
  };

  const firstRequest = await post('firm-request', { firm, stage, city, turn: 'S1' });
  assert.equal(firstRequest.request.memory_used, false, 'first turn has no memory');
  assert.ok(firstRequest.request.amount > 0);

  const response = await post('firm-response', {
    firm, stage, city, turn: 'S1',
    allocation: 35, tools: ['investment', 'infrastructure'], coverage: 0.83,
  });
  assert.equal(response.action.memory_used, true, 'response sees the request memory just written');
  assert.match(response.action.memory, /你申请/);
  assert.ok(response.action.action);

  const secondRequest = await post('firm-request', { firm, stage: { ...stage, code: 'S2' }, city, turn: 'S2' });
  assert.equal(secondRequest.request.memory_used, true, 'second turn should read prior memory');
  assert.match(secondRequest.request.memory, /历史决策/);
  assert.match(secondRequest.request.memory, /你申请/);
  assert.match(secondRequest.request.memory, /政府投入/);
  assert.match(secondRequest.request.memory, /扩建并研发/);
  assert.match(secondRequest.request.memory, /累计 1 轮获得政府投入 35 点/);
});
