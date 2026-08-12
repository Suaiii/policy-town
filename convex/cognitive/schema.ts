import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { EMBEDDING_DIMENSION } from '../util/llm';
import { agentId } from '../aiTown/ids';

// Validators mirroring the cognitive module's TS interfaces (scratch.ts /
// memoryStore.ts). The store converts between the module's `X | null` fields
// and Convex's optional fields (see stores/convexStore.ts), so these
// validators only ever see normalized documents.

export const cognitiveLocation = v.object({
  sector: v.string(),
  arena: v.string(),
});

export const cognitiveHourlySchedule = v.object({
  hour: v.number(),
  action: v.string(),
  object: v.optional(v.string()),
  location: v.optional(cognitiveLocation),
});

export const cognitiveDailyPlan = v.object({
  day: v.number(),
  wakeUpHour: v.number(),
  schedules: v.array(cognitiveHourlySchedule),
});

export const cognitiveCurrentAction = v.object({
  action: v.string(),
  description: v.string(),
  startedAt: v.object({ day: v.number(), hour: v.number(), minute: v.number() }),
  startedGameMin: v.number(),
  durationGameMin: v.number(),
  object: v.optional(v.string()),
  location: v.optional(cognitiveLocation),
});

export const cognitiveCurrContext = v.object({
  action: v.string(),
  description: v.string(),
  object: v.optional(v.string()),
  location: v.optional(cognitiveLocation),
});

export const cognitiveScratchValidator = v.object({
  name: v.string(),
  traits: v.array(v.string()),
  lifestyle: v.object({ wakeUpHour: v.number(), sleepHour: v.number() }),
  stableRelationships: v.array(v.object({ name: v.string(), relationship: v.string() })),
  dailyRequirements: v.array(v.string()),
  currContext: v.optional(cognitiveCurrContext),
  dailyPlan: v.optional(cognitiveDailyPlan),
  currentAction: v.optional(cognitiveCurrentAction),
  lastReflectionGameMin: v.optional(v.number()),
});

export const cognitiveMemoryFields = {
  kind: v.union(v.literal('event'), v.literal('thought')),
  description: v.string(),
  poignancy: v.number(),
  subject: v.string(),
  predicate: v.string(),
  object: v.optional(v.string()),
  evidence: v.array(v.string()),
  createdAtGameMin: v.number(),
  lastRetrievedAtGameMin: v.number(),
};

// A memory as returned by the store (table doc + embedding join + id).
export const cognitiveMemoryJoin = v.object({
  id: v.string(),
  ...cognitiveMemoryFields,
  embedding: v.array(v.float64()),
});

export const cognitiveMemoryPatch = v.object({
  kind: v.optional(v.union(v.literal('event'), v.literal('thought'))),
  description: v.optional(v.string()),
  poignancy: v.optional(v.number()),
  subject: v.optional(v.string()),
  predicate: v.optional(v.string()),
  object: v.optional(v.string()),
  evidence: v.optional(v.array(v.string())),
  createdAtGameMin: v.optional(v.number()),
  lastRetrievedAtGameMin: v.optional(v.number()),
});

export const cognitiveTables = {
  // One row per (world, agent): the agent's scratch memory.
  cognitiveScratch: defineTable({
    worldId: v.id('worlds'),
    agentId,
    data: cognitiveScratchValidator,
  }).index('worldAgent', ['worldId', 'agentId']),

  // Event/thought memories, embedding stored separately for vector search.
  cognitiveMemories: defineTable({
    worldId: v.id('worlds'),
    agentId,
    embeddingId: v.id('cognitiveMemoryEmbeddings'),
    ...cognitiveMemoryFields,
  }).index('worldAgent', ['worldId', 'agentId']),

  cognitiveMemoryEmbeddings: defineTable({
    agentId,
    embedding: v.array(v.float64()),
  }).vectorIndex('embedding', {
    vectorField: 'embedding',
    filterFields: ['agentId'],
    dimensions: EMBEDDING_DIMENSION,
  }),
};
