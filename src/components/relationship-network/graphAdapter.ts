import type { GraphSnapshot } from '../../../packages/events/src';
import { getEnterprise } from '../../game/scenario';

export type RelationshipNodeKind = 'Government' | 'Project';

export interface RelationshipViewNode {
  uuid: string;
  name: string;
  kind: RelationshipNodeKind;
  x: number;
  y: number;
  summary: string;
  icon: string;
  /** 前端沙盘里的企业代号（A/B/C），用于与沙盘面板一一对应 */
  code?: string;
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
    ...companies.map((node, index) => {
      const enterprise = getEnterprise(node.id as Parameters<typeof getEnterprise>[0]);
      return {
        uuid: node.id,
        name: node.name,
        kind: 'Project' as const,
        code: enterprise?.code,
        ...companyPosition(index, companies.length),
        summary: node.industry ? `${node.industry}企业` : '产业企业',
        icon: '◇',
      };
    }),
  ];
  const visibleIds = new Set(nodes.map((node) => node.uuid));
  const projectedEdges = snapshot.edges
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
    }));

  // Keep the relationship canvas legible before the first decision is recorded.
  // These are visual policy links, not persisted events; real event edges always
  // take precedence for the same government/company pair.
  const projectedPairs = new Set(projectedEdges.map((edge) => `${edge.source_node_uuid}->${edge.target_node_uuid}`));
  const baselineEdges = governments.flatMap((government) => companies
    .filter((company) => !projectedPairs.has(`${government.id}->${company.id}`))
    .map((company) => ({
      uuid: `baseline-${government.id}-${company.id}`,
      source_node_uuid: government.id,
      target_node_uuid: company.id,
      name: '政策关联',
      fact_type: '政策关联',
      fact: company.industry ? `政策关联 · ${company.industry}` : '政策关联 · 产业协同',
      color: '#b6c5d6',
      lineStyle: 'dotted' as const,
    })));

  return {
    revision: snapshot.revision,
    nodes,
    edges: [...projectedEdges, ...baselineEdges],
  };
}
