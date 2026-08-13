import { getEnterprise, supportToolLabels } from '../../game/scenario';
import type { SandboxEvent } from '../../../packages/events/src';
import type { RelationshipNodeKind } from './graphAdapter';

export type EnterpriseMemoryStance = 'support' | 'oppose' | 'cautious' | 'neutral';

export interface EnterpriseMemory {
  sequence: number;
  at: string;
  summary: string;
  stance: EnterpriseMemoryStance;
  relatedId: string;
}

export interface EnterpriseProfile {
  id: string;
  name: string;
  industry: string;
  role: string;
  requestedToolLabels: string[];
  systemPrompt: {
    identity: string;
    motivation: string;
    strategy: string[];
    boundaries: string[];
    speakingStyle: string;
  };
  memories: EnterpriseMemory[];
}

function eventMemory(event: SandboxEvent, enterpriseId: string): EnterpriseMemory {
  const label = typeof event.payload.label === 'string' ? event.payload.label : null;
  const tool = typeof event.payload.tool === 'string' ? supportToolLabels[event.payload.tool as keyof typeof supportToolLabels] : null;
  const defaults: Partial<Record<SandboxEvent['type'], string>> = {
    invest: '收到政府投资决策', subsidize: '收到产业扶持决定', approve: '相关行政审批推进', shock: '外部环境发生变化',
  };
  const copy = label ?? tool ?? defaults[event.type] ?? '关系网络记录了一项事件';
  const stance: EnterpriseMemoryStance = event.type === 'invest' || event.type === 'subsidize'
    ? 'support' : event.type === 'shock' ? 'cautious' : 'neutral';
  return { sequence: event.seq, at: event.at, summary: copy, stance, relatedId: event.actor === enterpriseId ? event.target : event.actor };
}

export function enterpriseProfileForNode(
  node: { uuid: string; kind: RelationshipNodeKind },
  events: SandboxEvent[],
): EnterpriseProfile | null {
  if (node.kind !== 'Project') return null;
  const enterprise = getEnterprise(node.uuid as Parameters<typeof getEnterprise>[0]);
  if (!enterprise) return null;
  return {
    id: enterprise.id,
    name: enterprise.alias,
    industry: enterprise.industry,
    role: `${enterprise.industry}项目 · ${enterprise.reveal}`,
    requestedToolLabels: enterprise.requestedTools.map((tool) => supportToolLabels[tool]),
    systemPrompt: {
      identity: `${enterprise.industry}企业。${enterprise.background} 产品方向：${enterprise.product}`,
      motivation: `${enterprise.investment}，建设周期${enterprise.cycle}；当前支持诉求为 ${enterprise.request} 点。`,
      strategy: [enterprise.product, enterprise.technology, enterprise.execution],
      boundaries: [`证据状态：${enterprise.evidenceStatus}。`, `核验缺口：${enterprise.dataGap}`, enterprise.negotiation.bottomLine],
      speakingStyle: `${enterprise.negotiation.representative}：${enterprise.negotiation.opening}`,
    },
    memories: events
      .filter((event) => event.actor === enterprise.id || event.target === enterprise.id)
      .sort((a, b) => b.seq - a.seq)
      .map((event) => eventMemory(event, enterprise.id)),
  };
}
