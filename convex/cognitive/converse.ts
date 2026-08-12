import { LLMService, parseJson } from './llm';
import { CognitiveScratch } from './scratch';
import { chatLinePrompt, decideToTalkPrompt } from './prompts';
import { memoryLines } from './retrieve';
import { CognitiveMemory } from './memoryStore';

export interface ConversationTarget {
  id: string;
  name: string;
  identity: string;
  currentAction: string | null;
}

export interface ChatLineContext {
  scratch: CognitiveScratch;
  target: ConversationTarget;
  context: CognitiveMemory[];
  history: { speaker: string; utterance: string }[];
  topic?: string;
}

/**
 * Converse: decide whether to approach another agent, and produce chat lines
 * grounded in retrieved memories.
 *
 * Source: generative_agents/reverie/backend_server/persona/cognitive_modules/converse.py
 * and .../persona/cognitive_modules/dialogue.py
 */
export class ConverseModule {
  constructor(private readonly llm: LLMService) {}

  /** Decide whether to start a conversation (Source: decide_to_talk_v2). */
  async decideToTalk(
    scratch: CognitiveScratch,
    target: ConversationTarget,
    selfMemories: CognitiveMemory[],
    targetMemories: CognitiveMemory[],
  ): Promise<boolean> {
    const raw = await this.llm.chat(
      decideToTalkPrompt({
        selfName: scratch.name,
        selfIdentity: scratch.traits.join('. '),
        otherName: target.name,
        otherAction: target.currentAction ?? 'standing around',
        selfContext: memoryLines(selfMemories, 5),
        otherContext: memoryLines(targetMemories, 5),
      }),
      { temperature: 0, json: true },
    );
    const parsed = parseJson<{ should_talk?: boolean }>(raw);
    return parsed?.should_talk === true;
  }

  /** Generate the next line of a conversation (Source: agent_chat_v1). */
  async generateNextLine(params: ChatLineContext): Promise<{ utterance: string; endConversation: boolean }> {
    const raw = await this.llm.chat(chatLineParams(params), { temperature: 0.7, json: true });
    const parsed = parseJson<{ utterance?: string; end_conversation?: boolean }>(raw);
    if (!parsed || typeof parsed.utterance !== 'string' || parsed.utterance.length === 0) {
      return { utterance: '...', endConversation: false };
    }
    return {
      utterance: parsed.utterance,
      endConversation: parsed.end_conversation === true,
    };
  }
}

function chatLineParams(params: ChatLineContext) {
  return chatLinePrompt({
    selfName: params.scratch.name,
    selfIdentity: params.scratch.traits.join('. '),
    otherName: params.target.name,
    otherIdentity: params.target.identity,
    context: memoryLines(params.context, 8),
    history: params.history,
    topic: params.topic,
  });
}
