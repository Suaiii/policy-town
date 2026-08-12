import { httpAction } from './_generated/server';

/**
 * 「发布公告」红头文件动效页面的后端：
 * 移植自独立服务 preview/server.js —— 转发 DeepSeek 生成公告文案。
 * API Key 只存 Convex 环境变量（npx convex env set DEEPSEEK_API_KEY sk-xxx），
 * 绝不暴露给浏览器。前端页面见 frontend/public/announce/index.html。
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const UPSTREAM_TIMEOUT_MS = 30000;

/* 页面以 iframe 嵌入地图站点、跨域调用 Convex Site，需要 CORS 头 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function apiKey(): string {
  return (process.env.DEEPSEEK_API_KEY || '').trim();
}

function sendJson(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export const handleCorsPreflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

export const handleHealth = httpAction(async () => {
  return sendJson(200, { ok: true, configured: Boolean(apiKey()) });
});

/* ---------- 内容生成 Prompt（随每次请求附带） ---------- */
const SYSTEM_PROMPT = [
  '你是「江东省人民政府」办公厅的一名资深公文写作秘书，文风一本正经、严谨克制、措辞规范，',
  '严格遵循中国党政机关公文写作惯例（如"经研究""现将有关事项公告如下""特此公告"等套语）。',
  '用户会给出一个口语化的主题，你需要据此虚构一份以政府名义发布的正式「公告」。',
  '要求：',
  '1. 以 JSON 对象输出，且只输出 JSON，不要输出任何其他文字。',
  '2. JSON 结构固定为：{"title": "公告标题", "paragraphs": ["正文段落1", "正文段落2", ...]}。',
  '3. title 为完整公告标题，一律以"关于"开头、以"的公告"结尾，不超过 40 字。',
  '4. paragraphs 为 3 至 4 段正文，每段 60-120 字，使用规范公告语体（背景依据、具体事项、执行要求、生效说明等），末段一般以"特此公告"收尾。',
  '5. 内容须积极正面、合规得体，不涉及真实人名、真实地名（一律使用"江东省"及虚构的"江州市""临江县"等）与真实机构。',
  '6. 不要输出文号、主送机关、落款、日期，这些由系统另行添加。',
].join('\n');

/* ---------- DeepSeek 调用 ---------- */
async function callDeepSeek(userText: string) {
  const key = apiKey();
  if (!key) {
    return { ok: false as const, error: 'NOT_CONFIGURED', message: '服务端未配置 DEEPSEEK_API_KEY，请通过 npx convex env set 配置后重试。' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `群众诉求：${userText}` },
        ],
      }),
    });

    if (!resp.ok) {
      // 错误信息脱敏：不透传上游响应体里可能包含的敏感细节
      return { ok: false as const, error: 'UPSTREAM_ERROR', message: `生成服务暂时不可用（HTTP ${resp.status}），请稍后重试。` };
    }

    const payload = await resp.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false as const, error: 'EMPTY_RESULT', message: '生成服务未返回有效内容，请重新提交。' };
    }

    let doc: { title?: unknown; paragraphs?: unknown };
    try {
      doc = JSON.parse(content);
    } catch {
      return { ok: false as const, error: 'BAD_JSON', message: '生成内容格式异常，请重新提交。' };
    }

    const title = typeof doc.title === 'string' ? doc.title.trim() : '';
    const paragraphs = Array.isArray(doc.paragraphs)
      ? doc.paragraphs.filter((p): p is string => typeof p === 'string' && Boolean(p.trim())).map((p) => p.trim())
      : [];
    if (!title || paragraphs.length === 0) {
      return { ok: false as const, error: 'BAD_SHAPE', message: '生成内容不完整，请重新提交。' };
    }

    return { ok: true as const, data: { title: title.slice(0, 60), paragraphs: paragraphs.slice(0, 6) } };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false as const, error: 'TIMEOUT', message: '生成服务响应超时，请重新提交。' };
    }
    return { ok: false as const, error: 'NETWORK_ERROR', message: '无法连接生成服务，请检查网络后重试。' };
  } finally {
    clearTimeout(timer);
  }
}

export const handleGenerate = httpAction(async (ctx, request) => {
  let text = '';
  try {
    const parsed = await request.json();
    text = typeof parsed?.text === 'string' ? parsed.text.trim().slice(0, 500) : '';
  } catch {
    /* fallthrough */
  }
  if (!text) {
    return sendJson(400, { ok: false, error: 'EMPTY_INPUT', message: '请先输入公告主题。' });
  }
  const result = await callDeepSeek(text);
  return sendJson(result.ok ? 200 : 502, result);
});
