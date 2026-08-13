import { useCallback, useEffect, useState } from 'react';
import { fetchEvents, fetchGraph } from '../integration/agentApi';
import type { SandboxEvent } from '../../packages/events/src';
import { RelationshipNetworkView } from './relationship-network/RelationshipNetworkView';
import { toRelationshipViewModel, type RelationshipViewModel } from './relationship-network/graphAdapter';

export function RelationNetwork({ active, onBackToSandbox }: { active: boolean; onBackToSandbox: () => void }) {
  const [model, setModel] = useState<RelationshipViewModel | null>(null);
  const [stale, setStale] = useState(false);
  const [events, setEvents] = useState<SandboxEvent[]>([]);

  const refresh = useCallback(async () => {
    const [response, nextEvents] = await Promise.all([fetchGraph(), fetchEvents()]);
    if (!response?.graph) { setStale(true); return; }
    setModel(toRelationshipViewModel(response.graph));
    if (nextEvents) setEvents(nextEvents);
    setStale(false);
  }, []);

  useEffect(() => { if (active) void refresh(); }, [active, refresh]);
  useEffect(() => {
    const onUpdate = () => { if (active) void refresh(); };
    window.addEventListener('relationship-network:updated', onUpdate);
    return () => window.removeEventListener('relationship-network:updated', onUpdate);
  }, [active, refresh]);

  const visibleModel = model ?? { revision: 0, nodes: [], edges: [] };
  return <RelationshipNetworkView model={visibleModel} events={events} stale={stale || model === null} onBackToSandbox={onBackToSandbox} onRefresh={() => void refresh()} />;
}
