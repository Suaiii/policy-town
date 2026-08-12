import { ConverseModule, ConversationTarget } from './converse';
import { CognitiveScratch } from './scratch';
import { CognitiveMemory } from './memoryStore';
import { summarizeConversationPrompt } from './prompts';
import { LLMService } from './llm';

export interface DialogueRow {
  speaker: string;
  target: string;
  utterance: string;
}

export const MAX_DIALOGUE_LINES = 8;

/**
 * Event-driven dialogue between two agents. Faithful to
 * generative_agents/reverie/backend_server/persona/cognitive_modules/dialogue.py:
 * participants take turns; each line is generated from retrieved memories,
 * persona summaries, and the conversation history; the dialogue ends when the
 * LLM signals a natural close or the line cap is hit.
 */
export class Dialogue {
  private readonly rows: DialogueRow[] = [];
  private ended = false;

  constructor(
    private readonly self: { scratch: CognitiveScratch; id: string; name: string },
    private readonly other: { scratch: CognitiveScratch; id: string; name: string },
    private readonly converse: ConverseModule,
    private readonly llm: LLMService,
    private readonly retrieveFor: (id: string, query: string, n: number) => Promise<CognitiveMemory[]>,
    public readonly topic?: string,
  ) {}

  get history(): DialogueRow[] {
    return [...this.rows];
  }

  get finished(): boolean {
    return this.ended || this.rows.length >= MAX_DIALOGUE_LINES;
  }

  async generateNextLine(): Promise<DialogueRow | null> {
    if (this.finished) {
      return null;
    }
    const turn = this.rows.length % 2;
    const isSelfTurn = turn === 0;
    const speaker = isSelfTurn ? this.self : this.other;
    const target = isSelfTurn ? this.other : this.self;
    const targetName = target.name;

    const query = this.topic ?? target.name;
    const context = await this.retrieveFor(speaker.id, query, 4);
    const targetView: ConversationTarget = {
      id: target.id,
      name: targetName,
      identity: target.scratch.traits.join('. '),
      currentAction: null,
    };

    const { utterance, endConversation } = await this.converse.generateNextLine({
      scratch: speaker.scratch,
      target: targetView,
      context,
      history: this.rows,
      topic: this.topic,
    });

    const row: DialogueRow = {
      speaker: speaker.scratch.name,
      target: target.scratch.name,
      utterance,
    };
    this.rows.push(row);

    if (endConversation) {
      this.ended = true;
      this.rows.push({
        speaker: speaker.scratch.name,
        target: target.scratch.name,
        utterance: '[ends conversation]',
      });
    }
    return row;
  }

  /** Summarize the finished dialogue from the self agent's perspective. */
  async summarize(): Promise<string> {
    const history = this.rows.filter((r) => !r.utterance.startsWith('['));
    if (history.length === 0) {
      return `Conversation with ${this.other.scratch.name}: no meaningful exchange`;
    }
    const raw = await this.llm.chat(
      summarizeConversationPrompt({
        selfName: this.self.scratch.name,
        otherName: this.other.scratch.name,
        messages: history.map((r) => ({ speaker: r.speaker, utterance: r.utterance })),
      }),
      { temperature: 0.3, maxTokens: 200 },
    );
    return raw.trim();
  }
}
