import { GameDate, PerceivedEvent, SensoryInput } from './types';
import { LLMService, parseJson } from './llm';
import { AssociativeMemory } from './associativeMemory';
import { eventTriplePrompt, focalPointPrompt } from './prompts';

export interface Triple {
  subject: string;
  predicate: string;
  object: string | null;
}

async function generateEventTriple(
  llm: LLMService,
  name: string,
  action: string,
): Promise<Triple> {
  const raw = await llm.chat(eventTriplePrompt({ name, action }), { temperature: 0, json: true });
  const triple = parseJson<Triple>(raw);
  if (!triple || !triple.subject || !triple.predicate) {
    return { subject: name, predicate: 'is', object: action };
  }
  return { subject: triple.subject, predicate: triple.predicate, object: triple.object ?? null };
}

async function generateFocalPoints(
  llm: LLMService,
  description: string,
  visibleNames: string[],
): Promise<string[]> {
  const raw = await llm.chat(focalPointPrompt({ description, visibleNames }), {
    temperature: 0,
    json: true,
  });
  const parsed = parseJson<{ focal_points?: string[] }>(raw);
  const points = parsed?.focal_points?.filter((p) => typeof p === 'string' && p.length > 0);
  return points && points.length > 0 ? points.slice(0, 3) : [description];
}

/**
 * Perceive: turn raw sensory input into perceived events (agent actions,
 * conversations, objects), store them in associative memory, and return them
 * so the retrieve module can use their focal points.
 *
 * Source: generative_agents/reverie/backend_server/persona/cognitive_modules/perceive.py
 */
export class PerceiveModule {
  constructor(
    private readonly llm: LLMService,
    private readonly memory: AssociativeMemory,
  ) {}

  async perceive(sensory: SensoryInput, now: GameDate, nowGameMin: number): Promise<PerceivedEvent[]> {
    const events: PerceivedEvent[] = [];
    const visibleNames = sensory.visibleAgents.map((a) => a.name);

    for (const agent of sensory.visibleAgents) {
      if (!agent.currentAction || agent.inConversation) {
        continue;
      }
      const description = `${agent.name} is ${agent.currentAction}`;
      const focalPoints = await generateFocalPoints(this.llm, description, visibleNames);
      const triple = await generateEventTriple(this.llm, agent.name, agent.currentAction);
      const event: PerceivedEvent = {
        kind: 'agent_action',
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object,
        description,
        focalPoints,
        at: now,
      };
      events.push(event);
      await this.rememberEvent(event, nowGameMin);
    }

    for (const conversation of sensory.visibleConversations) {
      if (conversation.participants.length === 0) {
        continue;
      }
      const description = `${conversation.participants.join(' and ')} are talking`;
      const event: PerceivedEvent = {
        kind: 'conversation',
        subject: conversation.participants[0],
        predicate: 'is talking with',
        object: conversation.participants[1] ?? null,
        description,
        focalPoints: [...conversation.participants],
        at: now,
      };
      events.push(event);
      await this.rememberEvent(event, nowGameMin);
    }

    for (const object of sensory.visibleObjects) {
      const event: PerceivedEvent = {
        kind: 'object',
        subject: object.name,
        predicate: 'is at',
        object: object.arena,
        description: `${object.name} at ${object.arena}`,
        focalPoints: [object.name],
        at: now,
      };
      events.push(event);
      await this.rememberEvent(event, nowGameMin);
    }

    return events;
  }

  private async rememberEvent(event: PerceivedEvent, nowGameMin: number) {
    const poignancy = await this.memory.generatePoignancy(event.description);
    const [embedding] = await this.llm.embed([event.description]);
    await this.memory.addEvent({
      description: event.description,
      subject: event.subject,
      predicate: event.predicate,
      object: event.object,
      poignancy,
      embedding,
      nowGameMin,
    });
  }
}
