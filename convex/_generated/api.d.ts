/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_conversation from "../agent/conversation.js";
import type * as agent_embeddingsCache from "../agent/embeddingsCache.js";
import type * as agent_memory from "../agent/memory.js";
import type * as aiTown_agent from "../aiTown/agent.js";
import type * as aiTown_agentDescription from "../aiTown/agentDescription.js";
import type * as aiTown_agentInputs from "../aiTown/agentInputs.js";
import type * as aiTown_agentOperations from "../aiTown/agentOperations.js";
import type * as aiTown_conversation from "../aiTown/conversation.js";
import type * as aiTown_conversationMembership from "../aiTown/conversationMembership.js";
import type * as aiTown_game from "../aiTown/game.js";
import type * as aiTown_ids from "../aiTown/ids.js";
import type * as aiTown_inputHandler from "../aiTown/inputHandler.js";
import type * as aiTown_inputs from "../aiTown/inputs.js";
import type * as aiTown_insertInput from "../aiTown/insertInput.js";
import type * as aiTown_location from "../aiTown/location.js";
import type * as aiTown_main from "../aiTown/main.js";
import type * as aiTown_movement from "../aiTown/movement.js";
import type * as aiTown_player from "../aiTown/player.js";
import type * as aiTown_playerDescription from "../aiTown/playerDescription.js";
import type * as aiTown_world from "../aiTown/world.js";
import type * as aiTown_worldMap from "../aiTown/worldMap.js";
import type * as cognitive_adapter from "../cognitive/adapter.js";
import type * as cognitive_admin from "../cognitive/admin.js";
import type * as cognitive_associativeMemory from "../cognitive/associativeMemory.js";
import type * as cognitive_converse from "../cognitive/converse.js";
import type * as cognitive_dialogue from "../cognitive/dialogue.js";
import type * as cognitive_engine from "../cognitive/engine.js";
import type * as cognitive_execute from "../cognitive/execute.js";
import type * as cognitive_index from "../cognitive/index.js";
import type * as cognitive_intentions from "../cognitive/intentions.js";
import type * as cognitive_llm from "../cognitive/llm.js";
import type * as cognitive_memoryStore from "../cognitive/memoryStore.js";
import type * as cognitive_perceive from "../cognitive/perceive.js";
import type * as cognitive_plan from "../cognitive/plan.js";
import type * as cognitive_prompts_chat from "../cognitive/prompts/chat.js";
import type * as cognitive_prompts_dailyPlanning from "../cognitive/prompts/dailyPlanning.js";
import type * as cognitive_prompts_decideToTalk from "../cognitive/prompts/decideToTalk.js";
import type * as cognitive_prompts_eventTriple from "../cognitive/prompts/eventTriple.js";
import type * as cognitive_prompts_focalPoint from "../cognitive/prompts/focalPoint.js";
import type * as cognitive_prompts_hourlySchedule from "../cognitive/prompts/hourlySchedule.js";
import type * as cognitive_prompts_index from "../cognitive/prompts/index.js";
import type * as cognitive_prompts_poignancy from "../cognitive/prompts/poignancy.js";
import type * as cognitive_prompts_promptTypes from "../cognitive/prompts/promptTypes.js";
import type * as cognitive_prompts_reflect from "../cognitive/prompts/reflect.js";
import type * as cognitive_prompts_summarizeConversation from "../cognitive/prompts/summarizeConversation.js";
import type * as cognitive_prompts_taskDecomposition from "../cognitive/prompts/taskDecomposition.js";
import type * as cognitive_reflect from "../cognitive/reflect.js";
import type * as cognitive_retrieve from "../cognitive/retrieve.js";
import type * as cognitive_scratch from "../cognitive/scratch.js";
import type * as cognitive_spatialData from "../cognitive/spatialData.js";
import type * as cognitive_spatialMemory from "../cognitive/spatialMemory.js";
import type * as cognitive_stores_convexStore from "../cognitive/stores/convexStore.js";
import type * as cognitive_stores_inMemoryStore from "../cognitive/stores/inMemoryStore.js";
import type * as cognitive_time from "../cognitive/time.js";
import type * as cognitive_types from "../cognitive/types.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as engine_abstractGame from "../engine/abstractGame.js";
import type * as engine_historicalObject from "../engine/historicalObject.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as messages from "../messages.js";
import type * as music from "../music.js";
import type * as testing from "../testing.js";
import type * as util_FastIntegerCompression from "../util/FastIntegerCompression.js";
import type * as util_assertNever from "../util/assertNever.js";
import type * as util_asyncMap from "../util/asyncMap.js";
import type * as util_compression from "../util/compression.js";
import type * as util_geometry from "../util/geometry.js";
import type * as util_isSimpleObject from "../util/isSimpleObject.js";
import type * as util_llm from "../util/llm.js";
import type * as util_minheap from "../util/minheap.js";
import type * as util_object from "../util/object.js";
import type * as util_sleep from "../util/sleep.js";
import type * as util_types from "../util/types.js";
import type * as util_xxhash from "../util/xxhash.js";
import type * as world from "../world.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/conversation": typeof agent_conversation;
  "agent/embeddingsCache": typeof agent_embeddingsCache;
  "agent/memory": typeof agent_memory;
  "aiTown/agent": typeof aiTown_agent;
  "aiTown/agentDescription": typeof aiTown_agentDescription;
  "aiTown/agentInputs": typeof aiTown_agentInputs;
  "aiTown/agentOperations": typeof aiTown_agentOperations;
  "aiTown/conversation": typeof aiTown_conversation;
  "aiTown/conversationMembership": typeof aiTown_conversationMembership;
  "aiTown/game": typeof aiTown_game;
  "aiTown/ids": typeof aiTown_ids;
  "aiTown/inputHandler": typeof aiTown_inputHandler;
  "aiTown/inputs": typeof aiTown_inputs;
  "aiTown/insertInput": typeof aiTown_insertInput;
  "aiTown/location": typeof aiTown_location;
  "aiTown/main": typeof aiTown_main;
  "aiTown/movement": typeof aiTown_movement;
  "aiTown/player": typeof aiTown_player;
  "aiTown/playerDescription": typeof aiTown_playerDescription;
  "aiTown/world": typeof aiTown_world;
  "aiTown/worldMap": typeof aiTown_worldMap;
  "cognitive/adapter": typeof cognitive_adapter;
  "cognitive/admin": typeof cognitive_admin;
  "cognitive/associativeMemory": typeof cognitive_associativeMemory;
  "cognitive/converse": typeof cognitive_converse;
  "cognitive/dialogue": typeof cognitive_dialogue;
  "cognitive/engine": typeof cognitive_engine;
  "cognitive/execute": typeof cognitive_execute;
  "cognitive/index": typeof cognitive_index;
  "cognitive/intentions": typeof cognitive_intentions;
  "cognitive/llm": typeof cognitive_llm;
  "cognitive/memoryStore": typeof cognitive_memoryStore;
  "cognitive/perceive": typeof cognitive_perceive;
  "cognitive/plan": typeof cognitive_plan;
  "cognitive/prompts/chat": typeof cognitive_prompts_chat;
  "cognitive/prompts/dailyPlanning": typeof cognitive_prompts_dailyPlanning;
  "cognitive/prompts/decideToTalk": typeof cognitive_prompts_decideToTalk;
  "cognitive/prompts/eventTriple": typeof cognitive_prompts_eventTriple;
  "cognitive/prompts/focalPoint": typeof cognitive_prompts_focalPoint;
  "cognitive/prompts/hourlySchedule": typeof cognitive_prompts_hourlySchedule;
  "cognitive/prompts/index": typeof cognitive_prompts_index;
  "cognitive/prompts/poignancy": typeof cognitive_prompts_poignancy;
  "cognitive/prompts/promptTypes": typeof cognitive_prompts_promptTypes;
  "cognitive/prompts/reflect": typeof cognitive_prompts_reflect;
  "cognitive/prompts/summarizeConversation": typeof cognitive_prompts_summarizeConversation;
  "cognitive/prompts/taskDecomposition": typeof cognitive_prompts_taskDecomposition;
  "cognitive/reflect": typeof cognitive_reflect;
  "cognitive/retrieve": typeof cognitive_retrieve;
  "cognitive/scratch": typeof cognitive_scratch;
  "cognitive/spatialData": typeof cognitive_spatialData;
  "cognitive/spatialMemory": typeof cognitive_spatialMemory;
  "cognitive/stores/convexStore": typeof cognitive_stores_convexStore;
  "cognitive/stores/inMemoryStore": typeof cognitive_stores_inMemoryStore;
  "cognitive/time": typeof cognitive_time;
  "cognitive/types": typeof cognitive_types;
  constants: typeof constants;
  crons: typeof crons;
  "engine/abstractGame": typeof engine_abstractGame;
  "engine/historicalObject": typeof engine_historicalObject;
  http: typeof http;
  init: typeof init;
  messages: typeof messages;
  music: typeof music;
  testing: typeof testing;
  "util/FastIntegerCompression": typeof util_FastIntegerCompression;
  "util/assertNever": typeof util_assertNever;
  "util/asyncMap": typeof util_asyncMap;
  "util/compression": typeof util_compression;
  "util/geometry": typeof util_geometry;
  "util/isSimpleObject": typeof util_isSimpleObject;
  "util/llm": typeof util_llm;
  "util/minheap": typeof util_minheap;
  "util/object": typeof util_object;
  "util/sleep": typeof util_sleep;
  "util/types": typeof util_types;
  "util/xxhash": typeof util_xxhash;
  world: typeof world;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
