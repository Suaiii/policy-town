import type { AgentMemory } from './types.ts';
import {
  agentProfileFixtures,
  filterMemoriesByAgent,
  getAgentProfile,
  sortMemoriesByRoundDesc,
} from './agentProfiles.fixture.ts';
import { graphEdges, graphNodes, nodeById } from './graph.fixture.ts';

const AGENT_IDS = ['yan-guoqiang', 'chen-shirong', 'song-pingan'];

const sampleMemories: AgentMemory[] = [
  {
    round: 1,
    scene: '首次联席会',
    summary: '首轮交锋。',
    stance: 'neutral',
    relatedAgentIds: ['yan-guoqiang'],
  },
  {
    round: 3,
    scene: '收到审计意见',
    summary: '审计介入。',
    stance: 'oppose',
    relatedAgentIds: ['song-pingan'],
  },
  {
    round: 2,
    scene: '部门补件',
    summary: '程序延迟。',
    stance: 'cautious',
    relatedAgentIds: ['yan-guoqiang', 'song-pingan'],
  },
];

describe('agent profile fixtures（剧情编译产物）', () => {
  test('三位政府 Agent 档案齐备，头像路径符合约定', async () => {
    for (const id of AGENT_IDS) {
      const profile = await getAgentProfile(id);
      expect(profile).not.toBeNull();
      expect(profile!.portrait).toBe(`/assets/agents/government/${id}.png`);
      expect(profile!.systemPrompt.strategy.length).toBeGreaterThan(0);
      expect(profile!.systemPrompt.motivation.length).toBeGreaterThan(0);
    }
  });

  test('推演未开始时状态/记忆留白', () => {
    for (const profile of Object.values(agentProfileFixtures)) {
      expect(profile.status.text).toBe('');
      expect(profile.memories).toEqual([]);
    }
  });

  test('未知 id 返回 null（走优雅空状态）', async () => {
    expect(await getAgentProfile('nobody')).toBeNull();
  });

  test('档案引用的关系目标都存在于关系图中', () => {
    for (const profile of Object.values(agentProfileFixtures)) {
      for (const relation of profile.relations) {
        expect(nodeById.has(relation.targetId)).toBe(true);
      }
    }
  });

  test('记忆按轮次倒序', () => {
    const rounds = sortMemoriesByRoundDesc(sampleMemories).map((m) => m.round);
    expect(rounds).toEqual([3, 2, 1]);
  });

  test('按人物过滤记忆', () => {
    const filtered = filterMemoriesByAgent(sampleMemories, 'yan-guoqiang');
    expect(filtered.map((m) => m.round)).toEqual([1, 2]);
    expect(
      filtered.every((m) => m.relatedAgentIds.includes('yan-guoqiang')),
    ).toBe(true);
  });
});

describe('relationship graph fixture（剧情编译产物）', () => {
  test('三位 Agent 均为图中人物节点且带 agentId', () => {
    for (const id of AGENT_IDS) {
      const node = nodeById.get(id);
      expect(node?.labels[1]).toBe('Person');
      expect(node?.agentId).toBe(id);
    }
  });

  test('所有连线端点存在且节点坐标在视图范围内', () => {
    for (const edge of graphEdges) {
      expect(nodeById.has(edge.source_node_uuid)).toBe(true);
      expect(nodeById.has(edge.target_node_uuid)).toBe(true);
    }
    for (const node of graphNodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1600);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(950);
    }
  });
});
