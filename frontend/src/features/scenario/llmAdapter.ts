import type { MemoryStance } from '../relationship/types.ts';
import type { ScenarioBeat, ScenarioFile } from './schema.ts';

/**
 * LLM 适配层：一轮剧情的"叙述者"。
 * - 无 API Key：逐字回放剧情文件中的本轮脚本（scripted fallback）。
 * - 有 VITE_LLM_API_KEY：把人设 + 历史记忆 + 本轮剧情大纲交给 LLM 生成细节，
 *   输出形状与脚本一致；任何失败都回退到脚本，推演永不中断。
 *
 * 环境变量（.env 或部署环境）：
 *   VITE_LLM_API_KEY   必填，OpenAI 兼容接口的 key
 *   VITE_LLM_ENDPOINT  可选，默认 https://api.openai.com/v1/chat/completions
 *   VITE_LLM_MODEL     可选，默认 gpt-4o-mini
 */

export type RoundNarrativeBeat = ScenarioBeat;

export interface RoundNarrative {
  round: number;
  scene: string;
  beats: RoundNarrativeBeat[];
}

export interface NarrateInput {
  scenario: ScenarioFile;
  round: number;
}

const STANCES: MemoryStance[] = ['support', 'oppose', 'cautious', 'neutral'];

/** 无 LLM 时的逐字脚本回放。 */
export function scriptedRound(
  scenario: ScenarioFile,
  round: number,
): RoundNarrative | null {
  const r = scenario.rounds.find((q) => q.round === round);
  if (!r) return null;
  return { round: r.round, scene: r.scene, beats: r.beats };
}

export async function narrateRound(input: NarrateInput): Promise<RoundNarrative | null> {
  const scripted = scriptedRound(input.scenario, input.round);
  if (!scripted) return null;

  const apiKey = env('VITE_LLM_API_KEY');
  if (!apiKey) return scripted;

  try {
    const llm = await narrateRoundWithLLM(input.scenario, scripted, apiKey);
    return llm ?? scripted;
  } catch {
    return scripted;
  }
}

/* ---------------- LLM 实现（OpenAI 兼容 chat completions） ---------------- */

const env = (key: string): string | undefined => {
  // jest/node 环境下 import.meta.env 不存在，安全降级为无 key（走脚本回放）
  const meta = import.meta as { env?: Record<string, string | undefined> };
  const v = meta.env?.[key];
  return v && v.length > 0 ? v : undefined;
};

function buildRoundPrompt(scenario: ScenarioFile, scripted: RoundNarrative): string {
  const actorIds = [...new Set(scripted.beats.map((b) => b.actor))];
  const personas = actorIds
    .map((id) => {
      const role = scenario.roles.find((r) => r.id === id);
      if (!role) return null;
      const p = role.persona;
      return `【${role.name}｜${role.title}】\n身份：${p.identity}\n动机：${p.motivation}\n语言风格：${p.speakingStyle}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const outline = scripted.beats
    .map((b, i) => `${i + 1}. ${b.actor}: ${b.summary}（立场：${b.stance}）`)
    .join('\n');

  return [
    `你在为政务推演沙盒《${scenario.meta.title}》生成第 R${scripted.round} 轮「${scripted.scene}」的各角色行动记录。`,
    `剧情背景：${scenario.meta.premise}`,
    '',
    '出场角色人设：',
    personas,
    '',
    '本轮剧情大纲（必须忠实覆盖每一条，可润色细节但不得改变立场与结论）：',
    outline,
    '',
    '以 JSON 输出，形状为：{"beats": [{"actor": "角色id", "summary": "一句行动摘要", "stance": "support|oppose|cautious|neutral", "relatedAgentIds": ["角色id"], "decision": "一句决策（可选）", "statusAfter": "一句该角色当前状态（可选）"}]}',
    '只输出 JSON，不要输出任何其他文字。',
  ].join('\n');
}

function isNarrative(value: unknown, validIds: Set<string>): value is { beats: RoundNarrativeBeat[] } {
  if (typeof value !== 'object' || value === null) return false;
  const beats = (value as { beats?: unknown }).beats;
  if (!Array.isArray(beats) || beats.length === 0) return false;
  return beats.every((b) => {
    if (typeof b !== 'object' || b === null) return false;
    const beat = b as Record<string, unknown>;
    return (
      typeof beat.actor === 'string' &&
      validIds.has(beat.actor) &&
      typeof beat.summary === 'string' &&
      typeof beat.stance === 'string' &&
      STANCES.includes(beat.stance as MemoryStance)
    );
  });
}

async function narrateRoundWithLLM(
  scenario: ScenarioFile,
  scripted: RoundNarrative,
  apiKey: string,
): Promise<RoundNarrative | null> {
  const endpoint =
    env('VITE_LLM_ENDPOINT') ?? 'https://api.openai.com/v1/chat/completions';
  const model = env('VITE_LLM_MODEL') ?? 'gpt-4o-mini';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: buildRoundPrompt(scenario, scripted) }],
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed: unknown = JSON.parse(content);
  const validIds = new Set(scenario.roles.map((r) => r.id));
  if (!isNarrative(parsed, validIds)) return null;

  return {
    round: scripted.round,
    scene: scripted.scene,
    beats: parsed.beats.map((b) => ({
      ...b,
      relatedAgentIds: (b.relatedAgentIds ?? []).filter((id) => validIds.has(id)),
    })),
  };
}
