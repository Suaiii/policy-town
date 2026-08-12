import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import { ActionCtx, internalAction, internalQuery } from '../_generated/server';
import { CognitiveAgent } from './index';
import { GameTime } from './time';
import { ConvexCognitiveStore } from './stores/convexStore';
import { buildSensoryInput, translateIntention } from './adapter';
import { buildSpatialTree, configForMap } from './spatialData';
import { COGNITIVE_VISION_RADIUS, DEFAULT_GAME_MINUTES_PER_REAL_SECOND } from '../constants';
import { agentId, conversationId, playerId } from '../aiTown/ids';
import { blockedWithPositions } from '../aiTown/movement';
import { WorldMap, serializedWorldMap } from '../aiTown/worldMap';
import { serializedPlayer } from '../aiTown/player';

export interface CognitiveStatus {
  cognitiveEnabled: boolean;
  gameMinutesPerRealSecond: number;
  worldCreatedAt: number;
  now: number;
}

// ---------------------------------------------------------------------------
// Internal queries
// ---------------------------------------------------------------------------

export const getCognitiveStatusQuery = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args): Promise<CognitiveStatus | null> => {
    const status = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .unique();
    if (!status) {
      return null;
    }
    const world = await ctx.db.get(args.worldId);
    const engine = await ctx.db.get(status.engineId);
    if (!world || !engine) {
      return null;
    }
    return {
      cognitiveEnabled: status.cognitiveEnabled,
      gameMinutesPerRealSecond:
        status.cognitiveGameMinutesPerRealSecond ?? DEFAULT_GAME_MINUTES_PER_REAL_SECOND,
      worldCreatedAt: world._creationTime,
      now: engine.currentTime ?? Date.now(),
    };
  },
});

export interface CognitiveChatData extends CognitiveStatus {
  selfName: string;
  selfDescription: string;
  otherName: string;
  otherDescription: string;
  history: { speaker: string; utterance: string }[];
}

