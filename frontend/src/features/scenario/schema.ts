import type {
  AgentMemory,
  AgentRelation,
  GraphEdge,
  GraphNode,
  MemoryStance,
  NodeKind,
  RelationType,
} from '../relationship/types.ts';

/**
 * 剧情文件 Schema：整个系统的唯一创作入口。
 * 人设与剧情写在同一份文件里互相约束——改剧情即改角色。
 * 编译器见 frontend/src/features/scenario/compiler.ts。
 */

export type ScenarioRoleKind = 'government' | 'enterprise' | 'talent' | 'institution';

/** 角色人设：初始设定，逐字进入 Agent 系统提示词 */
export interface ScenarioRole {
  id: string;
  name: string;
  kind: ScenarioRoleKind;
  /** 职务/头衔，如 "南山县委书记" */
  title: string;
  /** 阵营标签，如 "激进改革派" */
  faction: string;
  /** 头像路径；缺省时 UI 走图标/空状态 */
  portrait?: string;
  persona: {
    identity: string;
    motivation: string;
    strategy: string[];
    boundaries: string[];
    speakingStyle: string;
  };
  /** 关系图坐标（世界坐标系 1600×950，确定性布局） */
  position: { x: number; y: number };
  /** 机构/项目类节点的一句话说明与属性表（人物角色可省略） */
  summary?: string;
  attributes?: Record<string, string>;
  icon?: string;
}

export interface ScenarioRelation {
  from: string;
  to: string;
  type: RelationType;
  label: string;
}

/** 剧情中某角色在某轮的一条事件 → 编译为该角色的一条记忆 */
export interface ScenarioBeat {
  actor: string;
  summary: string;
  stance: MemoryStance;
  relatedAgentIds: string[];
  decision?: string;
  /** 该轮结束后此角色的"当前状态" */
  statusAfter?: string;
}

export interface ScenarioRound {
  round: number;
  /** 场景名，如 "联席会 · 首次" */
  scene: string;
  beats: ScenarioBeat[];
}

/** 两个实体间的一条剧情连线（图上可见） */
export interface ScenarioEdge {
  from: string;
  to: string;
  name: string;
  fact: string;
}

export interface ScenarioFile {
  meta: {
    id: string;
    title: string;
    /** 一句话剧情背景 */
    premise: string;
  };
  roles: ScenarioRole[];
  relations: ScenarioRelation[];
  edges: ScenarioEdge[];
  rounds: ScenarioRound[];
}

/* ---------- 编译期类型再导出，方便 compiler 使用 ---------- */
export type {
  AgentMemory,
  AgentRelation,
  GraphEdge,
  GraphNode,
  NodeKind,
};

/** 剧情角色类型 → 关系图节点类型 */
export const ROLE_KIND_TO_NODE_KIND: Record<ScenarioRoleKind, NodeKind> = {
  government: 'Person',
  enterprise: 'Person',
  talent: 'Person',
  institution: 'Government',
};
