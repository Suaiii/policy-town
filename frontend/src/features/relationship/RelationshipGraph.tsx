import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphEdge, GraphNode, NodeKind } from './types.ts';
import {
  graphEdges,
  graphNodes,
  nodeById,
  KIND_COLOR,
  KIND_LABEL,
  WORLD,
} from './graph.fixture.ts';
import { agentProfileFixtures } from './agentProfiles.fixture.ts';
import AgentProfileDrawer from './AgentProfileDrawer.tsx';
import HoverPreviewCard, { PREVIEW_CARD_WIDTH } from './HoverPreviewCard.tsx';
import { applyFisheye, DEFAULT_FISHEYE } from './fisheye.ts';
import { playCardOpenSound } from './sfx.ts';
import { activeScenario } from '../scenario/activeScenario.ts';
import {
  advanceRound,
  getAgentProfileSnapshot,
  resetSimulation,
  useSimulation,
} from '../scenario/simulation.ts';

interface View {
  tx: number;
  ty: number;
  scale: number;
}

type Positions = Record<string, { x: number; y: number }>;

const INITIAL_VIEW: View = { tx: 60, ty: 20, scale: 0.78 };
const CENTER_NODE = 'yan-guoqiang';
/** 顶栏高度（h-14），预览卡页面坐标换算用 */
const HEADER_H = 56;
/** 悬停意图确认延迟：避免路过节点时闪卡 */
const PREVIEW_INTENT_MS = 200;
/** 移出后的消失缓冲：避免在相邻节点间移动时抖动 */
const PREVIEW_HIDE_MS = 120;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const initialPositions = (): Positions =>
  Object.fromEntries(graphNodes.map((n) => [n.uuid, { x: n.x, y: n.y }]));

