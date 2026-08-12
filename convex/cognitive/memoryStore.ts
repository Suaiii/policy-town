import { CognitiveScratch } from './scratch';

export type MemoryKind = 'event' | 'thought';

/**
 * A single memory entry in associative memory. Faithful to
 * generative_agents/reverie/backend_server/persona/memory_structures/associative_memory.py:
 * - events carry a (subject, predicate, object) triple,
 * - thoughts (reflections) carry the ids of the memories they were inferred
 *   from as evidence,
 * - both carry a poignancy (importance) score 0-9, an embedding, and
 *   recency bookkeeping (lastRetrievedAtGameMin).
 */
export interface CognitiveMemory {
  id: string;
  kind: MemoryKind;
  description: string;
  poignancy: number;
  subject: string;
  predicate: string;
  object: string | null;
  embedding: number[];
  createdAtGameMin: number;
  lastRetrievedAtGameMin: number;
  evidence: string[];
}

/**
 * Persistence seam for the cognitive module. The module is written against
 * this interface only, so it can run in-memory (tests / offline) or against
 * Convex tables (stores/convexStore.ts, phase 2).
 */
export interface CognitiveMemoryStore {
  getMemory(id: string): Promise<CognitiveMemory | null>;
  listMemories(): Promise<CognitiveMemory[]>;
  addMemory(memory: CognitiveMemory): Promise<void>;
  updateMemory(id: string, patch: Partial<CognitiveMemory>): Promise<void>;
  saveScratch(key: string, scratch: CognitiveScratch): Promise<void>;
  loadScratch(key: string): Promise<CognitiveScratch | null>;
}
