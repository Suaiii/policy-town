import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/generate_focal_pt_v1.txt
export const focalPointPrompt: PromptFn<{
  description: string;
  visibleNames: string[];
}> = ({ description, visibleNames }) => [
  systemPrompt(
    'You produce search focal points for retrieving an agent\'s memories. ' +
      'Reply with JSON only: {"focal_points": string[]} with 1-3 short phrases. ' +
      'Prefer entities and names over generic words.',
  ),
  userPrompt(
    `Event: ${description}` +
      (visibleNames.length > 0 ? `\nRelevant people nearby: ${visibleNames.join(', ')}` : ''),
  ),
];