function edgePath(e: GraphEdge, pos: Positions): string {
  const a = pos[e.source_node_uuid];
  const b = pos[e.target_node_uuid];
  return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 + (a.y - b.y) * 0.09} ${
    (a.y + b.y) / 2 + (b.x - a.x) * 0.09
  } ${b.x} ${b.y}`;
}

const touches = (e: GraphEdge, id: string) =>
  e.source_node_uuid === id || e.target_node_uuid === id;

/** 图例只展示当前剧情里真实出现的节点类型 */
const PRESENT_KINDS = [
  ...new Set(graphNodes.map((n) => n.labels[1])),
] as NodeKind[];

export default function RelationshipGraph() {
  const [positions, setPositions] = useState<Positions>(initialPositions);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [relationFocus, setRelationFocus] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Record<NodeKind, boolean>>({
    Person: true,
    Government: true,
    Project: true,
  });
  const [labelsOn, setLabelsOn] = useState(true);
  const [query, setQuery] = useState('');
  /** 光标的世界坐标（鱼眼变换的圆心） */
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  /** 已通过意图确认、正在展示的悬停预览卡 */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const sim = useSimulation();

  const graphRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleSeq = useRef(0);
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current;
  const dragRef = useRef<{
    uuid: string;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    tx: number;
    ty: number;
  } | null>(null);

  const isVisible = useCallback(
    (n: GraphNode) => enabled[n.labels[1]],
    [enabled],
  );

  const centerOn = useCallback((uuid: string) => {
    const rect = graphRef.current?.getBoundingClientRect();
    const p = positionsRef.current[uuid];
    if (!rect || !p) return;
    setView((v) => {
      const scale = Math.max(v.scale, 0.88);
      return {
        scale,
        tx: rect.width / 2 - p.x * scale,
        ty: rect.height / 2 - p.y * scale,
      };
    });
  }, []);

  const select = useCallback(
    (uuid: string) => {
      // 抽屉已打开时切换角色用更轻的音效变体，避免听觉轰炸
      const prev = selectedIdRef.current;
      playCardOpenSound(prev && prev !== uuid ? 'switch' : 'open');
      setPreviewId(null);
      setSelectedId(uuid);
      setRelationFocus(null);
      if (!reducedMotion) {
        const p = positionsRef.current[uuid];
        rippleSeq.current += 1;
        setRipples((rs) => [...rs, { id: rippleSeq.current, x: p.x, y: p.y }]);
      }
      centerOn(uuid);
    },
    [centerOn, reducedMotion],
  );

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setRelationFocus(null);
  }, []);

  const resetView = useCallback(() => {
    setView(INITIAL_VIEW);
    setSelectedId(null);
    setRelationFocus(null);
    setHoverId(null);
    setPreviewId(null);
    setRipples([]);
  }, []);

  useEffect(
    () => () => {
      if (intentTimer.current) clearTimeout(intentTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const fitView = useCallback(() => {
    const rect = graphRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pts = graphNodes
      .filter((n) => isVisible(n))
      .map((n) => positionsRef.current[n.uuid]);
    if (pts.length === 0) return;
    const pad = 90;
    const minX = Math.min(...pts.map((p) => p.x)) - pad;
    const maxX = Math.max(...pts.map((p) => p.x)) + pad;
    const minY = Math.min(...pts.map((p) => p.y)) - pad;
    const maxY = Math.max(...pts.map((p) => p.y)) + pad;
    const scale = clamp(
      Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY)),
      0.3,
      1.2,
    );
    setView({
      scale,
      tx: rect.width / 2 - ((minX + maxX) / 2) * scale,
      ty: rect.height / 2 - ((minY + maxY) / 2) * scale,
    });
  }, [isVisible]);

  // 画布拖拽平移 + 节点拖拽（pointer capture 级别挂在 window 上）
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        if (
          !drag.moved &&
          Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4
        ) {
          drag.moved = true;
        }
        if (drag.moved) {
          const rect = graphRef.current?.getBoundingClientRect();
          if (!rect) return;
          const v = viewRef.current;
          const x = (e.clientX - rect.left - v.tx) / v.scale;
          const y = (e.clientY - rect.top - v.ty) / v.scale;
          setPositions((prev) => ({
            ...prev,
            [drag.uuid]: {
              x: clamp(x, 35, WORLD.width - 35),
              y: clamp(y, 35, WORLD.height - 35),
            },
          }));
        }
        return;
      }
      const pan = panRef.current;
      if (pan) {
        setView((v) => ({
          ...v,
          tx: pan.tx + e.clientX - pan.startX,
          ty: pan.ty + e.clientY - pan.startY,
        }));
      }
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (drag) {
        dragRef.current = null;
        // 未发生位移的 pointerup 视为点击 → 打开档案
        if (!drag.moved) select(drag.uuid);
      }
      panRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [select]);

  // 滚轮缩放（以光标为中心），需要非 passive 监听
  useEffect(() => {
    const el = graphRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const scale = clamp(v.scale + (e.deltaY < 0 ? 0.11 : -0.11), 0.48, 1.75);
        return {
          scale,
          tx: mx - ((mx - v.tx) * scale) / v.scale,
          ty: my - ((my - v.ty) * scale) / v.scale,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Esc 关闭档案
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDrawer]);

  // 首屏自适应一次，保证任何窗口尺寸下全图可见（不随筛选/缩放状态重跑）
  const didInitFit = useRef(false);
  useEffect(() => {
    if (didInitFit.current) return;
    didInitFit.current = true;
    fitView();
  }, [fitView]);

  // 一跳高亮集合：选中优先，其次悬停；点选关系时只保留两端节点
  const activeNeighbors = useMemo(() => {
    if (selectedId && relationFocus) {
      return new Set([selectedId, relationFocus]);
    }
    const activeId = selectedId ?? hoverId;
    if (!activeId) return null;
    const ids = new Set([activeId]);
    for (const e of graphEdges) {
      if (e.source_node_uuid === activeId) ids.add(e.target_node_uuid);
      if (e.target_node_uuid === activeId) ids.add(e.source_node_uuid);
    }
    return ids;
  }, [selectedId, hoverId, relationFocus]);

  const isEdgeActive = (e: GraphEdge): boolean => {
    if (selectedId && relationFocus) {
      return touches(e, selectedId) && touches(e, relationFocus);
    }
    const activeId = selectedId ?? hoverId;
    if (activeId) return touches(e, activeId);
    return touches(e, CENTER_NODE);
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graphNodes
      .filter((n) => isVisible(n) && n.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, isVisible]);

  const selectedNode = selectedId ? nodeById.get(selectedId) : undefined;

  // 鱼眼渲染变换：逻辑位置是唯一事实源，这里只是渲染层的纯函数映射。
  // 拖拽节点 / 平移画布 / 减少动态效果时暂停；节点数 > 50 降级为只放大悬停节点。
  const fisheyeEnabled =
    !reducedMotion &&
    cursor !== null &&
    dragRef.current === null &&
    panRef.current === null;
  const degradeFisheye = graphNodes.length > 50;
  const renderPositions: Record<string, { x: number; y: number; scale: number }> =
    Object.fromEntries(
      graphNodes.map((n) => {
        const p = positions[n.uuid];
        if (degradeFisheye) {
          return [n.uuid, n.uuid === hoverId ? { ...p, scale: 1.35 } : { ...p, scale: 1 }];
        }
        if (!fisheyeEnabled) return [n.uuid, { ...p, scale: 1 }];
        return [n.uuid, applyFisheye(p.x, p.y, cursor, DEFAULT_FISHEYE)];
      }),
    );

  // 悬停预览卡的页面坐标锚点与边缘翻转
  const previewNode = previewId ? nodeById.get(previewId) : undefined;
  let previewAnchor = { x: 0, y: 0 };
  let previewFlipX = false;
  if (previewNode) {
    const rp = renderPositions[previewNode.uuid];
    previewAnchor = {
      x: view.tx + rp.x * view.scale,
      y: HEADER_H + view.ty + rp.y * view.scale,
    };
    const drawerReserve = selectedNode && window.innerWidth >= 768 ? 448 : 16;
    previewFlipX =
      previewAnchor.x + 30 + PREVIEW_CARD_WIDTH >
      window.innerWidth - drawerReserve;
  }

  return (
    <div
      className="relative h-screen w-screen select-none overflow-hidden bg-[#f9fbfe] text-[#243955]"
      style={{
        backgroundImage:
          'radial-gradient(#cfdae8 1px, transparent 1px), linear-gradient(120deg, #ffffff, #f5f9fd)',
        backgroundSize: '15px 15px, 100% 100%',
      }}
    >
      {/* 顶栏 */}
      <header className="relative z-20 flex h-14 items-center justify-between border-b-[3px] border-[#d7e0eb] bg-[#ffffffc2] px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2.5 w-2.5 bg-[#ff7869]" />
          <span className="text-sm font-bold tracking-[0.2em] text-[#172b46]">
            人物关系网络
          </span>
          <span className="hidden text-[11px] tracking-[0.15em] text-[#758399] md:inline">
            {activeScenario.meta.title} · AGENT 档案入口
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-1 text-[11px] text-[#758399]"
            title="当前推演轮次"
          >
            R{sim.round}/{sim.totalRounds}
          </span>
          <button
            type="button"
            className={toolClass}
            disabled={sim.advancing || sim.round >= sim.totalRounds}
            onClick={() => void advanceRound()}
          >
            {sim.advancing
              ? '推演中…'
              : sim.round >= sim.totalRounds
                ? '推演完成'
                : `▶ 推进一轮`}
          </button>
          {sim.round > 0 && (
            <button
              type="button"
              className={toolClass}
              onClick={() => resetSimulation()}
            >
              ⟲ 重置推演
            </button>
          )}
          <button type="button" className={toolClass} onClick={fitView}>
            ⌗ 适应视图
          </button>
          <button type="button" className={toolClass} onClick={resetView}>
            ↻ 恢复全景
          </button>
          <button
            type="button"
            className={toolClass}
            onClick={() => setLabelsOn((v) => !v)}
          >
            Aa 标签：{labelsOn ? '开' : '关'}
          </button>
          <a href="#" className={toolClass} onClick={() => (window.location.hash = '')}>
            ⌂ 返回沙盒
          </a>
        </div>
      </header>

      {/* 搜索 */}
      <div className="absolute left-4 top-[72px] z-20 w-60 md:left-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="⌕ 搜索人物或机构…"
          className="w-full border-2 border-[#d7e0eb] bg-[#fffffff0] px-3 py-2 text-xs text-[#203550] placeholder-[#93a0b0] shadow-[2px_2px_0_#dce5ef] outline-none focus:border-[#ff897b]"
        />
        {query.trim() && (
          <div className="mt-1 overflow-hidden border-2 border-[#d7e0eb] bg-[#fffffffa] shadow-[2px_2px_0_#dce5ef]">
            {searchResults.length === 0 && (
              <div className="px-3 py-2 text-xs text-[#8493a8]">未找到匹配实体</div>
            )}
            {searchResults.map((n) => (
              <button
                key={n.uuid}
                type="button"
                className="block w-full px-3 py-2 text-left text-xs text-[#42536b] hover:bg-[#fff0ed]"
                onClick={() => {
                  select(n.uuid);
                  setQuery('');
                }}
              >
                <b className="text-[#243955]">{n.name}</b>
                <span className="ml-2 text-[10px] text-[#93a0b0]">
                  {KIND_LABEL[n.labels[1]]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 图画布 */}
      <div
        ref={graphRef}
        className="absolute inset-x-0 bottom-0 top-14 cursor-grab overflow-hidden active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as Element).closest('[data-node]')) return;
          panRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            tx: view.tx,
            ty: view.ty,
          };
        }}
        onPointerMove={(e) => {
          const rect = graphRef.current?.getBoundingClientRect();
          if (!rect) return;
          const v = viewRef.current;
          setCursor({
            x: (e.clientX - rect.left - v.tx) / v.scale,
            y: (e.clientY - rect.top - v.ty) / v.scale,
          });
        }}
        onPointerLeave={() => setCursor(null)}
      >
        <svg
          viewBox={`0 0 ${WORLD.width} ${WORLD.height}`}
          width={WORLD.width}
          height={WORLD.height}
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <defs>
            {graphNodes
              .filter((n) => n.agentId)
              .map((n) => (
                <clipPath key={n.uuid} id={`clip-${n.uuid}`}>
                  <rect x={-20} y={-20} width={40} height={40} rx={5} />
                </clipPath>
              ))}
          </defs>

          {/* 连线层 */}
          <g>
            {graphEdges.map((e) => {
              const a = nodeById.get(e.source_node_uuid)!;
              const b = nodeById.get(e.target_node_uuid)!;
              if (!isVisible(a) || !isVisible(b)) return null;
              const active = isEdgeActive(e);
              const muted = activeNeighbors !== null && !active;
              return (
                <path
                  key={e.uuid}
                  d={edgePath(e, renderPositions)}
                  fill="none"
                  stroke={active ? '#ff7768' : '#a9b6c5'}
                  strokeWidth={active ? 2.4 : 1.3}
                  strokeDasharray="3 5"
                  opacity={muted ? 0.07 : active ? 1 : 0.62}
                  style={{ transition: 'opacity .2s, stroke .2s', cursor: 'pointer' }}
                  onClick={() => select(e.source_node_uuid)}
                >
                  <title>{`${a.name} — ${e.name} — ${b.name}`}</title>
                </path>
              );
            })}
          </g>

          {/* 节点层 */}
          <g>
            {graphNodes.map((n) => {
              if (!isVisible(n)) return null;
              const p = renderPositions[n.uuid];
              const muted = activeNeighbors !== null && !activeNeighbors.has(n.uuid);
              const selected = selectedId === n.uuid;
              const hovered = hoverId === n.uuid;
              const kind = n.labels[1];
              const color = KIND_COLOR[kind];
              const portrait = n.agentId
                ? agentProfileFixtures[n.agentId]?.portrait
                : undefined;
              const stroke = selected ? '#ff7869' : hovered ? '#ff897b' : color;
              return (
                <g
                  key={n.uuid}
                  data-node={n.uuid}
                  transform={`translate(${p.x} ${p.y}) scale(${p.scale})`}
                  opacity={muted ? 0.15 : 1}
                  style={{ transition: 'opacity .2s', cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    dragRef.current = {
                      uuid: n.uuid,
                      startX: e.clientX,
                      startY: e.clientY,
                      moved: false,
                    };
                  }}
                  onPointerEnter={(e) => {
                    // 触屏无悬停预览；拖拽/平移途中不触发
                    if (e.pointerType === 'touch') return;
                    setHoverId(n.uuid);
                    if (panRef.current || dragRef.current) return;
                    if (hideTimer.current) clearTimeout(hideTimer.current);
                    if (previewId) {
                      // 预览卡已展示时在节点间直接切换，不再等待意图延迟
                      setPreviewId(n.uuid);
                    } else {
                      if (intentTimer.current) clearTimeout(intentTimer.current);
                      intentTimer.current = setTimeout(
                        () => setPreviewId(n.uuid),
                        PREVIEW_INTENT_MS,
                      );
                    }
                  }}
                  onPointerLeave={() => {
                    setHoverId(null);
                    if (intentTimer.current) clearTimeout(intentTimer.current);
                    hideTimer.current = setTimeout(
                      () => setPreviewId(null),
                      PREVIEW_HIDE_MS,
                    );
                  }}
                >
                  {selected && (
                    <rect
                      x={-28}
                      y={-28}
                      width={56}
                      height={56}
                      rx={8}
                      fill="none"
                      stroke="#ff7869"
                      strokeWidth={1.2}
                      strokeDasharray="3 4"
                    />
                  )}
                  <rect
                    x={-22}
                    y={-22}
                    width={44}
                    height={44}
                    rx={6}
                    fill={portrait ? '#ffffff' : `${color}18`}
                    stroke={stroke}
                    strokeWidth={selected || hovered ? 2.2 : 1.4}
                  />
                  {portrait ? (
                    <image
                      href={portrait}
                      x={-20}
                      y={-20}
                      width={40}
                      height={40}
                      preserveAspectRatio="xMidYMin slice"
                      clipPath={`url(#clip-${n.uuid})`}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  ) : (
                    <text
                      x={0}
                      y={1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={20}
                      fill={color}
                    >
                      {n.icon ?? '◈'}
                    </text>
                  )}
                  {labelsOn && (
                    <>
                      <rect
                        x={-42}
                        y={27}
                        width={84}
                        height={17}
                        rx={3}
                        fill="#fffffff0"
                        stroke="#d7e0eb"
                        strokeWidth={0.75}
                      />
                      <text
                        x={0}
                        y={38.5}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={11}
                        fontWeight={700}
                        fill={portrait ? '#243955' : color}
                        style={{ pointerEvents: 'none' }}
                      >
                        {n.name.length > 8 ? `${n.name.slice(0, 7)}…` : n.name}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {/* 点击涟漪：以被点节点为圆心扩散一圈，动画结束自动移除 */}
          <g pointerEvents="none">
            {ripples.map((r) => (
              <circle
                key={r.id}
                cx={r.x}
                cy={r.y}
                r={170}
                className="ripple-circle"
                fill="none"
                stroke="#ff7768"
                strokeWidth={4}
                onAnimationEnd={() =>
                  setRipples((rs) => rs.filter((q) => q.id !== r.id))
                }
              />
            ))}
          </g>
        </svg>
      </div>

      {/* 图例 */}
      <aside className="absolute bottom-4 left-4 z-20 w-44 border-2 border-[#dbe4ed] bg-[#fffffff0] p-3 shadow-[3px_3px_0_#dce5ef] backdrop-blur md:left-6">
        <h4 className="text-[10px] tracking-[0.25em] text-[#5f6d82]">实体类型</h4>
        {PRESENT_KINDS.map((kind) => (
          <label
            key={kind}
            className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[#42536b]"
          >
            <input
              type="checkbox"
              checked={enabled[kind]}
              onChange={(e) =>
                setEnabled((prev) => ({ ...prev, [kind]: e.target.checked }))
              }
              style={{ accentColor: KIND_COLOR[kind] }}
            />
            <span
              className="inline-block h-2 w-2"
              style={{ background: KIND_COLOR[kind] }}
            />
            {KIND_LABEL[kind]}
          </label>
        ))}
      </aside>
      <div className="absolute bottom-5 left-52 z-10 hidden text-[11px] text-[#93a0b0] md:block">
        滚轮缩放 · 拖拽画布/节点 · 点击节点查看 Agent 档案
      </div>

      {/* 移动端遮罩：点击关闭档案 */}
      {selectedNode && (
        <div
          className="fixed inset-0 z-20 bg-black/55 md:hidden"
          onClick={closeDrawer}
        />
      )}

      {/* 悬停预览卡（意图延迟确认；抽屉打开时悬停其他节点仍可预览） */}
      {previewNode && (
        <HoverPreviewCard
          node={previewNode}
          profile={
            previewNode.agentId
              ? getAgentProfileSnapshot(previewNode.agentId)
              : null
          }
          x={previewAnchor.x}
          y={previewAnchor.y}
          flipX={previewFlipX}
        />
      )}

      {/* Agent 档案抽屉（桌面右侧 420px / 移动端底部抽屉） */}
      {selectedNode && (
        <AgentProfileDrawer
          node={selectedNode}
          onClose={closeDrawer}
          focusedRelationId={relationFocus}
          onFocusRelation={setRelationFocus}
        />
      )}
    </div>
  );
}

const toolClass =
  'border-2 border-[#d7e0eb] bg-white px-2.5 py-1.5 text-[11px] text-[#41536b] shadow-[2px_2px_0_#dce5ef] transition-colors hover:border-[#ff897b] hover:text-[#d85e51] disabled:cursor-not-allowed disabled:opacity-50';
