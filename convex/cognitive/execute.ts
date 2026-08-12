import { GameDate } from './types';
import { CognitiveScratch } from './scratch';
import { SpatialMemory } from './spatialMemory';
import { Intention } from './intentions';

/**
 * Execute: turn the current planned action into a concrete intention.
 * - if no current action is set, report null (caller wanders / idles),
 * - if the current action expires, clear it so the plan module can assign
 *   the next one,
 * - if the action has a target location we are not at, emit goTo,
 * - otherwise emit do (perform the action in place).
 *
 * Source: generative_agents/reverie/backend_server/persona/cognitive_modules/execute.py
 */
export class ExecuteModule {
  constructor(private readonly spatial: SpatialMemory) {}

  async execute(
    scratch: CognitiveScratch,
    now: GameDate,
    nowGameMin: number,
  ): Promise<Intention | null> {
    const action = scratch.currentAction;
    if (!action) {
      return null;
    }

    // The planned sub-step finished; clear it. The next step() re-enters the
    // plan module which will assign a new action (or the next schedule hour).
    if (nowGameMin - action.startedGameMin >= action.durationGameMin) {
      scratch.currentAction = null;
      scratch.currContext = null;
      return null;
    }

    if (action.location) {
      const atTarget =
        scratch.currContext?.location?.sector === action.location.sector &&
        scratch.currContext?.location?.arena === action.location.arena;
      if (!atTarget) {
        const located = this.spatial.findObject(action.object ?? '');
        const target = located
          ? { sector: located.sector, arena: located.arena, x: located.object.x, y: located.object.y }
          : { sector: action.location.sector, arena: action.location.arena, x: 0, y: 0 };
        scratch.currContext = {
          action: action.action,
          description: action.description,
          object: action.object,
          location: action.location,
        };
        return {
          kind: 'goTo',
          location: target,
          description: action.description,
        };
      }
    }

    return {
      kind: 'do',
      description: action.description,
      emoji: emojiFor(action.action),
      durationGameMin: action.durationGameMin,
      location: action.location ? { sector: action.location.sector, arena: action.location.arena, x: 0, y: 0 } : undefined,
    };
  }
}

export function emojiFor(action: string): string {
  const lowered = action.toLowerCase();
  if (lowered.includes('sleep') || lowered.includes('rest')) return '😴';
  if (lowered.includes('read') || lowered.includes('study')) return '📖';
  if (lowered.includes('eat') || lowered.includes('cook') || lowered.includes('breakfast') || lowered.includes('lunch') || lowered.includes('dinner')) return '🍽️';
  if (lowered.includes('work')) return '💼';
  if (lowered.includes('walk') || lowered.includes('go to')) return '🚶';
  if (lowered.includes('talk') || lowered.includes('chat')) return '💬';
  if (lowered.includes('wake')) return '⏰';
  return '✨';
}
