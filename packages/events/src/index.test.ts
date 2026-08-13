import { describe, expect, it } from 'vitest'
import {
  buildRoster,
  isSandboxEventInput,
  projectGraph,
  type GraphEdge,
  type SandboxEvent,
  type SandboxEventInput,
} from './index'

function ev(seq: number, partial: Partial<SandboxEventInput> = {}): SandboxEvent {
  return {
    seq,
    type: 'invest',
    actor: 'gov',
    target: 'enterprise-a',
    at: 'S1',
    visibility: 'public',
    reveal_at: null,
    payload: {},
    ...partial,
  }
}

const roster = buildRoster([
  { id: 'enterprise-a', name: '远景显示', industry: '新型显示' },
  { id: 'enterprise-b', name: '曙光能源', industry: '新能源' },
  { id: 'enterprise-c', name: '精微装备', industry: '集成电路装备' },
  { id: 'enterprise-d', name: '同辉显示', industry: '新型显示' },
])

const rosterNoCompetition = buildRoster([
  { id: 'enterprise-a', name: '远景显示', industry: '新型显示' },
  { id: 'enterprise-b', name: '曙光能源', industry: '新能源' },
  { id: 'enterprise-c', name: '精微装备', industry: '集成电路装备' },
])

describe('projectGraph 基础', () => {
  it('空日志只返回 roster 节点与结构性竞争边，revision 为 0', () => {
    const snapshot = projectGraph([], roster)
    expect(snapshot.revision).toBe(0)
    expect(snapshot.nodes.map((node) => node.id)).toEqual([
      'gov',
      'enterprise-a',
      'enterprise-b',
      'enterprise-c',
      'enterprise-d',
    ])
    expect(snapshot.edges.map((edge) => edge.id)).toEqual(['comp-enterprise-a-enterprise-d'])
  })

  it('政府节点是唯一的 government 类型', () => {
    const snapshot = projectGraph([], roster)
    const gov = snapshot.nodes.find((node) => node.id === 'gov')
    expect(gov?.kind).toBe('government')
  })
})

describe('边投影规则', () => {
  it('invest 生成金色投资边，带金额标签与流向', () => {
    const snapshot = projectGraph([ev(1, { type: 'invest', actor: 'gov', target: 'enterprise-a', payload: { amount: 6000 } })], rosterNoCompetition)
    expect(snapshot.edges).toHaveLength(1)
    const edge = snapshot.edges[0]
    expect(edge).toMatchObject({
      id: 'e-1',
      source: 'gov',
      target: 'enterprise-a',
      relation: '投资',
      color: '#fbbf24',
      flow: true,
      label: '¥6000',
      createdSeq: 1,
    })
  })

  it('subsidize / approve / sign 生成对应关系边', () => {
    const events = [
      ev(1, { type: 'subsidize', actor: 'gov', target: 'enterprise-b' }),
      ev(2, { type: 'approve', actor: 'gov', target: 'enterprise-c' }),
      ev(3, { type: 'sign', actor: 'enterprise-a', target: 'enterprise-b' }),
    ]
    const snapshot = projectGraph(events, rosterNoCompetition)
    expect(snapshot.edges.map((edge) => edge.relation)).toEqual(['产业扶持', '行政审批', '公开合作'])
  })

  it('secret_deal 生成秘密利益输送边，默认未揭示', () => {
    const snapshot = projectGraph(
      [ev(1, { type: 'secret_deal', actor: 'enterprise-a', target: 'enterprise-b', visibility: 'secret', payload: { parties: ['enterprise-a', 'enterprise-b'] } })],
      rosterNoCompetition,
    )
    const edge = snapshot.edges[0]
    expect(edge).toMatchObject({
      relation: '利益输送',
      color: '#dc2626',
      secret: true,
      revealed: false,
      lineStyle: 'dashed',
    })
    expect(edge.parties).toEqual(['enterprise-a', 'enterprise-b'])
  })

  it('同行业企业自动生成同业竞争边，无需事件', () => {
    const snapshot = projectGraph([], roster)
    const competition = snapshot.edges.find((edge) => edge.relation === '同业竞争')
    expect(competition).toBeDefined()
    expect(competition?.source).toBe('enterprise-a')
    expect(competition?.target).toBe('enterprise-d')
    expect(competition?.lineStyle).toBe('dashed')
  })

  it('shock 生成事件节点并连向受影响企业', () => {
    const snapshot = projectGraph(
      [ev(5, { type: 'shock', actor: 'gov', target: 'gov', payload: { name: '市场寒流冲击', affects: ['enterprise-a', 'enterprise-c'] } })],
      roster,
    )
    const eventNode = snapshot.nodes.find((node) => node.id === 'ev-5')
    expect(eventNode).toMatchObject({ kind: 'event', name: '市场寒流冲击', createdSeq: 5 })
    const links = snapshot.edges.filter((edge) => edge.source === 'ev-5')
    expect(links).toHaveLength(2)
    expect(links.map((edge) => edge.target).sort()).toEqual(['enterprise-a', 'enterprise-c'])
  })
})