export const cognitiveChatData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    otherPlayerId: playerId,
    conversationId,
  },
  handler: async (ctx, args): Promise<CognitiveChatData> => {
    const status = await ctx.runQuery(internal.cognitive.engine.getCognitiveStatusQuery, {
      worldId: args.worldId,
    });
    if (!status) {
      throw new Error(`No cognitive status for world ${args.worldId}`);
    }
    const descriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const self = descriptions.find((d) => d.playerId === args.playerId);
    const other = descriptions.find((d) => d.playerId === args.otherPlayerId);
    if (!self || !other) {
      throw new Error(`Missing player descriptions in world ${args.worldId}`);
    }
    const messages = await ctx.runQuery(internal.agent.memory.loadMessages, {
      worldId: args.worldId,
      conversationId: args.conversationId,
    });
    const history = messages.map((m) => ({
      speaker: m.author === args.playerId ? self.name : other.name,
      utterance: m.text,
    }));
    return {
      ...status,
      selfName: self.name,
      selfDescription: self.description,
      otherName: other.name,
      otherDescription: other.description,
      history,
    };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface CognitiveEngineOptions {
  worldId: string;
  agentId: string;
  name: string;
  description: string;
  gameMinutesPerRealSecond: number;
  worldCreatedAt: number;
}

export function buildCognitiveAgent(
  ctx: ActionCtx,
  options: CognitiveEngineOptions,
  map: { width: number; height: number; tileSetUrl: string },
): CognitiveAgent {
  const gameTime = new GameTime(options.worldCreatedAt, {
    gameMinutesPerRealSecond: options.gameMinutesPerRealSecond,
  });
  const store = new ConvexCognitiveStore(ctx, options.worldId, options.agentId);
  const spatial = buildSpatialTree(map);
  return new CognitiveAgent({
    identity: { name: options.name, description: options.description },
    store,
    spatial,
    gameTime,
    scratchKey: `scratch:${options.agentId}`,
  });
}

// ---------------------------------------------------------------------------
// Full cognitive step (perceive -> retrieve -> plan -> execute) emitted by
// the engine's agent tick when cognitive is enabled for the world.
// ---------------------------------------------------------------------------

export const agentCognitiveStep = internalAction({
  args: {
    worldId: v.id('worlds'),
    agentId,
    playerId,
    operationId: v.string(),
    name: v.string(),
    description: v.string(),
    player: v.object(serializedPlayer),
    players: v.array(v.object(serializedPlayer)),
    playerNames: v.array(v.object({ playerId, name: v.string() })),
    conversations: v.array(v.object({ participants: v.array(playerId) })),
    map: v.object(serializedWorldMap),
  },
  handler: async (ctx, args) => {
    const status = await ctx.runQuery(internal.cognitive.engine.getCognitiveStatusQuery, {
      worldId: args.worldId,
    });
    if (!status?.cognitiveEnabled) {
      console.debug(`Cognitive disabled for world ${args.worldId}, skipping step`);
      return;
    }

    const agent = buildCognitiveAgent(
      ctx,
      {
        worldId: args.worldId,
        agentId: args.agentId,
        name: args.name,
        description: args.description,
        gameMinutesPerRealSecond: status.gameMinutesPerRealSecond,
        worldCreatedAt: status.worldCreatedAt,
      },
      { width: args.map.width, height: args.map.height, tileSetUrl: args.map.tileSetUrl },
    );
    await agent.initialize();

    const mapConfig = configForMap({
      width: args.map.width,
      height: args.map.height,
      tileSetUrl: args.map.tileSetUrl,
    });
    const names = new Map(args.playerNames.map((p) => [p.playerId, p.name]));
    const areas = mapConfig.map((a) => ({ sector: a.sector, arena: a.arena, x: a.x, y: a.y }));
    const objectsInArena = mapConfig.flatMap((a) =>
      Object.entries(a.objects ?? {}).map(([name, o]) => ({
        name,
        arena: a.arena,
        x: o.x,
        y: o.y,
      })),
    );

    const sensory = buildSensoryInput({
      playerId: args.playerId,
      playerPosition: args.player.position,
      players: args.players.map((p) => ({
        id: p.id,
        name: names.get(p.id) ?? p.id,
        position: p.position,
        activity: p.activity ? { description: p.activity.description } : null,
        pathfinding: p.pathfinding,
        human: p.human,
      })),
      conversations: args.conversations,
      areas,
      objectsInArena,
      visionRadius: COGNITIVE_VISION_RADIUS,
    });

    const result = await agent.step(sensory, status.now);

    const worldMap = new WorldMap(args.map);
    const otherPositions = args.players
      .filter((p) => p.id !== args.playerId)
      .map((p) => p.position);
    const isBlocked = (x: number, y: number) =>
      blockedWithPositions({ x, y }, otherPositions, worldMap) !== null;

    const plan = translateIntention(result.intention, {
      map: { width: args.map.width, height: args.map.height },
      playerPosition: args.player.position,
      now: status.now,
      gameTime: agent.gameTime,
      isBlocked,
    });

    // When nothing is scheduled and the agent is free, decide whether to
    // approach a nearby free agent (decide_to_talk).
    if (!plan.invitee && result.intention === null) {
      const freeOthers = sensory.visibleAgents
        .filter((a) => !a.inConversation && !a.currentAction)
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - args.player.position.x, a.position.y - args.player.position.y) -
            Math.hypot(b.position.x - args.player.position.x, b.position.y - args.player.position.y),
        );
      const candidate = freeOthers[0];
      if (candidate) {
        const selfMemories = await agent.retrieve(candidate.name, 4);
        const shouldTalk = await agent.converse.decideToTalk(
          agent.scratch,
          { id: candidate.id, name: candidate.name, identity: candidate.name, currentAction: null },
          selfMemories,
          [],
        );
        if (shouldTalk) {
          plan.invitee = candidate.id;
          console.log(`Cognitive agent ${args.agentId} decided to talk to ${candidate.name}`);
        }
      }
    }

    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agentId,
        ...(plan.destination ? { destination: plan.destination } : {}),
        ...(plan.activity ? { activity: plan.activity } : {}),
        ...(plan.invitee ? { invitee: plan.invitee } : {}),
      },
    });
  },
});

