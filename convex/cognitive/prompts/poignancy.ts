import { PromptFn, userPrompt } from './promptTypes';

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/poignancy_event_v1.txt
export const poignancyPrompt: PromptFn<{ description: string }> = ({ description }) => [
  userPrompt(
    `Rate on a scale of 0 to 9 how likely this memory is to be remembered, where 0 is purely mundane ` +
      `(e.g., brushing teeth, making bed) and 9 is extremely poignant (e.g., a break up, college acceptance). ` +
      `Reply with a single integer only.\n\nMemory: ${description}`,
  ),
];