describe('揭示与撤销', () => {
  it('investigate 按 edge_id 揭示秘密边', () => {
    const events = [
      ev(1, { type: 'secret_deal', actor: 'enterprise-a', target: 'enterprise-b', visibility: 'secret', payload: {} }),
      ev(2, { type: 'investigate', actor: 'gov', target: 'gov', payload: { edge_id: 'e-1' } }),
    ]
    const snapshot = projectGraph(events, roster)
    const edge = snapshot.edges.find((item) => item.id === 'e-1')
    expect(edge?.secret).toBe(true)
    expect(edge?.revealed).toBe(true)
  })

  it('investigate 不影响其他秘密边', () => {
    const events = [
      ev(1, { type: 'secret_deal', actor: 'enterprise-a', target: 'enterprise-b', visibility: 'secret', payload: {} }),
      ev(2, { type: 'secret_deal', actor: 'enterprise-c', target: 'gov', visibility: 'secret', payload: {} }),
      ev(3, { type: 'investigate', actor: 'gov', target: 'gov', payload: { edge_id: 'e-1' } }),
    ]
    const snapshot = projectGraph(events, roster)
    expect(snapshot.edges.find((item) => item.id === 'e-1')?.revealed).toBe(true)
    expect(snapshot.edges.find((item) => item.id === 'e-2')?.revealed).toBe(false)
  })

  it('revoke 按 edge_id 移除边', () => {
    const events = [
      ev(1, { type: 'invest', actor: 'gov', target: 'enterprise-a', payload: { amount: 6000 } }),
      ev(2, { type: 'revoke', actor: 'gov', target: 'enterprise-a', payload: { edge_id: 'e-1' } }),
    ]
    const snapshot = projectGraph(events, roster)
    expect(snapshot.edges.filter((edge) => edge.id === 'e-1')).toHaveLength(0)
  })

  it('revoke 不带 edge_id 时移除双方之间全部边', () => {
    const events = [
      ev(1, { type: 'invest', actor: 'gov', target: 'enterprise-a', payload: {} }),
      ev(2, { type: 'subsidize', actor: 'gov', target: 'enterprise-a', payload: {} }),
      ev(3, { type: 'revoke', actor: 'gov', target: 'enterprise-a', payload: {} }),
    ]
    const snapshot = projectGraph(events, rosterNoCompetition)
    expect(snapshot.edges.filter((edge) => edge.source === 'gov' && edge.target === 'enterprise-a')).toHaveLength(0)
    expect(snapshot.edges).toHaveLength(0)
  })

  it('时间轴：投影只包含 seq <= N 的事件', () => {
    const events = [
      ev(1, { type: 'invest', actor: 'gov', target: 'enterprise-a', payload: {} }),
      ev(2, { type: 'sign', actor: 'enterprise-a', target: 'enterprise-b', payload: {} }),
      ev(3, { type: 'subsidize', actor: 'gov', target: 'enterprise-c', payload: {} }),
    ]
    const atStep2 = projectGraph(events.slice(0, 2), rosterNoCompetition)
    expect(atStep2.revision).toBe(2)
    expect(atStep2.edges.map((edge) => edge.id)).toEqual(['e-1', 'e-2'])
  })

  it('输入乱序时按 seq 排序投影', () => {
    const events = [
      ev(3, { type: 'subsidize', actor: 'gov', target: 'enterprise-c', payload: {} }),
      ev(1, { type: 'invest', actor: 'gov', target: 'enterprise-a', payload: {} }),
      ev(2, { type: 'sign', actor: 'enterprise-a', target: 'enterprise-b', payload: {} }),
    ]
    const snapshot = projectGraph(events, rosterNoCompetition)
    expect(snapshot.edges.map((edge) => edge.id)).toEqual(['e-1', 'e-2', 'e-3'])
  })
})

describe('isSandboxEventInput 校验', () => {
  const valid: SandboxEventInput = {
    type: 'invest',
    actor: 'gov',
    target: 'enterprise-a',
    at: 'S1',
    visibility: 'public',
    reveal_at: null,
    payload: { amount: 6000 },
  }

  it('接受合法输入', () => {
    expect(isSandboxEventInput(valid)).toBe(true)
  })

  it('拒绝未知类型', () => {
    expect(isSandboxEventInput({ ...valid, type: 'bribe' })).toBe(false)
  })

  it('拒绝空 actor/target', () => {
    expect(isSandboxEventInput({ ...valid, actor: '' })).toBe(false)
    expect(isSandboxEventInput({ ...valid, target: '' })).toBe(false)
  })

  it('拒绝非法 visibility', () => {
    expect(isSandboxEventInput({ ...valid, visibility: 'fuzzy' })).toBe(false)
  })

  it('拒绝负 reveal_at 与非整数', () => {
    expect(isSandboxEventInput({ ...valid, reveal_at: -1 })).toBe(false)
    expect(isSandboxEventInput({ ...valid, reveal_at: 2.5 })).toBe(false)
  })

  it('拒绝 secret_deal 的非法 parties', () => {
    const deal = { ...valid, type: 'secret_deal' as const, payload: { parties: 'a' } }
    expect(isSandboxEventInput(deal)).toBe(false)
    expect(isSandboxEventInput({ ...deal, payload: { parties: ['enterprise-a'] } })).toBe(true)
  })

  it('拒绝空 payload', () => {
    expect(isSandboxEventInput({ ...valid, payload: null })).toBe(false)
  })
})
