import { GameTime } from './time';
import { CognitiveScratch, createScratch } from './scratch';
import { CognitiveMemoryStore } from './memoryStore';
import { AssociativeMemory } from './associativeMemory';
import { SpatialMemory } from './spatialMemory';
import { DefaultLLMService, LLMService } from './llm';
import { PerceiveModule } from './perceive';
import { RetrieveModule, RetrievedContext } from './retrieve';
import { PlanModule } from './plan';
import { ExecuteModule } from './execute';
import { ReflectModule } from './reflect';
import { ConverseModule } from './converse';
import { Dialogue } from './dialogue';
import { Intention } from './intentions';
import { GameDate, PerceivedEvent, SensoryInput } from './types';
import { CognitiveMemory } from './memoryStore';
import { summarizeConversationPrompt } from './prompts';

export interface CognitiveConfig {
  // Sum of poignancy since last reflection required to trigger reflection.
  reflectionThreshold: number;
  // How many memories to retrieve per focal point.
  retrieveN: number;
  // How many game minutes each scheduled hour decomposes into.
  hourlyTaskMinutes: number;
}

export const DEFAULT_COGNITIVE_CONFIG: CognitiveConfig = {
  reflectionThreshold: 150,
  retrieveN: 3,
  hourlyTaskMinutes: 60,
};

export interface CognitiveAgentOptions {
  identity: { name: string; description: string };
  store: CognitiveMemoryStore;
  spatial: SpatialMemory;
  gameTime: GameTime;
  llm?: LLMService;
  config?: Partial<CognitiveConfig>;
  // Key under which scratch is persisted. Defaults to the agent name.
  scratchKey?: string;
}

export interface StepResult {
  now: GameDate;
  intention: Intention | null;
  perceivedEvents: PerceivedEvent[];
  retrieved: RetrievedContext;
  reflections: number;
  newMemories: CognitiveMemory[];
}

/**
 * The cognitive agent: owns scratch + associative memory and runs the full
 * perceive -> retrieve -> plan -> execute pipeline on every step, with
 * reflection triggered by accumulated poignancy. Emits engine-agnostic
 * intentions.
 *
 * Source of architecture:
 * generative_agents/reverie/backend_server/persona/persona.py
 */
export class CognitiveAgent {
  readonly scratch: CognitiveScratch;
  readonly memory: AssociativeMemory;
  readonly config: CognitiveConfig;
  readonly gameTime: GameTime;
  readonly scratchKey: string;

  private readonly llm: LLMService;
  private readonly store: CognitiveMemoryStore;
  private readonly perceiveModule: PerceiveModule;
  private readonly retrieveModule: RetrieveModule;
  private readonly planModule: PlanModule;
  private readonly executeModule: ExecuteModule;
  private readonly reflectModule: ReflectModule;
  readonly converse: ConverseModule;

  constructor(private readonly options: CognitiveAgentOptions) {
    this.store = options.store;
    this.gameTime = options.gameTime;
    this.config = { ...DEFAULT_COGNITIVE_CONFIG, ...options.config };
    this.scratchKey = options.scratchKey ?? `scratch:${options.identity.name}`;
    this.llm = options.llm ?? new DefaultLLMService();
    this.memory = new AssociativeMemory(this.store, this.llm);
    this.perceiveModule = new PerceiveModule(this.llm, this.memory);
    this.retrieveModule = new RetrieveModule(this.memory);
    this.planModule = new PlanModule(this.llm);
    this.executeModule = new ExecuteModule(options.spatial);
    this.reflectModule = new ReflectModule(this.llm, this.memory);
    this.converse = new ConverseModule(this.llm);
    this.scratch = createScratch(options.identity);
  }

  /** Restore scratch from the store (or start fresh). */
  async initialize(): Promise<void> {
    const existing = await this.store.loadScratch(this.scratchKey);
    if (existing) {
      Object.assign(this.scratch, existing);
    }
  }

  /** Run one cognitive step and persist scratch. */
  async step(sensory: SensoryInput, realTs: number = Date.now()): Promise<StepResult> {
    const now = this.gameTime.now(realTs);
    const nowGameMin = this.gameTime.gameMinute(realTs);

    const memoryIdsBefore = new Set((await this.store.listMemories()).map((m) => m.id));
    const perceivedEvents = await this.perceiveModule.perceive(sensory, now, nowGameMin);
    const memoriesAfter = await this.store.listMemories();
    const newMemories = memoriesAfter.filter((m) => !memoryIdsBefore.has(m.id));

    const retrieved = await this.retrieveModule.retrieve(
      perceivedEvents,
      nowGameMin,
      this.config.retrieveN,
    );

    await this.planModule.plan(
      this.scratch,
      now,
      nowGameMin,
      this.options.spatial,
      this.config.hourlyTaskMinutes,
    );
    const intention = await this.executeModule.execute(this.scratch, now, nowGameMin);
    const reflections = await this.reflectModule.reflect(
      this.scratch,
      nowGameMin,
      this.config.reflectionThreshold,
    );

    await this.store.saveScratch(this.scratchKey, this.scratch);
    return { now, intention, perceivedEvents, retrieved, reflections, newMemories };
  }

  /** Persist the agent's scratch (call after mutations outside step). */
  async persist(): Promise<void> {
    await this.store.saveScratch(this.scratchKey, this.scratch);
  }

  /** Remember a finished conversation (used by the dialogue adapter). */
  async rememberConversation(params: {
    otherName: string;
    summary: string;
    nowGameMin: number;
  }): Promise<CognitiveMemory> {
    const poignancy = await this.memory.generatePoignancy(params.summary);
    const [embedding] = await this.llm.embed([params.summary]);
    return this.memory.addEvent({
      description: `Conversation with ${params.otherName}: ${params.summary}`,
      subject: params.otherName,
      predicate: 'talked with',
      object: 'me',
      poignancy,
      embedding,
      nowGameMin: params.nowGameMin,
    });
  }

  /** Summarize a finished conversation from this agent's perspective. */
  async summarizeConversation(
    messages: { speaker: string; utterance: string }[],
    otherName: string,
  ): Promise<string> {
    const raw = await this.llm.chat(
      summarizeConversationPrompt({
        selfName: this.scratch.name,
        otherName,
        messages,
      }),
      { temperature: 0.3, maxTokens: 200 },
    );
    return raw.trim();
  }

  /** Retrieve memories for dialogue / decision making. */
  async retrieve(query: string, n: number = this.config.retrieveN): Promise<CognitiveMemory[]> {
    const nowGameMin = this.gameTime.gameMinute();
    const scored = await this.memory.retrieve(query, n, nowGameMin);
    return scored.map((s) => s.memory);
  }

  /** Start a dialogue between this agent and another cognitive agent. */
  createDialogue(other: CognitiveAgent, topic?: string): Dialogue {
    return new Dialogue(
      { scratch: this.scratch, id: this.scratchKey, name: this.scratch.name },
      { scratch: other.scratch, id: other.scratchKey, name: other.scratch.name },
      this.converse,
      this.llm,
      async (id: string, query: string, n: number) => {
        const agent = id === this.scratchKey ? this : other;
        return await agent.retrieve(query, n);
      },
      topic,
    );
  }
}
