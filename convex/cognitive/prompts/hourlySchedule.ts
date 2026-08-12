import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

export interface HourlyScheduleParams {
  name: string;
  identity: string;
  wakeUpHour: number;
  sleepHour: number;
  locations: string[];
}

export interface HourlyScheduleLine {
  hour: number;
  action: string;
  object: string | null;
  location: string | null;
}

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/generate_hourly_schedule_v2.txt
export const hourlySchedulePrompt: PromptFn<HourlyScheduleParams> = (params) => [
  systemPrompt(
    'You plan an agent\'s day hour by hour. Between the wake-up hour (inclusive) and the sleep hour (exclusive), ' +
      'assign each hour one concrete activity. Activities should fit the agent\'s identity and use the available ' +
      'locations and objects. Reply with JSON only: {"schedules": [{"hour": number, "action": string, "object": string|null, "location": string|null}]}. ' +
      'Only include hours from wakeUpHour to sleepHour-1. Do not repeat the exact same activity for more than 3 consecutive hours.',
  ),
  userPrompt(
    `Name: ${params.name}\nIdentity: ${params.identity}\n` +
      `Wake-up hour: ${params.wakeUpHour}, Sleep hour: ${params.sleepHour}\n` +
      `Available locations: ${params.locations.join(', ')}`,
  ),
];
