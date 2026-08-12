import { CognitiveScratch, createScratch } from '../scratch';
import { CognitiveMemory, CognitiveMemoryStore } from '../memoryStore';

/** In-memory implementation of CognitiveMemoryStore (tests / offline runs). */
export class InMemoryCognitiveStore implements CognitiveMemoryStore {
  private readonly memories = new Map<string, CognitiveMemory>();
  private readonly scratches = new Map<string, CognitiveScratch>();

  constructor(
    initialMemories: CognitiveMemory[] = [],
    initialScratch?: { key: string; scratch: CognitiveScratch },
  ) {
    for (const memory of initialMemories) {
      this.memories.set(memory.id, { ...memory, embedding: [...memory.embedding] });
    }
    if (initialScratch) {
      this.scratches.set(initialScratch.key, initialScratch.scratch);
    }
  }

  async getMemory(id: string): Promise<CognitiveMemory | null> {
    const memory = this.memories.get(id);
    return memory ? { ...memory, embedding: [...memory.embedding] } : null;
  }

  async listMemories(): Promise<CognitiveMemory[]> {
    return [...this.memories.values()].map((m) => ({ ...m, embedding: [...m.embedding] }));
  }

  async addMemory(memory: CognitiveMemory): Promise<void> {
    this.memories.set(memory.id, { ...memory, embedding: [...memory.embedding] });
  }

  async updateMemory(id: string, patch: Partial<CognitiveMemory>): Promise<void> {
    const existing = this.memories.get(id);
    if (!existing) {
      throw new Error(`Memory ${id} not found`);
    }
    this.memories.set(id, { ...existing, ...patch });
  }

  async saveScratch(key: string, scratch: CognitiveScratch): Promise<void> {
    this.scratches.set(key, structuredClone(scratch));
  }

  async loadScratch(key: string): Promise<CognitiveScratch | null> {
    const scratch = this.scratches.get(key);
    return scratch ? structuredClone(scratch) : null;
  }

  static scratchFromIdentity(key: string, identity: { name: string; description: string }) {
    return { key, scratch: createScratch(identity) };
  }
}
