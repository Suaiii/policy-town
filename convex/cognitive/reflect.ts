import { CognitiveScratch } from './scratch';
import { AssociativeMemory } from './associativeMemory';
import { LLMService, parseJson } from './llm';
import { insightAndEvidencePrompt } from './prompts';

// Source: generative_agents/reverie/backend_server/persona/cognitive_modules/reflect.py
export const REFLECTION_IMPORTANCE_THRESHOLD = 150;
const REFLECTION_NUM_INSIGHTS = 3;

/**
 * Reflect: when the accumulated poignancy of events since the last
 * reflection crosses the threshold, ask the LLM for high-level insights with
 * supporting evidence, then store them as thought memories.
 */
export class ReflectModule {
  constructor(
    private readonly llm: LLMService,
    private readonly memory: AssociativeMemory,
  ) {}

  async reflect(
    scratch: CognitiveScratch,
    nowGameMin: number,
    threshold: number = REFLECTION_IMPORTANCE_THRESHOLD,
  ): Promise<number> {
    const recent = await this.memory.eventsSince(nowGameMin, scratch.lastReflectionGameMin);
    const sum = recent.reduce((acc, m) => acc + m.poignancy, 0);
    if (sum < threshold || recent.length === 0) {
      return 0;
    }

    const raw = await this.llm.chat(
      insightAndEvidencePrompt({
        name: scratch.name,
        memories: recent.slice(-100).map((m) => ({ id: m.id, description: m.description })),
      }),
      { temperature: 0.7, json: true },
    );
    const insights = normalizeInsights(parseJson<{ insights?: RawInsight[] }>(raw));

    for (const insight of insights) {
      const poignancy = await this.memory.generatePoignancy(insight.insight);
      const [embedding] = await this.llm.embed([insight.insight]);
      await this.memory.addThought({
        description: insight.insight,
        evidence: insight.evidenceIds,
        poignancy,
        embedding,
        nowGameMin,
      });
    }
    scratch.lastReflectionGameMin = nowGameMin;
    return insights.length;
  }
}

interface RawInsight {
  insight?: string;
  evidence_ids?: string[];
  evidenceIds?: string[];
}

export interface NormalizedInsight {
  insight: string;
  evidenceIds: string[];
}

function normalizeInsights(raw: { insights?: RawInsight[] } | null): NormalizedInsight[] {
  return (raw?.insights ?? [])
    .filter((i): i is RawInsight & { insight: string } => typeof i.insight === 'string')
    .map((i) => ({
      insight: i.insight,
      evidenceIds: (i.evidence_ids ?? i.evidenceIds ?? []).filter(
        (id: string): id is string => typeof id === 'string',
      ),
    }))
    .slice(0, REFLECTION_NUM_INSIGHTS);
}
