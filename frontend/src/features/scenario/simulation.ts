import { useSyncExternalStore } from 'react';
import type { AgentMemory, AgentProfile } from '../relationship/types.ts';
import { activeScenario, compiled } from './activeScenario.ts';
import { narrateRound } from './llmAdapter.ts';

/**
 * 推演引擎 + 全局状态：手动"推进一轮"，把该轮剧情写入各角色的状态与记忆。
 * 无 LLM 时逐字回放剧情脚本；配置 VITE_LLM_API_KEY 后同一流程改由 LLM 生成。
 * UI 通过 useSimulation / getAgentProfileSnapshot 订阅，不感知数据来源。
 */

export interface AgentLiveState {
  status: { text: string; asOfRound: number };
  memories: AgentMemory[];
}

export interface SimulationState {
  round: number;
  totalRounds: number;
  advancing: boolean;
  live: Record<string, AgentLiveState>;
}

let state: SimulationState = {
  round: 0,
  totalRounds: activeScenario.rounds.length,
  advancing: false,
  live: {},
};

const listeners = new Set<() => void>();

function setState(patch: Partial<SimulationState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getSimulationState = (): SimulationState => state;

export function subscribeSimulation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSimulation(): SimulationState {
  return useSyncExternalStore(subscribeSimulation, getSimulationState);
}

/** 人设（静态）+ 推演产出（状态/记忆）的合成视图。 */
export function getAgentProfileSnapshot(id: string): AgentProfile | null {
  const base = compiled.profiles[id];
  if (!base) return null;
  const live = state.live[id];
  if (!live) return base;
  return { ...base, status: live.status, memories: live.memories };
}

export async function advanceRound(): Promise<void> {
  if (state.advancing || state.round >= state.totalRounds) return;
  setState({ advancing: true });

  const narrative = await narrateRound({
    scenario: activeScenario,
    round: state.round + 1,
  });
  if (!narrative) {
    setState({ advancing: false });
    return;
  }

  const live = { ...state.live };
  for (const beat of narrative.beats) {
    const cur = live[beat.actor] ?? {
      status: { text: '', asOfRound: 0 },
      memories: [],
    };
    live[beat.actor] = {
      status: beat.statusAfter
        ? { text: beat.statusAfter, asOfRound: narrative.round }
        : cur.status,
      memories: [
        ...cur.memories,
        {
          round: narrative.round,
          scene: narrative.scene,
          summary: beat.summary,
          stance: beat.stance,
          relatedAgentIds: beat.relatedAgentIds,
          decision: beat.decision,
        },
      ],
    };
  }
  setState({ round: narrative.round, live, advancing: false });
}

export function resetSimulation(): void {
  setState({ round: 0, live: {} });
}
