import type { GraphSnapshot } from '../../../packages/events/src';

export type RelationshipNodeKind = 'Government' | 'Project';

export interface RelationshipViewNode {
  uuid: string;
  name: string;
  kind: RelationshipNodeKind;
  x: number;
  y: number;
  summary: string;
  icon: string;
}

export interface RelationshipViewEdge {
  uuid: string;
  source_node_uuid: string;
  target_node_uuid: string;
  name: string;
  fact_type: string;
  fact: string;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface RelationshipViewModel {
  revision: number;
  nodes: RelationshipViewNode[];
  edges: RelationshipViewEdge[];
}

export type RelationshipPositions = Record<string, { x: number; y: number }>;

const GOVERNMENT_POSITION = { x: 390, y: 440 };

/**
 * React effects run after paint. Resolve new nodes synchronously so an updated
 * bridge model cannot render an edge against the previous (empty) positions
 * state for one frame.
 */
export function layoutPositionsFor(model: RelationshipViewModel, previous: RelationshipPositions): RelationshipPositions {
  return Object.fromEntries(model.nodes.map((node) => [
    node.uuid,
    previous[node.uuid] ?? { x: node.x, y: node.y },
  ]));
}

function companyPosition(index: number, count: number) {
  const span = Math.max(count - 1, 1);
  return { x: 1040, y: 230 + (index * 420) / span };
}

/**
 * The bridge graph can contain implementation-specific event nodes. The white
 * relationship view deliberately has a smaller vocabulary: government and
 * companies are entities, while events remain annotations on their edges.
 */
export function toRelationshipViewModel(snapshot: GraphSnapshot): RelationshipViewModel {
  const governments = snapshot.nodes
    .filter((node) => node.kind === 'government')
    .sort((a, b) => a.id.localeCompare(b.id));
  const companies = snapshot.nodes
    .filter((node) => node.kind === 'company')
    .sort((a, b) => a.id.localeCompare(b.id));

  const nodes: RelationshipViewNode[] = [
    ...governments.map((node, index) => ({
      uuid: node.id,
      name: node.name,
      kind: 'Government' as const,
      x: GOVERNMENT_POSITION.x,
      y: GOVERNMENT_POSITION.y + index * 96,
      summary: '政府决策主体',
      icon: '▦',
    })),
    ...companies.map((node, index) => ({
      uuid: node.id,
      name: node.name,
      kind: 'Project' as const,
      ...companyPosition(index, companies.length),
      summary: node.industry ? `${node.industry}企业` : '产业企业',
      icon: '◇',
    })),
  ];
  const visibleIds = new Set(nodes.map((node) => node.uuid));

  return {
    revision: snapshot.revision,
    nodes,
    edges: snapshot.edges
      .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      .map((edge) => ({
        uuid: edge.id,
        source_node_uuid: edge.source,
        target_node_uuid: edge.target,
        name: edge.relation,
        fact_type: edge.relation,
        fact: edge.label ?? edge.relation,
        color: edge.color,
        lineStyle: edge.lineStyle,
      })),
  };
}
