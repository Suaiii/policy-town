#!/usr/bin/env node
/**
 * Agent 设定文档解析器
 *
 * 把一份 Markdown（或 docx 经 textutil 转换）的 Agent 设定文档解析为
 * aiTown 角色数据，生成 data/customCharacters.ts。世界初始化时
 * （convex/init.ts -> data/characters.ts）优先使用这些自定义角色，
 * 认知大脑（convex/cognitive/）以 identity/plan 驱动对话、记忆与事件推进。
 *
 * 用法：
 *   node scripts/parse_agent_doc.mjs <设定文档.md|docx> [--check]
 *
 * 支持的两种写法（可混用）见 docs/agent设定文档格式.md：
 *   A. bullet 式：## 姓名｜职务·派系  +  - **字段**：值
 *   B. 标签式：  1. 姓名（职务·派系）+  [字段] 值
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = resolve(REPO_ROOT, 'data/customCharacters.ts');

/** 字段别名 -> 规范字段名 */
const FIELD_ALIASES = {
  identity: ['身份', '身份设定', '角色', 'role'],
  motivation: ['动机', '核心动机', 'motivation'],
  strategy: ['策略', '决策策略', 'strategy'],
  boundaries: ['边界', '行为边界'],
  style: ['语言风格', '风格', 'style', '口头禅', '代表口头禅'],
  title: ['职务'],
  prototype: ['原型', '原型气质'],
  reading: ['阅读偏好'],
};

const SPRITES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];

function normalizeFieldKey(rawKey) {
  const key = rawKey.trim().replace(/\*\*/g, '').replace(/\s+/g, '').toLowerCase();
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === key)) return canonical;
  }
  return null;
}

/** 从角色小节标题中提取姓名与派系/职务副标题 */
function parseSectionHeader(headerText) {
  const text = headerText.trim();
  const match = text.match(/^([^\s｜|（(]+)\s*(?:[｜|（(]\s*(.+?)\s*[）)]?)?$/);
  if (!match) return null;
  const name = match[1].trim();
  // 姓名合理性检查：2-15 个字符，不含标点
  if (name.length < 2 || name.length > 15 || /[，。；、：]/.test(name)) return null;
  return { name, subtitle: (match[2] ?? '').trim() };
}

/**
 * 解析小节正文为字段表。同时识别：
 *   - **字段**：值 / - 字段：值
 *   - [字段] 值
 * 字段值可跨行续写；编号列表（1. 2. 3.）并入当前字段。
 */
function parseFields(body) {
  const fields = {};
  let currentKey = null;
  const push = (text) => {
    if (!currentKey || !text.trim()) return;
    fields[currentKey] = fields[currentKey]
      ? `${fields[currentKey]}\n${text.trim()}`
      : text.trim();
  };

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const bullet = line.match(/^[-*]\s*\*{0,2}([^*：:]{1,12}?)\*{0,2}\s*[：:]\s*(.*)$/);
    const tag = line.match(/^\[([^\]]{1,12})\]\s*(.*)$/);

    if (bullet) {
      const key = normalizeFieldKey(bullet[1]);
      currentKey = key ?? currentKey;
      if (key) push(bullet[2]);
      continue;
    }
    if (tag) {
      const key = normalizeFieldKey(tag[1]);
      currentKey = key ?? currentKey;
      if (key) push(tag[2]);
      continue;
    }
    // 续行：编号列表或普通段落，并入当前字段
    push(line.replace(/^[-*]\s+/, ''));
  }
  return fields;
}

/**
 * 解析整份设定文档。
 * @returns {{ worldview: string, agents: Array<{name:string, subtitle:string, fields:Object}> }}
 */
export function parseAgentDoc(text) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const agents = [];
  let worldview = '';

  const mdSections = normalized.split(/^(?=#{1,2}\s)/m);
  const hasMarkdownSections = mdSections.some((s) => s.startsWith('## '));

  if (hasMarkdownSections) {
    for (const section of mdSections) {
      if (section.startsWith('# ') && !section.startsWith('## ')) {
        // H1 标题与导言：不作为世界观注入（多为文档说明），跳过
        continue;
      }
      if (!section.startsWith('## ')) continue;
      const newlineIdx = section.indexOf('\n');
      const header = section.slice(3, newlineIdx === -1 ? undefined : newlineIdx).trim();
      const body = newlineIdx === -1 ? '' : section.slice(newlineIdx + 1);

      if (/^(世界观|世界背景|背景设定)/.test(header)) {
        worldview = body.trim();
        continue;
      }

      const parsed = parseSectionHeader(header);
      if (!parsed) continue;
      agents.push({ ...parsed, fields: parseFields(body) });
    }
  } else {
    // 标签式（docx 转换文本）：角色小节形如 “1. 严国强（县委书记·激进改革派）”，
    // 编号可能与前文粘连、甚至丢失，因此允许“可选编号 + 中文名 + （含·的副标题）”。
    const headerRe = /(?:^|\s)(\d{0,2})\s*[.、．]\s*([一-龥]{2,4})\s*[（(]([^）)]*[·、][^）)]*)[）)]/g;
    const matches = [...normalized.matchAll(headerRe)];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const bodyStart = m.index + m[0].length;
      const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : normalized.length;
      agents.push({
        name: m[2],
        subtitle: m[3].trim(),
        fields: parseFields(normalized.slice(bodyStart, bodyEnd)),
      });
    }
  }

  return { worldview, agents };
}

