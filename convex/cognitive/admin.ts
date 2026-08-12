import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { DEFAULT_GAME_MINUTES_PER_REAL_SECOND } from '../constants';

/** Toggle the cognitive brain for a world (default: off). */
export const setCognitiveEnabled = mutation({
  args: {
    worldId: v.id('worlds'),
    cognitiveEnabled: v.boolean(),
    gameMinutesPerRealSecond: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .unique();
    if (!status) {
      throw new Error(`No world status found for world ${args.worldId}`);
    }
    await ctx.db.patch(status._id, {
      cognitiveEnabled: args.cognitiveEnabled,
      cognitiveGameMinutesPerRealSecond:
        args.gameMinutesPerRealSecond ?? DEFAULT_GAME_MINUTES_PER_REAL_SECOND,
    });
    return { cognitiveEnabled: args.cognitiveEnabled };
  },
});

/** Read the cognitive configuration of a world. */
export const getCognitiveStatus = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .unique();
    if (!status) {
      return null;
    }
    return {
      cognitiveEnabled: status.cognitiveEnabled,
      gameMinutesPerRealSecond:
        status.cognitiveGameMinutesPerRealSecond ?? DEFAULT_GAME_MINUTES_PER_REAL_SECOND,
    };
  },
});
