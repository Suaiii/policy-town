import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

export interface TaskDecompositionParams {
  name: string;
  identity: string;
  action: string;
  object: string | null;
  location: string | null;
  hourlyTaskMinutes: number;
}

export interface TaskStep {
  description: string;
  minutes: number;
}

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/task_decomp_v3.txt
export const taskDecompositionPrompt: PromptFn<TaskDecompositionParams> = (params) => [
  systemPrompt(
    'You break a one-hour activity into a short sequence of concrete sub-steps. ' +
      `Steps must sum to ${params.hourlyTaskMinutes} minutes. ` +
      'Reply with JSON only: {"steps": [{"description": string, "minutes": number}]} (2-4 steps).',
  ),
  userPrompt(
    `${params.name} (${params.identity}) is doing "${params.action}"` +
      (params.object ? ` at/with ${params.object}` : '') +
      (params.location ? ` at ${params.location}` : '') +
      ' for the next hour. Break it into sub-steps.',
  ),
];