/**
 * 校验并映射为 aiTown 角色描述。
 * 必填：姓名 + 动机（identity 可由 职务/原型 合成）。
 * 无已知字段的小节视为非角色小节，跳过并返回警告。
 */
export function toDescriptions(parsed) {
  const descriptions = [];
  const warnings = [];
  const errors = [];

  for (const agent of parsed.agents) {
    const f = agent.fields;
    const knownKeys = Object.keys(f);
    if (knownKeys.length === 0) {
      warnings.push(`小节「${agent.name}」没有可识别字段，已跳过。`);
      continue;
    }
    if (!f.motivation) {
      errors.push(`角色「${agent.name}」缺少必填字段：动机（Motivation）。`);
      continue;
    }

    const identityParts = [];
    if (parsed.worldview) identityParts.push(`世界观背景：${parsed.worldview}`);
    const roleLine = f.title
      ? `你是${agent.name}，${f.title.replace(/。+$/, '')}。`
      : `你是${agent.name}${agent.subtitle ? `，${agent.subtitle}` : ''}。`;
    identityParts.push(roleLine);
    if (f.identity) identityParts.push(f.identity);
    if (f.prototype) identityParts.push(`原型气质：${f.prototype}`);
    if (f.reading) identityParts.push(`阅读偏好：${f.reading}`);
    if (f.strategy) identityParts.push(`决策策略：${f.strategy}`);
    if (f.boundaries) identityParts.push(`行为边界：${f.boundaries}`);
    if (f.style) identityParts.push(`语言风格：${f.style}`);

    descriptions.push({
      name: agent.name,
      character: SPRITES[descriptions.length % SPRITES.length],
      identity: identityParts.join('\n'),
      plan: f.motivation,
    });
  }

  return { descriptions, warnings, errors };
}

/** 生成 data/customCharacters.ts 内容 */
export function generateTs(descriptions, sourcePath) {
  const rows = descriptions
    .map(
      (d) => `  {
    name: ${JSON.stringify(d.name)},
    character: ${JSON.stringify(d.character)},
    identity: ${JSON.stringify(d.identity)},
    plan: ${JSON.stringify(d.plan)},
  },`,
    )
    .join('\n');
  return `// 本文件由 scripts/parse_agent_doc.mjs 自动生成，请勿手改。
// 来源文档：${sourcePath}
// 重新生成：node scripts/parse_agent_doc.mjs <设定文档路径>
export interface CustomCharacterDescription {
  name: string;
  character: string;
  identity: string;
  plan: string;
}

export const CustomDescriptions: CustomCharacterDescription[] | null = [
${rows}
];
`;
}

function readInput(path) {
  if (/\.docx$/i.test(path)) {
    // macOS 自带 textutil 桥接 docx -> txt
    return execFileSync('textutil', ['-convert', 'txt', '-stdout', path], {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
  }
  return readFileSync(path, 'utf-8');
}

function main(argv) {
  const args = argv.filter((a) => a !== '--check');
  const checkOnly = argv.includes('--check');
  if (args.length !== 1) {
    console.error('用法：node scripts/parse_agent_doc.mjs <设定文档.md|docx> [--check]');
    process.exit(1);
  }
  const inputPath = resolve(args[0]);
  const text = readInput(inputPath);
  const parsed = parseAgentDoc(text);
  const { descriptions, warnings, errors } = toDescriptions(parsed);

  for (const w of warnings) console.warn(`警告：${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`错误：${e}`);
    process.exit(1);
  }
  if (descriptions.length === 0) {
    console.error('错误：未解析到任何角色。请检查文档格式（见 docs/agent设定文档格式.md）。');
    process.exit(1);
  }

  console.log(`解析出 ${descriptions.length} 个角色：${descriptions.map((d) => d.name).join('、')}`);

  if (!checkOnly) {
    writeFileSync(DEFAULT_OUTPUT, generateTs(descriptions, args[0]));
    console.log(`已写入 ${DEFAULT_OUTPUT}`);
    console.log('\n接下来的步骤：');
    console.log('  1. npm run dev                     # 启动 convex 后端 + 前端');
    console.log('  2. npx convex run init             # 在世界中生成这些 Agent');
    console.log('  3. npx convex run cognitive/admin:setCognitiveEnabled \'{"worldId":"<worldId>","cognitiveEnabled":true}\'');
    console.log('     # 开启认知大脑（worldId 见 Convex dashboard 的 worldStatus 表）');
    console.log('  换文档重跑：先 npx convex run testing:wipeAllTables 清空世界，再执行 2-3。');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
