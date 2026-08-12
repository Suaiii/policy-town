import { Infer, v } from 'convex/values';
import { internal } from '../../_generated/api';
import { ActionCtx, internalMutation, internalQuery } from '../../_generated/server';
import { CognitiveMemory, CognitiveMemoryStore } from '../memoryStore';
import { CognitiveScratch } from '../scratch';
import { cognitiveMemoryFields, cognitiveMemoryPatch, cognitiveScratchValidator } from '../schema';
import { agentId } from '../../aiTown/ids';
import { Doc, Id } from '../../_generated/dataModel';

// ---------------------------------------------------------------------------
// Internal queries/mutations backing the Convex store. The store itself is
// used from internal actions, which cannot touch the database directly.
// ---------------------------------------------------------------------------

export const getScratch = internalQuery({
  args: { worldId: v.id('worlds'), agentId },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('cognitiveScratch')
      .withIndex('worldAgent', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
      .unique();
  },
});

export const saveScratchMutation = internalMutation({
  args: { worldId: v.id('worlds'), agentId, data: cognitiveScratchValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('cognitiveScratch')
      .withIndex('worldAgent', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, { worldId: args.worldId, agentId: args.agentId, data: args.data });
    } else {
      await ctx.db.insert('cognitiveScratch', {
        worldId: args.worldId,
        agentId: args.agentId,
        data: args.data,
      });
    }
  },
});

export const listMemoriesQuery = internalQuery({
  args: { worldId: v.id('worlds'), agentId },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('cognitiveMemories')
      .withIndex('worldAgent', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
      .collect();
    const result: CognitiveMemory[] = [];
    for (const row of rows) {
      const embeddingDoc = await ctx.db.get(row.embeddingId);
      if (!embeddingDoc) {
        continue;
      }
      result.push({
        id: row._id,
        kind: row.kind,
        description: row.description,
        poignancy: row.poignancy,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object ?? null,
        evidence: row.evidence,
        createdAtGameMin: row.createdAtGameMin,
        lastRetrievedAtGameMin: row.lastRetrievedAtGameMin,
        embedding: embeddingDoc.embedding,
      });
    }
    return result;
  },
});

export const getMemoryQuery = internalQuery({
  args: { worldId: v.id('worlds'), agentId, memoryId: v.string() },
  handler: async (ctx, args) => {
    const row = (await ctx.db.get(args.memoryId as any)) as
      | (Doc<'cognitiveMemories'> & { embeddingId: Id<'cognitiveMemoryEmbeddings'> })
      | null;
    if (!row || row.agentId !== args.agentId || row.worldId !== args.worldId) {
      return null;
    }
    const embeddingDoc = await ctx.db.get(row.embeddingId);
    if (!embeddingDoc) {
      return null;
    }
    return {
      id: row._id,
      kind: row.kind,
      description: row.description,
      poignancy: row.poignancy,
      subject: row.subject,
      predicate: row.predicate,
      object: row.object ?? null,
      evidence: row.evidence,
      createdAtGameMin: row.createdAtGameMin,
      lastRetrievedAtGameMin: row.lastRetrievedAtGameMin,
      embedding: embeddingDoc.embedding,
    } as CognitiveMemory;
  },
});

export const addMemoryMutation = internalMutation({
  args: {
    worldId: v.id('worlds'),
    agentId,
    ...cognitiveMemoryFields,
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const { worldId, agentId, embedding, ...rest } = args;
    const embeddingId = await ctx.db.insert('cognitiveMemoryEmbeddings', { agentId, embedding });
    await ctx.db.insert('cognitiveMemories', { worldId, agentId, embeddingId, ...rest });
  },
});

export const updateMemoryMutation = internalMutation({
  args: {
    worldId: v.id('worlds'),
    agentId,
    memoryId: v.string(),
    patch: cognitiveMemoryPatch,
  },
  handler: async (ctx, args) => {
    const row = (await ctx.db.get(args.memoryId as any)) as Doc<'cognitiveMemories'> | null;
    if (!row || row.agentId !== args.agentId || row.worldId !== args.worldId) {
      throw new Error(`Memory ${args.memoryId} not found for agent ${args.agentId}`);
    }
    await ctx.db.patch(row._id, args.patch as any);
  },
});

// ---------------------------------------------------------------------------
// CognitiveMemoryStore implementation backed by the tables above.
// ---------------------------------------------------------------------------

type ScratchDoc = Doc<'cognitiveScratch'>;

/**
 * Converts the module's `X | null` fields to Convex optional fields.
 */
