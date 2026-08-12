import { PerceivedEvent } from './types';
import { AssociativeMemory, ScoredMemory } from './associativeMemory';
import { CognitiveMemory } from './memoryStore';

export interface RetrievedContext {
  // Query (focal point) -> ranked memories, expanded with related events.
  byFocalPoint: Map<string, CognitiveMemory[]>;
  // Perceived event -> all memories retrieved for it.
  byEvent: Map<PerceivedEvent, CognitiveMemory[]>;
}

/**
 * Retrieve: for every perceived event, use its focal points as queries into
 * associative memory, then expand the results with related events sharing a
 * subject. The combined context feeds plan / execute / converse.
 *
 * Source: generative_agents/reverie/backend_server/persona/cognitive_modules/retrieve.py
 */
export class RetrieveModule {
  constructor(private readonly memory: AssociativeMemory) {}

  async retrieve(
    perceived: PerceivedEvent[],
    nowGameMin: number,
    n: number = 3,
  ): Promise<RetrievedContext> {
    const byFocalPoint = new Map<string, CognitiveMemory[]>();
    const byEvent = new Map<PerceivedEvent, CognitiveMemory[]>();

    for (const event of perceived) {
      const collected: CognitiveMemory[] = [];
      for (const focalPoint of event.focalPoints) {
        if (byFocalPoint.has(focalPoint)) {
          collected.push(...byFocalPoint.get(focalPoint)!);
          continue;
        }
        const scored = await this.memory.retrieve(focalPoint, n, nowGameMin);
        const expanded = new Map<string, CognitiveMemory>();
        for (const { memory } of scored) {
          expanded.set(memory.id, memory);
          for (const related of await this.memory.retrieveRelated(memory, nowGameMin)) {
            expanded.set(related.id, related);
          }
        }
        const memories = [...expanded.values()];
        byFocalPoint.set(focalPoint, memories);
        collected.push(...memories);
      }
      byEvent.set(event, dedupe(collected));
    }

    return { byFocalPoint, byEvent };
  }
}

function dedupe(memories: CognitiveMemory[]): CognitiveMemory[] {
  const seen = new Set<string>();
  const result: CognitiveMemory[] = [];
  for (const memory of memories) {
    if (!seen.has(memory.id)) {
      seen.add(memory.id);
      result.push(memory);
    }
  }
  return result;
}

/** Flatten a retrieved context into a deduped memory list (for prompts). */
export function flattenRetrieved(context: RetrievedContext): CognitiveMemory[] {
  return dedupe([...context.byFocalPoint.values()].flat());
}

/** Convert memories into short text lines for prompt injection. */
export function memoryLines(memories: CognitiveMemory[], limit = 10): string[] {
  return memories.slice(0, limit).map((m) => `- ${m.description}`);
}

export type { ScoredMemory };
