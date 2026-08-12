import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

export interface SummarizeConversationParams {
  selfName: string;
  otherName: string;
  messages: { speaker: string; utterance: string }[];
}

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/summarize_conversation_v1.txt
export const summarizeConversationPrompt: PromptFn<SummarizeConversationParams> = (params) => [
  systemPrompt(
    'Summarize a finished conversation from the perspective of the agent, using first-person pronouns ("I", "we"). ' +
      'Include whether the interaction was pleasant. One or two sentences. Reply with the summary text only.',
  ),
  userPrompt(
    `You are ${params.selfName} and you just finished a conversation with ${params.otherName}.\n` +
      params.messages.map((m) => `${m.speaker}: ${m.utterance}`).join('\n'),
  ),
];
