import type {
  AgentMemory,
  AgentProfile,
  GraphEdge,
  GraphNode,
} from '../relationship/types.ts';
import type { ScenarioFile } from './schema.ts';
import { ROLE_KIND_TO_NODE_KIND } from './schema.ts';

/**
 * 剧情编译器：把一份 ScenarioFile 编译为关系图与 Agent 档案所需的全部数据。
 * 人设与初始结构在此一次成型；轮次剧情（rounds）由推演引擎逐轮应用。
 */

export interface CompiledScenario {
  meta: ScenarioFile['meta'];
  /** 有完整人设、可点开档案的角色（含 institution 的简易档案） */
  profiles: Record<string, AgentProfile>;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  rounds: ScenarioFile['rounds'];
}

export function compileScenario(scenario: ScenarioFile): CompiledScenario {
  const graphNodes: GraphNode[] = scenario.roles.map((role) => ({
    uuid: role.id,
    name: role.name,
    labels: ['Entity', ROLE_KIND_TO_NODE_KIND[role.kind]],
    x: role.position.x,
    y: role.position.y,
    summary: role.summary ?? role.persona.identity,
    attributes: role.attributes ?? { 职务: role.title, 阵营: role.faction },
    icon: role.icon,
    agentId: role.id,
  }));

  const graphEdges: GraphEdge[] = scenario.edges.map((e) => ({
    uuid: `${e.from}-${e.to}`,
    source_node_uuid: e.from,
    target_node_uuid: e.to,
    name: e.name,
    fact_type: e.name,
    fact: e.fact,
  }));

  const profiles: Record<string, AgentProfile> = Object.fromEntries(
    scenario.roles.map((role) => [
      role.id,
      {
        id: role.id,
        name: role.name,
        role: role.title,
        portrait: role.portrait ?? '',
        faction: role.faction,
        // 状态与记忆由推演引擎逐轮写入，初始留白
        status: { text: '', asOfRound: 0 },
        systemPrompt: { ...role.persona },
        relations: scenario.relations
          .filter((r) => r.from === role.id)
          .map((r) => ({ targetId: r.to, type: r.type, label: r.label })),
        memories: [],
      } satisfies AgentProfile,
    ]),
  );

  return { meta: scenario.meta, profiles, graphNodes, graphEdges, rounds: scenario.rounds };
}

/** 校验剧情文件的引用完整性，返回错误列表（空数组 = 通过）。 */
export function validateScenario(scenario: ScenarioFile): string[] {
  const errors: string[] = [];
  const ids = new Set(scenario.roles.map((r) => r.id));

  const checkId = (id: string, where: string) => {
    if (!ids.has(id)) errors.push(`${where} 引用了不存在的角色 id: ${id}`);
  };

  for (const rel of scenario.relations) {
    checkId(rel.from, `关系(${rel.label})`);
    checkId(rel.to, `关系(${rel.label})`);
  }
  for (const edge of scenario.edges) {
    checkId(edge.from, `连线(${edge.name})`);
    checkId(edge.to, `连线(${edge.name})`);
  }
  for (const round of scenario.rounds) {
    for (const beat of round.beats) {
      checkId(beat.actor, `R${round.round} ${round.scene}`);
      for (const id of beat.relatedAgentIds) {
        checkId(id, `R${round.round} ${round.scene}`);
      }
    }
  }

  const roundNums = scenario.rounds.map((r) => r.round);
  if (new Set(roundNums).size !== roundNums.length) {
    errors.push('round 编号存在重复');
  }
  return errors;
}

/** 把一轮剧情编译为各角色的记忆条目（键为角色 id）。 */
export function compileRoundMemories(
  scenario: ScenarioFile,
  round: number,
): Record<string, AgentMemory[]> {
  const out: Record<string, AgentMemory[]> = {};
  const r = scenario.rounds.find((q) => q.round === round);
  if (!r) return out;
  for (const beat of r.beats) {
    (out[beat.actor] ??= []).push({
      round: r.round,
      scene: r.scene,
      summary: beat.summary,
      stance: beat.stance,
      relatedAgentIds: beat.relatedAgentIds,
      decision: beat.decision,
    });
  }
  return out;
}
