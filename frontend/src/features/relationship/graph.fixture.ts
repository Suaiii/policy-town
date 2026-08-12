import type { GraphEdge, GraphNode, NodeKind } from './types.ts';
import { compiled } from '../scenario/activeScenario.ts';

/**
 * 关系图数据：由当前剧情编译而来（features/scenario）。
 * 字段沿用 MiroFish 图谱 payload；坐标为剧情文件中的确定性布局。
 */

export const KIND_LABEL: Record<NodeKind, string> = {
  Person: '人物',
  Government: '机构',
  Project: '项目',
};

export const KIND_COLOR: Record<NodeKind, string> = {
  Person: '#ff7869',
  Government: '#4a7dc7',
  Project: '#40aaa4',
};

export const graphNodes: GraphNode[] = compiled.graphNodes;

export const graphEdges: GraphEdge[] = compiled.graphEdges;

export const nodeById: ReadonlyMap<string, GraphNode> = new Map(
  graphNodes.map((n) => [n.uuid, n]),
);

/** 世界坐标系尺寸（与 SVG viewBox 对应）。 */
export const WORLD = { width: 1600, height: 950 } as const;
