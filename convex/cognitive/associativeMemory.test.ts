import { AssociativeMemory, cosineSimilarity } from './associativeMemory';
import { InMemoryCognitiveStore } from './stores/inMemoryStore';
import { StubLLMService } from './llm';
import { CognitiveMemory } from './memoryStore';

// Deterministic embeddings: characters -> buckets, normalized. Textually
// similar strings land near each other.
const hashEmbedding = (text: string): number[] => {
  const vec = new Array<number>(8).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[text.charCodeAt(i) % 8] += 1;
  }
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((v) => v / norm);
};

const llm = new StubLLMService(
  () => '5',
  (texts) => texts.map(hashEmbedding),
);

function makeEvent(overrides: Partial<CognitiveMemory> & { id: string; description: string }): CognitiveMemory {
  return {
    kind: 'event',
    poignancy: 5,
    subject: 'Maria',
    predicate: 'is',
    object: null,
    embedding: hashEmbedding(overrides.description),
    createdAtGameMin: 0,
    lastRetrievedAtGameMin: 0,
    evidence: [],
    ...overrides,
  };
}

describe('cosineSimilarity', () => {
  test('identical vectors score 1', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  });
  test('orthogonal vectors score 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
});

describe('AssociativeMemory', () => {
  test('retrieve ranks by recency * importance * relevance', async () => {
    // Query direction (relevant to "Maria reading").
    const q = [0.9, 0.1, 0, 0, 0, 0, 0, 0];
    const store = new InMemoryCognitiveStore([
      // Highly relevant but mundane; retrieved 1 game hour ago.
      makeEvent({ id: 'e1', description: 'Maria is reading a book at the library', poignancy: 2, lastRetrievedAtGameMin: 10_000 - 60, embedding: q }),
      // Relevant, recent, and poignant -> should win.
      makeEvent({ id: 'e2', description: 'Maria is reading her acceptance letter', poignancy: 9, lastRetrievedAtGameMin: 10_000, embedding: q }),
      // Irrelevant (nearly orthogonal) but recent.
      makeEvent({ id: 'e3', description: 'John is sleeping at home', poignancy: 3, lastRetrievedAtGameMin: 10_000, embedding: [0.1, 0.9, 0, 0, 0, 0, 0, 0] }),
    ]);
    const memory = new AssociativeMemory(
      store,
      new StubLLMService(() => '5', () => [q]),
    );
    const now = 10_000 + 60; // one game hour after e2/e3

    const results = await memory.retrieve('Maria reading', 2, now);
    expect(results.map((r) => r.memory.id)).toEqual(['e2', 'e1']);
  });

  test('retrieve returns empty when no memories', async () => {
    const memory = new AssociativeMemory(new InMemoryCognitiveStore(), llm);
    expect(await memory.retrieve('anything', 3, 0)).toEqual([]);
  });

  test('retrieveRelated expands events sharing a subject', async () => {
    const store = new InMemoryCognitiveStore([
      makeEvent({ id: 'm1', description: 'Maria is at the library', subject: 'Maria' }),
      makeEvent({ id: 'm2', description: 'Maria bought coffee', subject: 'Maria' }),
      makeEvent({ id: 'm3', description: 'John is at the park', subject: 'John' }),
    ]);
    const memory = new AssociativeMemory(store, llm);
    const related = await memory.retrieveRelated(
      { ...makeEvent({ id: 'm1', description: 'Maria is at the library' }) },
      1000,
    );
    expect(related.map((m) => m.id)).toEqual(['m2']);
  });

  test('retrieve touches lastRetrievedAt on survivors', async () => {
    const store = new InMemoryCognitiveStore([
      makeEvent({ id: 'e1', description: 'Maria is reading a book', lastRetrievedAtGameMin: 0 }),
    ]);
    const memory = new AssociativeMemory(store, llm);
    await memory.retrieve('reading', 1, 5000);
    const after = await store.getMemory('e1');
    expect(after!.lastRetrievedAtGameMin).toBe(5000);
  });

  test('addEvent and addThought persist', async () => {
    const store = new InMemoryCognitiveStore();
    const memory = new AssociativeMemory(store, llm);
    await memory.addEvent({
      description: 'Maria saw a cat',
      subject: 'Maria',
      predicate: 'saw',
      object: 'cat',
      poignancy: 4,
      embedding: [1, 0],
      nowGameMin: 42,
    });
    await memory.addThought({
      description: 'Maria likes cats',
      evidence: ['event-1'],
      poignancy: 6,
      embedding: [0, 1],
      nowGameMin: 100,
    });
    const all = await store.listMemories();
    expect(all).toHaveLength(2);
    expect(all.find((m) => m.kind === 'thought')!.evidence).toEqual(['event-1']);
  });
});
