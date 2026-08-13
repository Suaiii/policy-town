export const EVENTS_CONTRACT_VERSION = '0.1' as const

export type EventType =
  | 'invest'
  | 'subsidize'
  | 'approve'
  | 'sign'
  | 'secret_deal'
  | 'investigate'
  | 'revoke'
  | 'shock'

export type EventVisibility = 'public' | 'secret'

export interface SandboxEvent {
  seq: number
  type: EventType
  actor: string
  target: string
  at: string
  visibility: EventVisibility
  reveal_at: number | null
  payload: Record<string, unknown>
}

export type SandboxEventInput = Omit<SandboxEvent, 'seq'>

export type NodeKind = 'government' | 'company' | 'event'

export interface RosterNode {
  id: string
  kind: NodeKind
  name: string
  industry?: string
  position?: { x: number; y: number }
}

export type EdgeRelation =
  | '投资'
  | '产业扶持'
  | '行政审批'
  | '公开合作'
  | '利益输送'
  | '同业竞争'
  | '影响'

export interface GraphEdge {
  id: string
  source: string
  target: string
  relation: EdgeRelation
  color: string
  label?: string
  flow?: boolean
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  secret?: boolean
  revealed?: boolean
  parties?: string[]
  createdSeq: number
}

export interface GraphNode extends RosterNode {
  color: string
  createdSeq?: number
}

