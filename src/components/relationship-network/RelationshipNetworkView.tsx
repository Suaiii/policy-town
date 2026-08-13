import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutPositionsFor, type RelationshipViewEdge, type RelationshipViewModel, type RelationshipViewNode } from './graphAdapter';
import type { SandboxEvent } from '../../../packages/events/src';
import { enterpriseProfileForNode } from './enterpriseProfileAdapter';
import { EnterpriseProfileDrawer } from './EnterpriseProfileDrawer';
import { playCardOpenSound } from '../../features/relationship/sfx';
import './relationship-network.css';

type View = { tx: number; ty: number; scale: number };
type Positions = Record<string, { x: number; y: number }>;

const WORLD = { width: 1500, height: 900 };
const INITIAL_VIEW: View = { tx: 30, ty: 10, scale: 0.82 };
const KINDS = ['Government', 'Project'] as const;
const KIND_LABEL = { Government: '政府机构', Project: '产业企业' } as const;
const KIND_COLOR = { Government: '#4a7dc7', Project: '#40aaa4' } as const;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function edgePath(edge: RelationshipViewEdge, positions: Positions) {
  const source = positions[edge.source_node_uuid];
  const target = positions[edge.target_node_uuid];
  return `M ${source.x} ${source.y} Q ${(source.x + target.x) / 2 + (source.y - target.y) * 0.09} ${(source.y + target.y) / 2 + (target.x - source.x) * 0.09} ${target.x} ${target.y}`;
}

