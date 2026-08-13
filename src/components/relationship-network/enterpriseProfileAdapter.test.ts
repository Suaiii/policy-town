import { describe, expect, it } from 'vitest';
import type { SandboxEvent } from '../../../packages/events/src';
import { enterpriseProfileForNode } from './enterpriseProfileAdapter';
import { terminalRelationshipModel } from './terminalScenario';

const events: SandboxEvent[] = [
  { seq: 2, type: 'subsidize', actor: 'gov', target: 'enterprise-a', at: '2008 · Q3', visibility: 'public', reveal_at: null, payload: { tool: 'investment' } },
  { seq: 8, type: 'shock', actor: 'gov', target: 'enterprise-a', at: '2009 · Q2', visibility: 'public', reveal_at: null, payload: { label: '政策窗口开启' } },
  { seq: 5, type: 'approve', actor: 'enterprise-a', target: 'gov', at: '2008 · Q4', visibility: 'public', reveal_at: null, payload: { label: '审批资料已提交' } },
  { seq: 9, type: 'invest', actor: 'gov', target: 'enterprise-b', at: '2009 · Q2', visibility: 'public', reveal_at: null, payload: {} },
];

describe('enterpriseProfileForNode', () => {
  it('builds the terminal enterprise prompt and staged memories', () => {
    const profile = enterpriseProfileForNode({ uuid: 'enterprise-a', kind: 'Project' }, events);

    expect(profile).toMatchObject({
      id: 'enterprise-a',
      name: 'A · 远景显示',
      systemPrompt: {
        identity: expect.stringContaining('新型显示'),
        motivation: expect.stringContaining('投产'),
        strategy: expect.arrayContaining([expect.stringContaining('采购')]),
        boundaries: expect.arrayContaining([expect.stringContaining('审计')]),
        speakingStyle: expect.stringContaining('履约'),
      },
    });
    expect(profile!.outcome).toBe('成功');
    expect(profile!.memories.map((memory) => memory.sequence)).toEqual([1, 2, 3, 4]);
    expect(profile!.memories.map((memory) => memory.stance)).toEqual(['support', 'support', 'cautious', 'support']);
  });

  it('provides the terminal government Agent with prompt and four staged memories', () => {
    const profile = enterpriseProfileForNode({ uuid: 'gov-finance', kind: 'Government' }, events);
    expect(profile).toMatchObject({
      name: '财政部门',
      agentKind: 'government',
      outcome: '统筹',
      systemPrompt: { identity: expect.stringContaining('财政') },
    });
    expect(profile!.memories).toHaveLength(4);
    expect(profile!.memories.map((memory) => memory.at)).toEqual(['S1 · 起步核验', 'S2 · 组合配置', 'S3 · 压力传导', 'S4 · 终局结算']);
  });

  it('ships a complete terminal graph with five government Agents and six companies', () => {
    expect(terminalRelationshipModel.nodes.filter((node) => node.kind === 'Government')).toHaveLength(5);
    expect(terminalRelationshipModel.nodes.filter((node) => node.kind === 'Project')).toHaveLength(6);
    expect(terminalRelationshipModel.edges.length).toBeGreaterThanOrEqual(30);
  });

  it('gives every terminal Agent a compact preview and an expandable mock deliberation record for S1–S4', () => {
    for (const node of terminalRelationshipModel.nodes) {
      const profile = enterpriseProfileForNode({ uuid: node.uuid, kind: node.kind }, events);
      expect(profile!.memories).toHaveLength(4);
      expect(profile!.memories.every((memory) => (
        Boolean(memory.preview)
        && Boolean(memory.detail)
        && Boolean(memory.measures)
        && Boolean(memory.interaction)
        && Boolean(memory.result)
      ))).toBe(true);
    }
  });
});
