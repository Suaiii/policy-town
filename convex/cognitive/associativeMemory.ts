import { CognitiveMemory, CognitiveMemoryStore } from './memoryStore';
import { LLMService, parseNumberFromResponse } from './llm';
import { poignancyPrompt } from './prompts';

export const RECENCY_DECAY_PER_HOUR = 0.99;
export const RETRIEVAL_TOP_K = 50;
export const DEFAULT_RETRIEVE_N = 3;

export interface ScoredMemory {
  memory: CognitiveMemory;
  relevance: number;
  recency: number;
  score: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface NewEventParams {
  description: string;
  subject: string;
  predicate: string;
  object: string | null;
  poignancy: number;
  embedding: number[];
  nowGameMin: number;
}

export interface NewThoughtParams {
  description: string;
  evidence: string[];
  poignancy: number;
  embedding: number[];
  nowGameMin: number;
}

let nextMemoryId = 0;

/**
 * Associative memory: stores events and thoughts, and retrieves them with
 * the paper's composite score  recency * importance * relevance.
 *
 * Source: generative_agents/reverie/backend_server/persona/memory_structures/associative_memory.py
 */
export class AssociativeMemory {
  constructor(
    private readonly store: CognitiveMemoryStore,
    private readonly llm: LLMService,
  ) {}

  async addEvent(params: NewEventParams): Promise<CognitiveMemory> {
    const memory: CognitiveMemory = {
      id: `event-${Date.now()}-${nextMemoryId++}`,
      kind: 'event',
      description: params.description,
      poignancy: params.poignancy,
      subject: params.subject,
      predicate: params.predicate,
      object: params.object,
      embedding: params.embedding,
      createdAtGameMin: params.nowGameMin,
      lastRetrievedAtGameMin: params.nowGameMin,
      evidence: [],
    };
    await this.store.addMemory(memory);
    return memory;
  }

  async addThought(params: NewThoughtParams): Promise<CognitiveMemory> {
    const memory: CognitiveMemory = {
      id: `thought-${Date.now()}-${nextMemoryId++}`,
      kind: 'thought',
      description: params.description,
      poignancy: params.poignancy,
      subject: params.description,
      predicate: 'is',
      object: null,
      embedding: params.embedding,
      createdAtGameMin: params.nowGameMin,
      lastRetrievedAtGameMin: params.nowGameMin,
      evidence: params.evidence,
    };
    await this.store.addMemory(memory);
    return memory;
  }

  /** Ask the LLM for a poignancy score 0-9 (Source: poignancy_event_v1). */
  async generatePoignancy(description: string): Promise<number> {
    const raw = await this.llm.chat(poignancyPrompt({ description }), { temperature: 0, maxTokens: 5 });
    return parseNumberFromResponse(raw) ?? 5;
  }

  /**
   * Retrieve the n most relevant memories for a query, ranked by
   * score = recency * importance * relevance (the paper's formula):
   *   1. rank all events by embedding relevance, keep top RETRIEVAL_TOP_K
   *   2. re-rank by recency (0.99^hours since last retrieval) * poignancy * relevance
   *   3. touch lastRetrievedAt for the survivors
   */
  async retrieve(query: string, n: number = DEFAULT_RETRIEVE_N, nowGameMin: number): Promise<ScoredMemory[]> {
    if (n <= 0) {
      return [];
    }
    const [queryEmbedding] = await this.llm.embed([query]);
    const memories = await this.store.listMemories();
    if (memories.length === 0) {
      return [];
    }

    const withRelevance: { memory: CognitiveMemory; relevance: number }[] = memories.map(
      (memory) => ({ memory, relevance: cosineSimilarity(queryEmbedding, memory.embedding) }),
    );
    withRelevance.sort((a, b) => b.relevance - a.relevance);
    const top = withRelevance.slice(0, RETRIEVAL_TOP_K);

    const ranked: ScoredMemory[] = top.map(({ memory, relevance }) => {
      const hoursSinceRetrieved = Math.max(0, (nowGameMin - memory.lastRetrievedAtGameMin) / 60);
      const recency = Math.pow(RECENCY_DECAY_PER_HOUR, hoursSinceRetrieved);
      const importance = memory.poignancy;
      return { memory, relevance, recency, score: recency * importance * relevance };
    });
    ranked.sort((a, b) => b.score - a.score);

    const survivors = ranked.slice(0, n);
    await Promise.all(
      survivors.map(({ memory }) =>
        this.store.updateMemory(memory.id, { lastRetrievedAtGameMin: nowGameMin }),
      ),
    );
    return survivors;
  }

  /**
   * Expand a retrieved memory with other events sharing its subject
   * (Source: retrieve_related_events). Used after initial retrieval to
   * surface the "story" around a subject.
   */
  async retrieveRelated(memory: CognitiveMemory, nowGameMin: number, n = 10): Promise<CognitiveMemory[]> {
    const memories = await this.store.listMemories();
    const related = memories
      .filter(
        (m) =>
          m.id !== memory.id &&
          m.kind === 'event' &&
          m.subject.toLowerCase() === memory.subject.toLowerCase(),
      )
      .map((m) => {
        const hoursSince = Math.max(0, (nowGameMin - m.lastRetrievedAtGameMin) / 60);
        return { m, score: m.poignancy * Math.pow(RECENCY_DECAY_PER_HOUR, hoursSince) };
      });
    related.sort((a, b) => b.score - a.score);
    return related.slice(0, n).map(({ m }) => m);
  }

  /** Events created after a game-minute cutoff (used by reflection). */
  async eventsSince(nowGameMin: number, since: number | null): Promise<CognitiveMemory[]> {
    const memories = await this.store.listMemories();
    return memories
      .filter(
        (m) => m.kind === 'event' && (since === null || m.createdAtGameMin > since),
      )
      .sort((a, b) => a.createdAtGameMin - b.createdAtGameMin);
  }

  /** All events (for plan/context building). */
  async events(): Promise<CognitiveMemory[]> {
    const memories = await this.store.listMemories();
    return memories.filter((m) => m.kind === 'event');
  }
}
