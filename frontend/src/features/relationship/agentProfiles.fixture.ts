import type { AgentMemory, AgentProfile } from './types.ts';
import { compiled } from '../scenario/activeScenario.ts';
import { getAgentProfileSnapshot } from '../scenario/simulation.ts';

/**
 * Agent 档案数据层。
 * 人设来自剧情编译产物（features/scenario），状态与记忆来自推演引擎当前轮次。
 * 组件只依赖 getAgentProfile 这一入口，未来接入真实 agent memory API 时
 * 仅需替换此实现，组件零改动。
 */

export const agentProfileFixtures: Record<string, AgentProfile> = compiled.profiles;

/** 数据层入口：人设 + 当前轮次状态/记忆的合成视图。 */
export function getAgentProfile(id: string): Promise<AgentProfile | null> {
  return Promise.resolve(getAgentProfileSnapshot(id));
}

/** 按轮次倒序。 */
export function sortMemoriesByRoundDesc(memories: AgentMemory[]): AgentMemory[] {
  return [...memories].sort((a, b) => b.round - a.round);
}

/** “只看与某人物/机构有关的记忆”。 */
export function filterMemoriesByAgent(
  memories: AgentMemory[],
  agentId: string,
): AgentMemory[] {
  return memories.filter((m) => m.relatedAgentIds.includes(agentId));
}
