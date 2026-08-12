import { GameDate } from './types';

/**
 * The agent's scratch memory: a lightweight mutable "state of self" that is
 * serialized every step, faithful to
 * generative_agents/reverie/backend_server/persona/memory_structures/scratch.py
 */
export interface HourlySchedule {
  hour: number;
  action: string;
  object: string | null;
  location: { sector: string; arena: string } | null;
}

export interface DailyPlan {
  day: number;
  wakeUpHour: number;
  schedules: HourlySchedule[];
}

export interface CurrentAction {
  action: string;
  description: string;
  startedAt: GameDate;
  // Absolute game-minute count at start (startDay-relative), so execution
  // can compare against gameMinute() consistently.
  startedGameMin: number;
  durationGameMin: number;
  object: string | null;
  location: { sector: string; arena: string } | null;
}

export interface CurrContext {
  action: string;
  description: string;
  object: string | null;
  location: { sector: string; arena: string } | null;
}

export interface CognitiveScratch {
  name: string;
  traits: string[];
  lifestyle: { wakeUpHour: number; sleepHour: number };
  stableRelationships: { name: string; relationship: string }[];
  dailyRequirements: string[];
  currContext: CurrContext | null;
  dailyPlan: DailyPlan | null;
  currentAction: CurrentAction | null;
  lastReflectionGameMin: number | null;
}

export function createScratch(identity: {
  name: string;
  description: string;
}): CognitiveScratch {
  return {
    name: identity.name,
    traits: [identity.description],
    lifestyle: { wakeUpHour: 6, sleepHour: 22 },
    stableRelationships: [],
    dailyRequirements: [],
    currContext: null,
    dailyPlan: null,
    currentAction: null,
    lastReflectionGameMin: null,
  };
}

export function addStableRelationship(
  scratch: CognitiveScratch,
  name: string,
  relationship: string,
) {
  if (!scratch.stableRelationships.some((r) => r.name === name)) {
    scratch.stableRelationships.push({ name, relationship });
  }
}
