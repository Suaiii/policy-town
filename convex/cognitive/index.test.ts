import { CognitiveAgent } from './index';
import { GameTime } from './time';
import { InMemoryCognitiveStore } from './stores/inMemoryStore';
import { SpatialMemory } from './spatialMemory';
import { StubLLMService } from './llm';
import { SensoryInput } from './types';

const spatial = SpatialMemory.fromTree({
  'downtown': {
    'library': { objects: { 'bookshelf': { x: 5, y: 5 } } },
    'cafe': { objects: { 'counter': { x: 1, y: 1 } } },
  },
});

// Deterministic embeddings (same as associativeMemory.test.ts).
const hashEmbedding = (text: string): number[] => {
  const vec = new Array<number>(8).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[text.charCodeAt(i) % 8] += 1;
  }
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((v) => v / norm);
};

function makeAgent(name: string, llm: StubLLMService) {
  return new CognitiveAgent({
    identity: { name, description: `${name} is a curious resident.` },
    store: new InMemoryCognitiveStore(),
    spatial,
    gameTime: new GameTime(0, { gameMinutesPerRealSecond: 2, startDay: 1 }),
    llm,
  });
}

const sensory: SensoryInput = {
  currentLocation: { sector: 'downtown', arena: 'library', x: 5, y: 5 },
  visibleAgents: [],
  visibleObjects: [{ name: 'bookshelf', arena: 'library', x: 5, y: 5 }],
  visibleConversations: [],
};

describe('CognitiveAgent', () => {
  test('step emits intention and stores perceived events', async () => {
    const llm = new StubLLMService(
      (messages) => {
        const text = messages.map((m) => m.content ?? '').join('\n');
        if (text.includes('wake_up_hour')) return '{"wake_up_hour": 7}';
        if (text.includes('focal_points')) return '{"focal_points": ["bookshelf"]}';
        if (text.includes('event triple')) return '{"subject": "Maria", "predicate": "is reading", "object": "a book"}';
        if (text.includes('scale of 0 to 9')) return '4';
        if (text.includes('"schedules"')) return '{"schedules": [{"hour": 7, "action": "read a book", "object": "bookshelf", "location": "library"}]}';
        if (text.includes('"steps"')) return '{"steps": [{"description": "pick a book", "minutes": 30}, {"description": "read quietly", "minutes": 30}]}';
        if (text.includes('insights')) return '{"insights": []}';
        return '{}';
      },
      (texts) => texts.map(hashEmbedding),
    );

    const agent = makeAgent('Maria', llm);
    // 2 game-minutes per real second: 7:00 game time = 210_000 ms.
    const result = await agent.step(sensory, 210_000);

    // Day 1, 7:00: wake-up hour plan -> read a book at the library.
    expect(result.now.day).toBe(1);
    expect(result.intention?.kind).toBe('goTo');
    if (result.intention?.kind === 'goTo') {
      expect(result.intention.location.arena).toBe('library');
    }
    // Perceived the bookshelf -> stored as an event memory.
    expect(result.newMemories.some((m) => m.description.includes('bookshelf'))).toBe(true);
    // Plan was built for day 1.
    expect(agent.scratch.dailyPlan?.day).toBe(1);
    expect(agent.scratch.dailyPlan?.schedules[0].action).toBe('read a book');
  });

  test('step executes in-place once at the destination', async () => {
    const llm = new StubLLMService(
      () => '{"wake_up_hour": 7}',
      (texts) => texts.map(hashEmbedding),
    );
    const agent = makeAgent('John', llm);
    // First step plans and heads to the library.
    await agent.step(sensory, 210_000);
    // Second step: already at the library (currContext set) -> do the action.
    const second = await agent.step(
      {
        ...sensory,
        currentLocation: { sector: 'downtown', arena: 'library', x: 5, y: 5 },
      },
      210_010,
    );
    expect(second.intention?.kind).toBe('do');
    if (second.intention?.kind === 'do') {
      expect(second.intention.emoji).toBe('📖');
    }
  });

  test('initialize restores scratch from the store', async () => {
    const llm = new StubLLMService(() => '5', (t) => t.map(hashEmbedding));
    const store = new InMemoryCognitiveStore();
    const agent = new CognitiveAgent({
      identity: { name: 'Anna', description: 'Anna is a librarian.' },
      store,
      spatial,
      gameTime: new GameTime(0, { gameMinutesPerRealSecond: 2 }),
      llm,
    });
    agent.scratch.stableRelationships.push({ name: 'Bob', relationship: 'friend' });
    await agent.persist();

    const revived = new CognitiveAgent({
      identity: { name: 'Anna', description: 'Anna is a librarian.' },
      store,
      spatial,
      gameTime: new GameTime(0, { gameMinutesPerRealSecond: 2 }),
      llm,
    });
    await revived.initialize();
    expect(revived.scratch.stableRelationships[0].name).toBe('Bob');
  });
});