export function RelationshipNetworkView({
  model,
  events = [],
  stale = false,
  onBackToSandbox,
  onRefresh,
}: {
  model: RelationshipViewModel;
  events?: SandboxEvent[];
  stale?: boolean;
  onBackToSandbox: () => void;
  onRefresh?: () => void;
}) {
  const [positions, setPositions] = useState<Positions>(() => Object.fromEntries(model.nodes.map((node) => [node.uuid, { x: node.x, y: node.y }])));
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [query, setQuery] = useState('');
  const [labelsOn, setLabelsOn] = useState(true);
  const [enabled, setEnabled] = useState<Record<(typeof KINDS)[number], boolean>>({ Government: true, Project: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const positionsRef = useRef(positions);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  viewRef.current = view;
  positionsRef.current = positions;

  const renderPositions = layoutPositionsFor(model, positions);

  useEffect(() => {
    setPositions((current) => layoutPositionsFor(model, current));
  }, [model]);

  const visible = useCallback((node: RelationshipViewNode) => enabled[node.kind], [enabled]);
  const fitView = useCallback(() => {
    const rect = graphRef.current?.getBoundingClientRect();
    const points = model.nodes.filter(visible).map((node) => positionsRef.current[node.uuid]);
    if (!rect || points.length === 0) return;
    const padding = 95;
    const minX = Math.min(...points.map((point) => point.x)) - padding;
    const maxX = Math.max(...points.map((point) => point.x)) + padding;
    const minY = Math.min(...points.map((point) => point.y)) - padding;
    const maxY = Math.max(...points.map((point) => point.y)) + padding;
    const scale = clamp(Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY)), 0.35, 1.25);
    setView({ scale, tx: rect.width / 2 - ((minX + maxX) / 2) * scale, ty: rect.height / 2 - ((minY + maxY) / 2) * scale });
  }, [model.nodes, visible]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
        if (drag.moved) {
          const rect = graphRef.current?.getBoundingClientRect();
          if (!rect) return;
          const currentView = viewRef.current;
          setPositions((current) => ({ ...current, [drag.id]: {
            x: clamp((event.clientX - rect.left - currentView.tx) / currentView.scale, 35, WORLD.width - 35),
            y: clamp((event.clientY - rect.top - currentView.ty) / currentView.scale, 35, WORLD.height - 35),
          } }));
        }
        return;
      }
      const pan = panRef.current;
      if (pan) setView((current) => ({ ...current, tx: pan.tx + event.clientX - pan.startX, ty: pan.ty + event.clientY - pan.startY }));
    };
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      panRef.current = null;
      if (drag && !drag.moved) {
        const node = model.nodes.find((candidate) => candidate.uuid === drag.id);
        if (node?.kind === 'Project') playCardOpenSound(selectedId ? 'switch' : 'open');
        setSelectedId(drag.id);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [model.nodes, selectedId]);

  useEffect(() => {
    const canvas = graphRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      setView((current) => {
        const scale = clamp(current.scale + (event.deltaY < 0 ? 0.11 : -0.11), 0.45, 1.75);
        return { scale, tx: mouseX - ((mouseX - current.tx) * scale) / current.scale, ty: mouseY - ((mouseY - current.ty) * scale) / current.scale };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const nodeById = useMemo(() => new Map(model.nodes.map((node) => [node.uuid, node])), [model.nodes]);
  const selectedEnterpriseProfile = useMemo(() => {
    const selected = selectedId ? nodeById.get(selectedId) : undefined;
    return selected ? enterpriseProfileForNode(selected, events) : null;
  }, [events, nodeById, selectedId]);
  const matchingNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? model.nodes.filter((node) => visible(node) && node.name.toLowerCase().includes(normalized)).slice(0, 6) : [];
  }, [model.nodes, query, visible]);
  const activeId = selectedId ?? hoverId;
  const activeNodes = useMemo(() => {
    if (!activeId) return null;
    const nearby = new Set([activeId]);
    model.edges.forEach((edge) => { if (edge.source_node_uuid === activeId) nearby.add(edge.target_node_uuid); if (edge.target_node_uuid === activeId) nearby.add(edge.source_node_uuid); });
    return nearby;
  }, [activeId, model.edges]);

  return <div className="rn-app">
    <header className="rn-header">
      <div className="rn-title"><i /> <strong>政企关系网络</strong><span>BRIDGE EVENT PROJECTION · R{model.revision}</span></div>
      <div className="rn-tools">
        {stale && <span className="rn-stale">关系数据暂未同步</span>}
        <button type="button" onClick={onRefresh}>↻ 刷新</button>
        <button type="button" onClick={fitView}>⌗ 适应视图</button>
        <button type="button" onClick={() => { setView(INITIAL_VIEW); setSelectedId(null); }}>↻ 恢复全景</button>
        <button type="button" onClick={() => setLabelsOn((current) => !current)}>Aa 标签：{labelsOn ? '开' : '关'}</button>
        <button type="button" onClick={onBackToSandbox}>⌂ 返回沙盒</button>
      </div>
    </header>
    <div className="rn-search">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="⌕ 搜索政府或企业…" />
      {query.trim() && <div className="rn-search-results">
        {matchingNodes.length === 0 && <div>未找到匹配实体</div>}
        {matchingNodes.map((node) => <button key={node.uuid} type="button" onClick={() => { if (node.kind === 'Project') playCardOpenSound(selectedId ? 'switch' : 'open'); setSelectedId(node.uuid); setQuery(''); }}><b>{node.name}</b><span>{KIND_LABEL[node.kind]}</span></button>)}
      </div>}
    </div>
    <div ref={graphRef} className="rn-canvas" onPointerDown={(event) => {
      if ((event.target as Element).closest('[data-rn-node]')) return;
      panRef.current = { startX: event.clientX, startY: event.clientY, tx: view.tx, ty: view.ty };
    }}>
      <svg viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} width={WORLD.width} height={WORLD.height} style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
        <g>{model.edges.map((edge) => {
          const source = nodeById.get(edge.source_node_uuid); const target = nodeById.get(edge.target_node_uuid);
          if (!source || !target || !visible(source) || !visible(target)) return null;
          const active = activeId === edge.source_node_uuid || activeId === edge.target_node_uuid;
          return <g key={edge.uuid} className={activeNodes && !active ? 'rn-muted' : ''}>
            <path d={edgePath(edge, renderPositions)} fill="none" stroke={active ? '#ff7768' : edge.color || '#a9b6c5'} strokeWidth={active ? 2.4 : 1.35} strokeDasharray={edge.lineStyle === 'solid' ? undefined : edge.lineStyle === 'dotted' ? '2 5' : '4 5'} />
            {labelsOn && <text x={(renderPositions[edge.source_node_uuid].x + renderPositions[edge.target_node_uuid].x) / 2} y={(renderPositions[edge.source_node_uuid].y + renderPositions[edge.target_node_uuid].y) / 2 - 8} className="rn-edge-label">{edge.fact}</text>}
          </g>;
        })}</g>
        <g>{model.nodes.map((node) => {
          if (!visible(node)) return null;
          const position = renderPositions[node.uuid]; const muted = activeNodes !== null && !activeNodes.has(node.uuid); const active = activeId === node.uuid; const color = KIND_COLOR[node.kind];
          return <g key={node.uuid} data-rn-node={node.uuid} transform={`translate(${position.x} ${position.y})`} opacity={muted ? 0.15 : 1} className="rn-node" onPointerDown={(event) => { event.stopPropagation(); dragRef.current = { id: node.uuid, startX: event.clientX, startY: event.clientY, moved: false }; }} onPointerEnter={() => setHoverId(node.uuid)} onPointerLeave={() => setHoverId(null)}>
            {selectedId === node.uuid && <rect x={-29} y={-29} width={58} height={58} rx={8} fill="none" stroke="#ff7869" strokeWidth={1.2} strokeDasharray="3 4" />}
            <rect x={-22} y={-22} width={44} height={44} rx={6} fill={`${color}18`} stroke={active ? '#ff7869' : color} strokeWidth={active ? 2.2 : 1.4} />
            <text x={0} y={2} textAnchor="middle" dominantBaseline="central" fontSize={20} fill={color}>{node.icon}</text>
            {labelsOn && <><rect x={-48} y={27} width={96} height={17} rx={3} fill="#fffffff0" stroke="#d7e0eb" strokeWidth={0.75} /><text x={0} y={38.5} textAnchor="middle" dominantBaseline="central" className="rn-node-label">{node.name.length > 9 ? `${node.name.slice(0, 8)}…` : node.name}</text></>}
          </g>;
        })}</g>
      </svg>
    </div>
    <aside className="rn-legend"><h4>实体类型</h4>{KINDS.map((kind) => <label key={kind}><input type="checkbox" checked={enabled[kind]} onChange={(event) => setEnabled((current) => ({ ...current, [kind]: event.target.checked }))} /><i style={{ background: KIND_COLOR[kind] }} />{KIND_LABEL[kind]}</label>)}</aside>
    <div className="rn-hint">滚轮缩放 · 拖拽画布/节点 · 点击节点聚焦关系</div>
    <div className="rn-timeline"><small>事件时间轴</small><b>桥接事件 #{model.revision}</b><span>当前图谱由已记录决策投影</span></div>
    {selectedEnterpriseProfile && <EnterpriseProfileDrawer profile={selectedEnterpriseProfile} onClose={() => setSelectedId(null)} />}
  </div>;
}
