#!/usr/bin/env node
/**
 * bridge/server.mjs — 零依赖 Node bridge
 *
 * 职责：
 *  1. spawn 常驻 Python agent 服务（sim/server.py，读 sim/agent_config.json）
 *  2. 暴露 HTTP :5274，把 /api/agent/* 转发到 Python :5275
 *  3. 健康检查聚合（bridge + python 两端状态）
 *
 * 环境变量：
 *  BRIDGE_PORT        bridge 监听端口（默认 5274）
 *  SIM_AGENT_PORT     python agent 服务端口（默认 5275）
 *  SIM_AGENT_STUB=1   python 以 stub 模式启动（无 key 冒烟）
 *  PYTHON             python 解释器（默认 python3）
 */
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openEventStore } from './events-store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 5274);
const AGENT_PORT = Number(process.env.SIM_AGENT_PORT ?? 5275);
const PYTHON = process.env.PYTHON ?? 'python3';
const AGENT_HOST = '127.0.0.1';
const ALLOWED_ORIGINS = ['http://localhost:5273', 'http://127.0.0.1:5273'];

let agentReady = false;
let agentStarting = false;
let agentError = '';
let agentProcess = null;

const eventStore = openEventStore(process.env.EVENTS_DB);

function log(...args) {
  console.log(`[bridge]`, ...args);
}

function spawnAgent() {
  if (agentProcess || agentStarting) return;
  agentStarting = true;
  agentError = '';
  const args = ['-m', 'sim.server', '--port', String(AGENT_PORT)];
  if (process.env.SIM_AGENT_STUB === '1') args.push('--stub');
  log(`spawn ${PYTHON} ${args.join(' ')} (cwd=${ROOT})`);
  agentProcess = spawn(PYTHON, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  agentProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text.includes('listening on')) {
      agentReady = true;
      agentStarting = false;
      log(text);
    } else if (text) {
      log('[python]', text);
    }
  });
  agentProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) log('[python:err]', text);
  });
  agentProcess.on('exit', (code, signal) => {
    log(`python exited code=${code} signal=${signal}; restart in 1s`);
    agentReady = false;
    agentStarting = false;
    agentProcess = null;
    if (code !== 0) agentError = `python exited (${code})`;
    setTimeout(spawnAgent, 1000);
  });
  // 兜底：5 秒未确认 listening 视为启动失败标记（保持自动重启循环）
  setTimeout(() => {
    if (!agentReady && agentStarting) {
      agentStarting = false;
      agentError = 'python 启动超时';
    }
  }, 6000);
}

async function proxyJson(req, res, pathname, body, corsHeaders) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const upstream = await awaitHttp(AGENT_PORT, pathname, payload, 280_000);
  if (!upstream.ok) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify({
      error: `python agent 服务不可用: ${upstream.error}`,
      agentReady,
      hint: agentReady ? '' : '请检查 sim/agent_config.json 或启动 bridge 时设置 SIM_AGENT_STUB=1',
    }));
    return;
  }
  res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
  res.end(upstream.body);
}

function awaitHttp(port, pathname, payload, timeoutMs) {
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        hostname: AGENT_HOST,
        port,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': payload.length,
        },
        timeout: timeoutMs,
      },
      (resp) => {
        const chunks = [];
        resp.on('data', (chunk) => chunks.push(chunk));
        resp.on('end', () => {
          resolve({ ok: true, status: resp.statusCode ?? 500, body: Buffer.concat(chunks).toString('utf-8') });
        });
      },
    );
    req.on('error', (error) => {
      resolve({ ok: false, error: String(error?.message ?? error) });
    });
    req.on('timeout', () => {
      req.destroy(new Error('python agent 响应超时'));
    });
    req.end(payload);
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const origin = req.headers.origin;
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const setCors = (code, headers = {}) => {
    res.writeHead(code, {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '3600',
      ...headers,
    });
  };

  if (req.method === 'OPTIONS') {
    setCors(204);
    res.end();
    return;
  }

  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    setCors(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      bridge: 'up',
      agent: {
        ready: agentReady,
        starting: agentStarting,
        error: agentError,
        port: AGENT_PORT,
        stub: process.env.SIM_AGENT_STUB === '1',
      },
      events: {
        ready: true,
        latestStep: eventStore.latestSeq(),
      },
    }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/actions') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      } catch {
        setCors(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '请求体不是合法 JSON' }));
        return;
      }
      let event;
      try {
        event = eventStore.append(input);
      } catch (error) {
        setCors(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `非法事件输入: ${error?.message ?? error}` }));
        return;
      }
      setCors(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, event }));
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/events') {
    const stepParam = url.searchParams.get('step');
    const requested = stepParam === null ? undefined : Number(stepParam);
    const step = requested !== undefined && Number.isInteger(requested) && requested >= 0 ? requested : undefined;
    setCors(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      step: step ?? eventStore.latestSeq(),
      events: eventStore.listUpTo(step),
    }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/graph') {
    const stepParam = url.searchParams.get('step');
    const requested = stepParam === null ? undefined : Number(stepParam);
    const step = requested !== undefined && Number.isInteger(requested) && requested >= 0
      ? requested
      : eventStore.latestSeq();
    setCors(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      step,
      graph: eventStore.graphAt(step),
    }));
    return;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/agent/')) {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const corsHeaders = {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };
      proxyJson(req, res, pathname, body, corsHeaders).catch((error) => {
        console.error('[bridge] proxy failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
        res.end(JSON.stringify({ error: `proxy failed: ${error?.message ?? error}` }));
      });
    });
    return;
  }

  setCors(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not found' }));
});

spawnAgent();
server.listen(BRIDGE_PORT, '0.0.0.0', () => {
  log(`bridge listening on http://localhost:${BRIDGE_PORT} (python agent -> ${AGENT_HOST}:${AGENT_PORT})`);
});
