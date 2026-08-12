import { PromptFn, systemPrompt, userPrompt } from './promptTypes';

export interface ChatLineParams {
  selfName: string;
  selfIdentity: string;
  otherName: string;
  otherIdentity: string;
  context: string[];
  history: { speaker: string; utterance: string }[];
  topic?: string;
}

// Source: generative_agents/reverie/backend_server/persona/prompt_template/v2/generate_next_convo_line_v1.txt
// and v3_ChatGPT/agent_chat_v1.txt
export const chatLinePrompt: PromptFn<ChatLineParams> = (params) => {
  const historyText =
    params.history.length === 0
      ? '(no conversation yet)'
      : params.history
          .map((row) => `${row.speaker}: ${row.utterance}`)
          .join('\n');
  return [
    systemPrompt(
      `You are ${params.selfName}. ${params.selfIdentity}\n` +
        `You are talking to ${params.otherName}. ${params.otherIdentity}\n` +
        (params.topic ? `Conversation topic: ${params.topic}\n` : '') +
        'Relevant memories:\n' +
        params.context.join('\n') +
        '\nGenerate the next line of the conversation as this character. Reply with JSON only: ' +
        '{"utterance": string, "end_conversation": boolean}. Keep the line short (1-2 sentences), in-character, and natural. ' +
        'Set end_conversation true if the conversation has reached a natural close.',
    ),
    userPrompt(`Conversation so far:\n${historyText}`),
  ];
};
