import { Dialogue } from './dialogue';
import { CognitiveAgent } from './index';
import { GameTime } from './time';
import { InMemoryCognitiveStore } from './stores/inMemoryStore';
import { SpatialMemory } from './spatialMemory';
import { StubLLMService } from './llm';

const spatial = SpatialMemory.fromTree({ 'town': { 'plaza': { objects: {} } } });
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
    identity: { name, description: `${name} lives in town.` },
    store: new InMemoryCognitiveStore(),
    spatial,
    gameTime: new GameTime(0, { gameMinutesPerRealSecond: 2 }),
    llm,
  });
}

describe('Dialogue', () => {
  test('participants take turns until the dialogue ends', async () => {
    const llm = new StubLLMService(
      () => '{"utterance": "Hello there!", "end_conversation": false}',
      (texts) => texts.map(hashEmbedding),
    );
    const maria = makeAgent('Maria', llm);
    const john = makeAgent('John', llm);
    const dialogue = maria.createDialogue(john, 'the weather');

    let row = await dialogue.generateNextLine();
    expect(row?.speaker).toBe('Maria');
    row = await dialogue.generateNextLine();
    expect(row?.speaker).toBe('John');
    expect(dialogue.history).toHaveLength(2);
    expect(dialogue.finished).toBe(false);
  });

  test('ends when the LLM signals a natural close', async () => {
    let calls = 0;
    const llm = new StubLLMService(
      () => {
        calls++;
        return calls === 1
          ? '{"utterance": "Hi!", "end_conversation": false}'
          : '{"utterance": "Bye!", "end_conversation": true}';
      },
      (texts) => texts.map(hashEmbedding),
    );
    const maria = makeAgent('Maria', llm);
    const john = makeAgent('John', llm);
    const dialogue = maria.createDialogue(john);
    await dialogue.generateNextLine();
    await dialogue.generateNextLine();
    expect(dialogue.history.map((r) => r.utterance)).toContain('[ends conversation]');
    expect(await dialogue.generateNextLine()).toBeNull();
  });

  test('summarize produces a first-person summary', async () => {
    const llm = new StubLLMService(
      () => '{"utterance": "Hello!", "end_conversation": true}',
      (texts) => texts.map(hashEmbedding),
    );
    const maria = makeAgent('Maria', llm);
    const john = makeAgent('John', llm);
    const dialogue = maria.createDialogue(john);
    await dialogue.generateNextLine();
    const summary = await dialogue.summarize();
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });
});