// ---------------------------------------------------------------------------
// Conversation messages generated by the cognitive brain (dialogue takeover).
// ---------------------------------------------------------------------------

export async function generateCognitiveChatLine(
  ctx: ActionCtx,
  args: {
    worldId: string;
    playerId: string;
    otherPlayerId: string;
    conversationId: string;
    type: 'start' | 'continue';
  },
): Promise<string> {
  const data = await ctx.runQuery(internal.cognitive.engine.cognitiveChatData, {
    worldId: args.worldId as any,
    playerId: args.playerId,
    otherPlayerId: args.otherPlayerId,
    conversationId: args.conversationId,
  });
  const agent = buildCognitiveAgent(
    ctx,
    {
      worldId: args.worldId,
      agentId: args.playerId,
      name: data.selfName,
      description: data.selfDescription,
      gameMinutesPerRealSecond: data.gameMinutesPerRealSecond,
      worldCreatedAt: data.worldCreatedAt,
    },
    { width: 1, height: 1, tileSetUrl: '' },
  );
  await agent.initialize();
  const context = await agent.retrieve(`talking to ${data.otherName}`, 4);
  const { utterance } = await agent.converse.generateNextLine({
    scratch: agent.scratch,
    target: {
      id: args.otherPlayerId,
      name: data.otherName,
      identity: data.otherDescription,
      currentAction: null,
    },
    context,
    history: args.type === 'continue' ? data.history : [],
    topic: args.type === 'start' ? `greeting ${data.otherName}` : undefined,
  });
  return utterance;
}

export async function cognitiveRememberConversation(
  ctx: ActionCtx,
  args: {
    worldId: string;
    agentId: string;
    playerId: string;
    conversationId: string;
  },
): Promise<void> {
  const status = await ctx.runQuery(internal.cognitive.engine.getCognitiveStatusQuery, {
    worldId: args.worldId as any,
  });
  if (!status) {
    return;
  }
  const chatData = await ctx.runQuery(internal.cognitive.engine.cognitiveChatData, {
    worldId: args.worldId as any,
    playerId: args.playerId,
    otherPlayerId: args.playerId,
    conversationId: args.conversationId,
  });
  // Resolve the actual conversation partner (loadConversation joins the
  // archived conversation + participatedTogether graph).
  const conversation = await ctx.runQuery(internal.agent.memory.loadConversation, {
    worldId: args.worldId as any,
    playerId: args.playerId,
    conversationId: args.conversationId,
  });
  const otherName = conversation.otherPlayer.name;
  const messages = chatData.history;

  const agent = buildCognitiveAgent(
    ctx,
    {
      worldId: args.worldId,
      agentId: args.agentId,
      name: chatData.selfName,
      description: chatData.selfDescription,
      gameMinutesPerRealSecond: status.gameMinutesPerRealSecond,
      worldCreatedAt: status.worldCreatedAt,
    },
    { width: 1, height: 1, tileSetUrl: '' },
  );
  await agent.initialize();

  const summary = await agent.summarizeConversation(messages, otherName);
  await agent.rememberConversation({
    otherName,
    summary,
    nowGameMin: agent.gameTime.gameMinute(status.now),
  });
  if (!agent.scratch.stableRelationships.some((r) => r.name === otherName)) {
    agent.scratch.stableRelationships.push({ name: otherName, relationship: 'acquaintance' });
  }
  await agent.persist();
  console.log(`Cognitive agent ${args.agentId} remembered conversation with ${otherName}`);
}

// ---------------------------------------------------------------------------
// Exported helper used by the aiTown layer.
// ---------------------------------------------------------------------------

export async function isCognitiveEnabled(ctx: ActionCtx, worldId: string): Promise<boolean> {
  const status = await ctx.runQuery(internal.cognitive.engine.getCognitiveStatusQuery, {
    worldId: worldId as any,
  });
  return status?.cognitiveEnabled ?? false;
}
