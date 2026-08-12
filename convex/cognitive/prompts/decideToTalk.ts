import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/decide_to_talk_v2.txt
export const decideToTalkPrompt: PromptFn<{
  selfName: string;
  selfIdentity: string;
  otherName: string;
  otherAction: string;
  selfContext: string[];
  otherContext: string[];
}> = ({ selfName, selfIdentity, otherName, otherAction, selfContext, otherContext }) => [
  systemPrompt(
    'Decide whether the agent should walk over and start a conversation with the other person right now. ' +
      'Behave like a person: initiators start chats when they are free and the other person seems approachable. ' +
      'Reply with JSON only: {"should_talk": boolean, "reason": string}.',
  ),
  userPrompt(
    `${selfName} (${selfIdentity}) sees ${otherName}, who ${otherAction || 'is standing around'}.\n` +
      `What ${selfName} remembers about this situation:\n${selfContext.join('\n')}\n` +
      `What ${selfName} knows about ${otherName}:\n${otherContext.join('\n')}`,
  ),
];
