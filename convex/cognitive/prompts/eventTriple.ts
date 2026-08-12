import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/generate_event_triple_v1.txt
export const eventTriplePrompt: PromptFn<{
  name: string;
  action: string;
}> = ({ name, action }) => [
  systemPrompt(
    'You convert an agent\'s action into a (subject, predicate, object) event triple. ' +
      'Reply with JSON only: {"subject": string, "predicate": string, "object": string|null}. ' +
      'The subject is the person, the predicate is a present-tense verb phrase, and the object is what it acts on (or null).',
  ),
  userPrompt(`${name} is ${action}`),
];