export function scratchToDoc(scratch: CognitiveScratch): Infer<typeof cognitiveScratchValidator> {
  const currContext = scratch.currContext
    ? {
        action: scratch.currContext.action,
        description: scratch.currContext.description,
        object: scratch.currContext.object ?? undefined,
        location: scratch.currContext.location ?? undefined,
      }
    : undefined;
  return {
    name: scratch.name,
    traits: scratch.traits,
    lifestyle: scratch.lifestyle,
    stableRelationships: scratch.stableRelationships,
    dailyRequirements: scratch.dailyRequirements,
    currContext,
    dailyPlan: scratch.dailyPlan
      ? {
          day: scratch.dailyPlan.day,
          wakeUpHour: scratch.dailyPlan.wakeUpHour,
          schedules: scratch.dailyPlan.schedules.map((s) => ({
            hour: s.hour,
            action: s.action,
            object: s.object ?? undefined,
            location: s.location ?? undefined,
          })),
        }
      : undefined,
    currentAction: scratch.currentAction
      ? {
          action: scratch.currentAction.action,
          description: scratch.currentAction.description,
          startedAt: scratch.currentAction.startedAt,
          startedGameMin: scratch.currentAction.startedGameMin,
          durationGameMin: scratch.currentAction.durationGameMin,
          object: scratch.currentAction.object ?? undefined,
          location: scratch.currentAction.location ?? undefined,
        }
      : undefined,
    lastReflectionGameMin: scratch.lastReflectionGameMin ?? undefined,
  };
}

/**
 * Converts a Convex scratch document back to the module's `X | null` shape.
 */
export function scratchFromDoc(doc: ScratchDoc): CognitiveScratch {
  const data = doc.data;
  const currContext = data.currContext
    ? {
        action: data.currContext.action,
        description: data.currContext.description,
        object: data.currContext.object ?? null,
        location: data.currContext.location ?? null,
      }
    : null;
  return {
    name: data.name,
    traits: data.traits,
    lifestyle: data.lifestyle,
    stableRelationships: data.stableRelationships,
    dailyRequirements: data.dailyRequirements,
    currContext,
    dailyPlan: data.dailyPlan
      ? {
          day: data.dailyPlan.day,
          wakeUpHour: data.dailyPlan.wakeUpHour,
          schedules: data.dailyPlan.schedules.map((s) => ({
            hour: s.hour,
            action: s.action,
            object: s.object ?? null,
            location: s.location ?? null,
          })),
        }
      : null,
    currentAction: data.currentAction
      ? {
          action: data.currentAction.action,
          description: data.currentAction.description,
          startedAt: data.currentAction.startedAt,
          startedGameMin: data.currentAction.startedGameMin,
          durationGameMin: data.currentAction.durationGameMin,
          object: data.currentAction.object ?? null,
          location: data.currentAction.location ?? null,
        }
      : null,
    lastReflectionGameMin: data.lastReflectionGameMin ?? null,
  };
}

export class ConvexCognitiveStore implements CognitiveMemoryStore {
  constructor(
    private readonly ctx: ActionCtx,
    private readonly worldId: string,
    private readonly agentId: string,
  ) {}

  async getMemory(id: string): Promise<CognitiveMemory | null> {
    return await this.ctx.runQuery(internal.cognitive.stores.convexStore.getMemoryQuery, {
      worldId: this.worldId as any,
      agentId: this.agentId as any,
      memoryId: id,
    });
  }

  async listMemories(): Promise<CognitiveMemory[]> {
    return await this.ctx.runQuery(internal.cognitive.stores.convexStore.listMemoriesQuery, {
      worldId: this.worldId as any,
      agentId: this.agentId as any,
    });
  }

  async addMemory(memory: CognitiveMemory): Promise<void> {
    await this.ctx.runMutation(internal.cognitive.stores.convexStore.addMemoryMutation, {
      worldId: this.worldId as any,
      agentId: this.agentId as any,
      kind: memory.kind,
      description: memory.description,
      poignancy: memory.poignancy,
      subject: memory.subject,
      predicate: memory.predicate,
      object: memory.object ?? undefined,
      evidence: memory.evidence,
      createdAtGameMin: memory.createdAtGameMin,
      lastRetrievedAtGameMin: memory.lastRetrievedAtGameMin,
      embedding: memory.embedding,
    });
  }

  async updateMemory(id: string, patch: Partial<CognitiveMemory>): Promise<void> {
    await this.ctx.runMutation(internal.cognitive.stores.convexStore.updateMemoryMutation, {
      worldId: this.worldId as any,
      agentId: this.agentId as any,
      memoryId: id,
      patch: {
        kind: patch.kind,
        description: patch.description,
        poignancy: patch.poignancy,
        subject: patch.subject,
        predicate: patch.predicate,
        object: patch.object ?? undefined,
        evidence: patch.evidence,
        createdAtGameMin: patch.createdAtGameMin,
        lastRetrievedAtGameMin: patch.lastRetrievedAtGameMin,
      },
    });
  }

  async saveScratch(key: string, scratch: CognitiveScratch): Promise<void> {
    void key;
    await this.ctx.runMutation(internal.cognitive.stores.convexStore.saveScratchMutation, {
      worldId: this.worldId as any,
      agentId: this.agentId as any,
      data: scratchToDoc(scratch),
    });
  }

  async loadScratch(key: string): Promise<CognitiveScratch | null> {
    void key;
    const doc = await this.ctx.runQuery(internal.cognitive.stores.convexStore.getScratch, {
      worldId: this.worldId as any,
      agentId: this.agentId as any,
    });
    return doc ? scratchFromDoc(doc as ScratchDoc) : null;
  }
}