export interface GraphSnapshot {
  schemaVersion: typeof EVENTS_CONTRACT_VERSION
  revision: number
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const EVENT_TYPES: readonly EventType[] = [
  'invest',
  'subsidize',
  'approve',
  'sign',
  'secret_deal',
  'investigate',
  'revoke',
  'shock',
]

export const NODE_COLORS: Record<NodeKind, string> = {
  government: '#5b6cff',
  company: '#22d3ee',
  event: '#f59e0b',
}

export const RELATION_STYLE: Record<EdgeRelation, { color: string; flow?: boolean; lineStyle?: 'solid' | 'dashed' | 'dotted' }> = {
  投资: { color: '#fbbf24', flow: true },
  产业扶持: { color: '#34d399' },
  行政审批: { color: '#60a5fa' },
  公开合作: { color: '#7dd3fc', lineStyle: 'dotted' },
  利益输送: { color: '#dc2626', lineStyle: 'dashed' },
  同业竞争: { color: '#f87171', lineStyle: 'dashed' },
  影响: { color: '#f59e0b' },
}

export function buildRoster(companies: Array<Omit<RosterNode, 'kind'> & { id: string; name: string }>): RosterNode[] {
  return [
    { id: 'gov', kind: 'government', name: '合肥市政府' },
    ...companies.map((company) => ({ ...company, kind: 'company' as const })),
  ]
}

export const defaultRoster: RosterNode[] = buildRoster([
  { id: 'enterprise-a', name: '远景显示', industry: '新型显示', position: { x: 0.33, y: 0.28 } },
  { id: 'enterprise-b', name: '曙光能源', industry: '新能源', position: { x: 0.3, y: 0.68 } },
  { id: 'enterprise-c', name: '精微装备', industry: '集成电路装备', position: { x: 0.66, y: 0.52 } },
])

const EVENT_NODE_EDGE_RELATION = '影响'

function relationFor(type: EventType): EdgeRelation {
  switch (type) {
    case 'invest': return '投资'
    case 'subsidize': return '产业扶持'
    case 'approve': return '行政审批'
    case 'sign': return '公开合作'
    case 'secret_deal': return '利益输送'
    default: return '影响'
  }
}

function labelFor(ev: SandboxEvent, relation: EdgeRelation): string | undefined {
  const payload = ev.payload
  if (typeof payload.label === 'string' && payload.label.length > 0) return payload.label
  if (relation === '投资' && typeof payload.amount === 'number') return `¥${payload.amount}`
  return undefined
}

function makeEdge(ev: SandboxEvent): GraphEdge {
  const relation = relationFor(ev.type)
  const style = RELATION_STYLE[relation]
  const edge: GraphEdge = {
    id: `e-${ev.seq}`,
    source: ev.actor,
    target: ev.target,
    relation,
    color: style.color,
    flow: style.flow,
    lineStyle: style.lineStyle,
    createdSeq: ev.seq,
  }
  const label = labelFor(ev, relation)
  if (label) edge.label = label
  if (ev.type === 'secret_deal') {
    edge.secret = true
    edge.revealed = false
    if (Array.isArray(ev.payload.parties)) edge.parties = ev.payload.parties as string[]
  }
  return edge
}

function applyEvent(ev: SandboxEvent, nodes: Map<string, GraphNode>, edges: Map<string, GraphEdge>): void {
  if (ev.type === 'revoke') {
    const edgeId = typeof ev.payload.edge_id === 'string' ? ev.payload.edge_id : null
    if (edgeId) {
      edges.delete(edgeId)
    } else {
      for (const [id, edge] of edges) {
        if (edge.source === ev.actor && edge.target === ev.target) edges.delete(id)
      }
    }
    return
  }

  if (ev.type === 'investigate') {
    const edgeId = typeof ev.payload.edge_id === 'string' ? ev.payload.edge_id : null
    if (edgeId) {
      const edge = edges.get(edgeId)
      if (edge && edge.secret) edge.revealed = true
    }
    return
  }

  if (ev.type === 'shock') {
    const nodeId = `ev-${ev.seq}`
    nodes.set(nodeId, {
      id: nodeId,
      kind: 'event',
      name: typeof ev.payload.name === 'string' ? ev.payload.name : `事件 ${ev.seq}`,
      color: NODE_COLORS.event,
      createdSeq: ev.seq,
    })
    const affected = Array.isArray(ev.payload.affects) ? (ev.payload.affects as string[]) : []
    const style = RELATION_STYLE[EVENT_NODE_EDGE_RELATION]
    affected.forEach((targetId, index) => {
      if (!nodes.has(targetId)) return
      edges.set(`evlink-${ev.seq}-${index}`, {
        id: `evlink-${ev.seq}-${index}`,
        source: nodeId,
        target: targetId,
        relation: EVENT_NODE_EDGE_RELATION,
        color: style.color,
        flow: false,
        lineStyle: style.lineStyle,
        createdSeq: ev.seq,
      })
    })
    return
  }

  const edge = makeEdge(ev)
  edges.set(edge.id, edge)
}

function buildCompetitionEdges(roster: RosterNode[]): GraphEdge[] {
  const companies = roster.filter((node) => node.kind === 'company')
  const style = RELATION_STYLE['同业竞争']
  const result: GraphEdge[] = []
  for (let i = 0; i < companies.length; i += 1) {
    for (let j = i + 1; j < companies.length; j += 1) {
      const a = companies[i]
      const b = companies[j]
      if (!a.industry || a.industry !== b.industry) continue
      const id = `comp-${a.id}-${b.id}`
      if (result.some((edge) => edge.id === id)) continue
      result.push({
        id,
        source: a.id,
        target: b.id,
        relation: '同业竞争',
        color: style.color,
        flow: false,
        lineStyle: style.lineStyle,
        createdSeq: 0,
      })
    }
  }
  return result
}

export function projectGraph(events: SandboxEvent[], roster: RosterNode[] = defaultRoster): GraphSnapshot {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const nodes = new Map<string, GraphNode>()
  roster.forEach((node) => {
    nodes.set(node.id, { ...node, color: NODE_COLORS[node.kind] })
  })
  const edges = new Map<string, GraphEdge>()
  buildCompetitionEdges(roster).forEach((edge) => edges.set(edge.id, edge))
  sorted.forEach((ev) => applyEvent(ev, nodes, edges))
  return {
    schemaVersion: EVENTS_CONTRACT_VERSION,
    revision: sorted.length > 0 ? sorted[sorted.length - 1].seq : 0,
    nodes: [...nodes.values()],
    edges: [...edges.values()].sort((a, b) => a.createdSeq - b.createdSeq),
  }
}

const EVENT_TYPE_SET = new Set<EventType>(EVENT_TYPES)
const VISIBILITY_SET = new Set<EventVisibility>(['public', 'secret'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isSandboxEventInput(value: unknown): value is SandboxEventInput {
  if (!isRecord(value)) return false
  if (typeof value.type !== 'string' || !EVENT_TYPE_SET.has(value.type as EventType)) return false
  if (typeof value.actor !== 'string' || value.actor.length === 0) return false
  if (typeof value.target !== 'string' || value.target.length === 0) return false
  if (typeof value.at !== 'string') return false
  if (typeof value.visibility !== 'string' || !VISIBILITY_SET.has(value.visibility as EventVisibility)) return false
  if (value.reveal_at !== null && value.reveal_at !== undefined && !Number.isInteger(value.reveal_at)) return false
  if (value.reveal_at !== undefined && value.reveal_at !== null && (value.reveal_at as number) < 0) return false
  if (!isRecord(value.payload)) return false
  if (value.type === 'secret_deal' && value.payload.parties !== undefined) {
    if (!Array.isArray(value.payload.parties)) return false
    if (!(value.payload.parties as unknown[]).every((party) => typeof party === 'string')) return false
  }
  return true
}

export function toInput(event: SandboxEvent): SandboxEventInput {
  return {
    type: event.type,
    actor: event.actor,
    target: event.target,
    at: event.at,
    visibility: event.visibility,
    reveal_at: event.reveal_at ?? null,
    payload: event.payload,
  }
}
