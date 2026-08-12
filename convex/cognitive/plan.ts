import { GameDate } from './types';
import { CognitiveScratch, CurrentAction, DailyPlan, HourlySchedule } from './scratch';
import { SpatialMemory } from './spatialMemory';
import { LLMService, parseJson } from './llm';
import { dailyPlanningPrompt, hourlySchedulePrompt, taskDecompositionPrompt } from './prompts';
import { HourlyScheduleLine, TaskStep } from './prompts';

export const DEFAULT_HOURLY_TASK_MINUTES = 60;
const MAX_SCHEDULE_GENERATION_ATTEMPTS = 3;

/**
 * Plan: maintain the agent's daily plan and hour-by-hour schedule, and
 * decompose the current hour into concrete sub-steps when it starts.
 *
 * Source: generative_agents/reverie/backend_server/persona/cognitive_modules/plan.py
 */
export class PlanModule {
  constructor(private readonly llm: LLMService) {}

  async plan(
    scratch: CognitiveScratch,
    now: GameDate,
    nowGameMin: number,
    spatial: SpatialMemory,
    hourlyTaskMinutes: number = DEFAULT_HOURLY_TASK_MINUTES,
  ): Promise<DailyPlan | null> {
    const newDay = !scratch.dailyPlan || scratch.dailyPlan.day !== now.day;
    if (newDay) {
      scratch.dailyPlan = await this.generateDailyPlan(scratch, now, spatial);
    }

    // At the top of the planned hour (or when the plan is fresh), set the
    // current action if none is running.
    if (scratch.dailyPlan && scratch.currentAction == null) {
      const schedule = scratch.dailyPlan.schedules.find((s) => s.hour === now.hour);
      if (schedule) {
        scratch.currentAction = await this.decomposeAction(scratch, schedule, now, nowGameMin, hourlyTaskMinutes);
      }
    }
    return scratch.dailyPlan;
  }

  private async generateDailyPlan(
    scratch: CognitiveScratch,
    now: GameDate,
    spatial: SpatialMemory,
  ): Promise<DailyPlan> {
    const identity = scratch.traits.join('. ');
    const wakeUpHour = await this.generateWakeUpHour(scratch, identity);
    scratch.lifestyle.wakeUpHour = wakeUpHour;

    const schedules = await this.generateHourlySchedules(scratch, identity, spatial);
    return { day: now.day, wakeUpHour, schedules };
  }

  private async generateWakeUpHour(scratch: CognitiveScratch, identity: string): Promise<number> {
    const raw = await this.llm.chat(
      dailyPlanningPrompt({
        name: scratch.name,
        identity,
        wakeUpHour: scratch.lifestyle.wakeUpHour,
        sleepHour: scratch.lifestyle.sleepHour,
      }),
      { temperature: 0, json: true },
    );
    const parsed = parseJson<{ wake_up_hour?: number }>(raw);
    const hour = parsed?.wake_up_hour;
    if (typeof hour === 'number' && hour >= 0 && hour <= 23) {
      return Math.floor(hour);
    }
    return scratch.lifestyle.wakeUpHour;
  }

  private async generateHourlySchedules(
    scratch: CognitiveScratch,
    identity: string,
    spatial: SpatialMemory,
  ): Promise<HourlySchedule[]> {
    const locations = spatial
      .getSectors()
      .flatMap((sector) => spatial.getArenas(sector).map((arena) => `${arena} (${sector})`));
    for (let attempt = 0; attempt < MAX_SCHEDULE_GENERATION_ATTEMPTS; attempt++) {
      const raw = await this.llm.chat(
        hourlySchedulePrompt({
          name: scratch.name,
          identity,
          wakeUpHour: scratch.lifestyle.wakeUpHour,
          sleepHour: scratch.lifestyle.sleepHour,
          locations,
        }),
        { temperature: 0.7, json: true },
      );
      const parsed = parseJson<{ schedules?: HourlyScheduleLine[] }>(raw);
      const lines = parsed?.schedules ?? [];
      const valid = lines.filter(
        (s) =>
          typeof s.hour === 'number' &&
          typeof s.action === 'string' &&
          s.hour >= scratch.lifestyle.wakeUpHour &&
          s.hour < scratch.lifestyle.sleepHour,
      );
      if (valid.length > 0) {
        return valid.map((s) => ({
          hour: Math.floor(s.hour),
          action: s.action,
          object: s.object ?? null,
          location: s.location
            ? resolveLocation(s.location, spatial)
            : null,
        }));
      }
    }
    // Fallback: a quiet day.
    return [{ hour: scratch.lifestyle.wakeUpHour, action: 'read a book', object: null, location: null }];
  }

  private async decomposeAction(
    scratch: CognitiveScratch,
    schedule: HourlySchedule,
    now: GameDate,
    nowGameMin: number,
    hourlyTaskMinutes: number,
  ): Promise<CurrentAction> {
    const steps = await this.generateTaskSteps(scratch, schedule, hourlyTaskMinutes);
    const description = steps.length > 0 ? steps[0].description : schedule.action;
    const durationGameMin = steps.length > 0 ? steps[0].minutes : hourlyTaskMinutes;
    return {
      action: schedule.action,
      description,
      startedAt: now,
      startedGameMin: nowGameMin,
      durationGameMin: Math.max(1, durationGameMin),
      object: schedule.object,
      location: schedule.location,
    };
  }

  private async generateTaskSteps(
    scratch: CognitiveScratch,
    schedule: HourlySchedule,
    hourlyTaskMinutes: number,
  ): Promise<TaskStep[]> {
    const raw = await this.llm.chat(
      taskDecompositionPrompt({
        name: scratch.name,
        identity: scratch.traits.join('. '),
        action: schedule.action,
        object: schedule.object,
        location: schedule.location ? `${schedule.location.arena} (${schedule.location.sector})` : null,
        hourlyTaskMinutes,
      }),
      { temperature: 0.5, json: true },
    );
    const parsed = parseJson<{ steps?: TaskStep[] }>(raw);
    const steps = (parsed?.steps ?? []).filter(
      (s) => typeof s.description === 'string' && typeof s.minutes === 'number' && s.minutes > 0,
    );
    if (steps.length === 0) {
      return [{ description: schedule.action, minutes: hourlyTaskMinutes }];
    }
    // Normalize durations to sum to the hour.
    const total = steps.reduce((sum, s) => sum + s.minutes, 0);
    return total === hourlyTaskMinutes
      ? steps
      : steps.map((s) => ({
          description: s.description,
          minutes: Math.max(1, Math.round((s.minutes / total) * hourlyTaskMinutes)),
        }));
  }
}

function resolveLocation(
  name: string,
  spatial: SpatialMemory,
): { sector: string; arena: string } | null {
  for (const sector of spatial.getSectors()) {
    for (const arena of spatial.getArenas(sector)) {
      if (arena.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(arena.toLowerCase())) {
        return { sector, arena };
      }
    }
  }
  const arena = spatial.sampleArena();
  return arena ? { sector: arena.sector, arena: arena.arena } : null;
}
