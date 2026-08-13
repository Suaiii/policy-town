import { describe, expect, it } from 'vitest';
import type { SandboxEvent } from '../../../packages/events/src';
import { enterpriseProfileForNode } from './enterpriseProfileAdapter';

const events: SandboxEvent[] = [
  { seq: 2, type: 'subsidize', actor: 'gov', target: 'enterprise-a', at: '2008 · Q3', visibility: 'public', reveal_at: null, payload: { tool: 'investment' } },
  { seq: 8, type: 'shock', actor: 'gov', target: 'enterprise-a', at: '2009 · Q2', visibility: 'public', reveal_at: null, payload: { label: '政策窗口开启' } },
  { seq: 5, type: 'approve', actor: 'enterprise-a', target: 'gov', at: '2008 · Q4', visibility: 'public', reveal_at: null, payload: { label: '审批资料已提交' } },
  { seq: 9, type: 'invest', actor: 'gov', target: 'enterprise-b', at: '2009 · Q2', visibility: 'public', reveal_at: null, payload: {} },
];

describe('enterpriseProfileForNode', () => {
  it('builds an enterprise system prompt and descending event memories', () => {
    const profile = enterpriseProfileForNode({ uuid: 'enterprise-a', kind: 'Project' }, events);

    expect(profile).toMatchObject({
      id: 'enterprise-a',
      name: '远景显示',
      systemPrompt: {
        identity: expect.stringContaining('新型显示'),
        motivation: expect.stringContaining('175'),
        strategy: expect.arrayContaining([expect.stringContaining('TFT-LCD')]),
        boundaries: expect.arrayContaining([expect.stringContaining('部分验证')]),
        speakingStyle: expect.stringContaining('华东区域项目负责人'),
      },
    });
    expect(profile!.requestedToolLabels).toEqual(['股权投资', '基础设施配套', '融资协调']);
    expect(profile!.memories.map((memory) => memory.sequence)).toEqual([8, 5, 2]);
    expect(profile!.memories.map((memory) => memory.stance)).toEqual(['cautious', 'neutral', 'support']);
  });

  it('does not create a drawer profile for a government node', () => {
    expect(enterpriseProfileForNode({ uuid: 'gov', kind: 'Government' }, events)).toBeNull();
  });
});
