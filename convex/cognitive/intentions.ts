import { WorldArea } from './types';

/**
 * Intentions are the only output the cognitive module produces. They are
 * deliberately engine-agnostic: a thin adapter (phase 2) translates them
 * into the existing aiTown engine's inputs (movePlayer, conversation
 * invites, activities).
 */
export type Intention =
  | { kind: 'goTo'; location: WorldArea; description: string }
  | { kind: 'talkTo'; targetId: string; targetName: string }
  | { kind: 'do'; description: string; emoji: string; durationGameMin: number; location?: WorldArea }
  | { kind: 'wander' }
  | { kind: 'sleep' }
  | { kind: 'idle'; until: number };

export const DO_EMOJI_BY_ACTION: Record<string, string> = {
  'wake up': '⏰',
  'sleep': '😴',
  'read': '📖',
  'reading': '📖',
  'work': '💼',
  'eat': '🍽️',
  'cook': '🍳',
  'walk': '🚶',
  'talk': '💬',
  'rest': '🛋️',
};
