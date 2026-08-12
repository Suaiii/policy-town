import { LLMMessage } from '../llm';

/**
 * A prompt builder: params -> chat messages. All prompts were rewritten for
 * modern chat models (concise system instructions, JSON output contracts)
 * while keeping the algorithm and structure of the original Stanford
 * generative_agents templates. Each prompt file carries the source path of
 * the template it derives from.
 */
export type PromptFn<Params extends object> = (params: Params) => LLMMessage[];

export function systemPrompt(content: string): LLMMessage {
  return { role: 'system', content };
}

export function userPrompt(content: string): LLMMessage {
  return { role: 'user', content };
}
