import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

export interface DailyPlanParams {
  name: string;
  identity: string;
  wakeUpHour: number;
  sleepHour: number;
}

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/daily_planning_v6.txt
export const dailyPlanningPrompt: PromptFn<DailyPlanParams> = (params) => [
  systemPrompt(
    'You are helping an agent plan its daily waking hour. The agent sleeps at night; its sleep hour is given. ' +
      'Choose a realistic wake-up hour based on the agent\'s identity. ' +
      'Reply with JSON only: {"wake_up_hour": number} (0-23).',
  ),
  userPrompt(
    `${params.name} is an agent. Identity: ${params.identity}\n` +
      `Usual sleep hour: ${params.sleepHour}\nWhat time should ${params.name} wake up?`,
  ),
];
