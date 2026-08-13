import { describe, expect, it } from 'vitest';
import type { GraphSnapshot } from '../../../packages/events/src';
import { projectGraph } from '../../../packages/events/src';
import { layoutPositionsFor, toRelationshipViewModel } from './graphAdapter';

const snapshot: GraphSnapshot = {
  schemaVersion: '0.1',
  revision: 2,
  nodes: [
    { id: 'gov', kind: 'government', name: '合肥市政府', color: '#5b6cff' },
    { id: 'enterprise-a', kind: 'company', name: '远景显示', industry: '新型显示', color: '#22d3ee' },
    { id: 'shock-1', kind: 'event', name: '信贷收紧', color: '#f59e0b' },
  ],
  edges: [
    {
      id: 'impact-1', source: 'gov', target: 'enterprise-a', relation: '影响',
      label: '信贷与需求转弱', color: '#f59e0b', createdSeq: 2,
    },
    {
      id: 'orphan', source: 'shock-1', target: 'enterprise-a', relation: '影响',
      color: '#f59e0b', createdSeq: 2,
    },
  ],
};

describe('toRelationshipViewModel', () => {
  it('keeps only government and companies and exposes environment labels on edges', () => {
    const model = toRelationshipViewModel(snapshot);

    expect(model.nodes.map((node) => node.kind)).toEqual(['Government', 'Project']);
    expect(model.edges).toEqual([
      expect.objectContaining({
        source_node_uuid: 'gov', target_node_uuid: 'enterprise-a',
        fact_type: '影响', fact: '信贷与需求转弱',
      }),
    ]);
  });

  it('assigns stable positions independently of bridge node order', () => {
    const normal = toRelationshipViewModel(snapshot);
    const reordered = toRelationshipViewModel({ ...snapshot, nodes: [...snapshot.nodes].reverse() });

    expect(reordered.nodes).toEqual(expect.arrayContaining(normal.nodes));
    expect(normal.nodes.find((node) => node.uuid === 'gov')).toMatchObject({ x: 390, y: 440 });
  });

  it('provides positions for every bridge government-company edge during the first model render', () => {
    const bridgeGraph = projectGraph([{
      seq: 1, type: 'invest', actor: 'gov', target: 'enterprise-a', at: '2024-01-01',
      visibility: 'public', reveal_at: null, payload: { amount: 42 },
    }]);
    const model = toRelationshipViewModel(bridgeGraph);
    const positions = layoutPositionsFor(model, {});
    const edge = model.edges.find((item) => item.source_node_uuid === 'gov' && item.target_node_uuid === 'enterprise-a');

    expect(edge).toBeDefined();
    expect(positions[edge!.source_node_uuid]).toBeDefined();
    expect(positions[edge!.target_node_uuid]).toBeDefined();
  });
});
