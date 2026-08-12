import { GameDate } from './types';

export interface GameClockConfig {
  // How many game-minutes pass per real second.
  // At the paper's pacing a game day (~1440 game-minutes) takes ~10-16 real
  // minutes, so values around 1.5-2.4 are sensible. Default: 2 (12 min/day).
  gameMinutesPerRealSecond: number;
  // Day index of the first simulated day (0 = day 0).
  startDay?: number;
}

export const DEFAULT_GAME_CLOCK_CONFIG: GameClockConfig = {
  gameMinutesPerRealSecond: 2,
  startDay: 0,
};

export const GAME_MINUTES_PER_DAY = 24 * 60;

/** Total game-minutes that elapsed for a real duration. */
export function toGameMinutes(realMs: number, config: GameClockConfig): number {
  return (realMs / 1000) * config.gameMinutesPerRealSecond;
}

/** Convert an absolute game-minute count to a (day, hour, minute) date. */
export function minutesToDate(totalGameMinutes: number, startDay = 0): GameDate {
  const day = startDay + Math.floor(totalGameMinutes / GAME_MINUTES_PER_DAY);
  const rem = Math.floor(totalGameMinutes) % GAME_MINUTES_PER_DAY;
  return { day, hour: Math.floor(rem / 60), minute: rem % 60 };
}

/** Convert a (day, hour, minute) date to absolute game-minutes. */
export function dateToGameMinute(date: GameDate, startDay = 0): number {
  return (date.day - startDay) * GAME_MINUTES_PER_DAY + date.hour * 60 + date.minute;
}

/**
 * Self-contained game clock for the cognitive module. It derives a
 * game (day, hour, minute) from a base real timestamp plus a configurable
 * compression factor, so it is pure, serializable, and testable without
 * touching the engine's real-time loop.
 *
 * Source of concept: generative_agents/reverie/backend_server/reverie.py
 */
export class GameTime {
  constructor(
    private readonly baseRealTs: number,
    private readonly config: GameClockConfig = DEFAULT_GAME_CLOCK_CONFIG,
  ) {}

  get startDay(): number {
    return this.config.startDay ?? 0;
  }

  /** Current game date at the given real timestamp. */
  now(realTs: number = Date.now()): GameDate {
    return minutesToDate(toGameMinutes(realTs - this.baseRealTs, this.config), this.startDay);
  }

  /** Current absolute game-minute count at the given real timestamp. */
  gameMinute(realTs: number = Date.now()): number {
    return dateToGameMinute(this.now(realTs), this.startDay);
  }

  /** Duration of a real duration in game minutes. */
  realToGameMinute(realMs: number): number {
    return toGameMinutes(realMs, this.config);
  }

  serialize(): { baseRealTs: number; config: GameClockConfig } {
    return { baseRealTs: this.baseRealTs, config: this.config };
  }

  static deserialize(data: { baseRealTs: number; config: GameClockConfig }): GameTime {
    return new GameTime(data.baseRealTs, data.config);
  }
}
