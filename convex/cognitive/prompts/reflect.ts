import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

export interface InsightParams {
  name: string;
  memories: { id: string; description: string }[];
}

export interface Insight {
  insight: string;
  evidenceIds: string[];
}

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/insight_and_evidence_v1.txt
export const insightAndEvidencePrompt: PromptFn<InsightParams> = ({ name, memories }) => [
  systemPrompt(
    'You infer high-level insights about a person from their recent memories. ' +
      'Reply with JSON only: {"insights": [{"insight": string, "evidence_ids": string[]}]} with exactly 3 insights, ' +
      'each supported by 1-3 memory ids from the provided list.',
  ),
  userPrompt(
    `You are ${name}. Statements about you:\n` +
      memories.map((m, i) => `Statement ${i} (id ${m.id}): ${m.description}`).join('\n'),
  ),
];
