/**
 * 政务推演沙盒 · Agent 档案与关系图数据契约。
 * 图数据字段沿用 MiroFish 图谱 payload（uuid / labels / source_node_uuid / target_node_uuid），
 * 便于未来替换为真实 graph API；AgentProfile 预留为真实 agent memory API 的返回形状。
 */

export type RelationType = 'support' | 'check' | 'depend' | 'avoid';

export type MemoryStance = 'support' | 'oppose' | 'cautious' | 'neutral';

export interface AgentMemory {
  round: number;
  scene: string;
  summary: string;
  stance: MemoryStance;
  /** 引用 graph.fixture 中的节点 uuid（人物或机构） */
  relatedAgentIds: string[];
  decision?: string;
}

export interface AgentRelation {
  /** 引用 graph.fixture 中的节点 uuid */
  targetId: string;
  type: RelationType;
  /** 例如 “产业项目上存在分歧” */
  label: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  portrait: string;
  faction: string;
  status: {
    text: string;
    asOfRound: number;
  };
  systemPrompt: {
    identity: string;
    motivation: string;
    strategy: string[];
    boundaries: string[];
    speakingStyle: string;
  };
  relations: AgentRelation[];
  memories: AgentMemory[];
}

export type NodeKind = 'Person' | 'Government' | 'Project';

export interface GraphNode {
  uuid: string;
  name: string;
  labels: ['Entity', NodeKind];
  x: number;
  y: number;
  summary: string;
  attributes: Record<string, string>;
  /** 机构 / 项目节点的线性图标；人物节点改用竖版像素头像 */
  icon?: string;
  /** 指向 AgentProfile 的 id；无档案的实体节点不填 */
  agentId?: string;
}

export interface GraphEdge {
  uuid: string;
  source_node_uuid: string;
  target_node_uuid: string;
  name: string;
  fact_type: string;
  fact: string;
}
