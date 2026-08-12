import React, { useEffect, useMemo, useState } from 'react';
import type { GraphNode, RelationType } from './types.ts';
import { nodeById } from './graph.fixture.ts';
import {
  getAgentProfileSnapshot,
  useSimulation,
} from '../scenario/simulation.ts';
import AgentMemoryTimeline from './AgentMemoryTimeline.tsx';

const RELATION_META: Record<RelationType, { label: string; color: string }> = {
  support: { label: '支持', color: '#46c0a8' },
  check: { label: '牵制', color: '#e05f5f' },
  depend: { label: '依赖', color: '#5f8fe0' },
  avoid: { label: '规避', color: '#8b9bb4' },
};

const KIND_BADGE: Record<string, string> = {
  Person: '人物',
  Government: '机构',
  Project: '项目',
};

interface Props {
  node: GraphNode;
  onClose: () => void;
  /** 当前高亮的关系目标（与选中节点配对） */
  focusedRelationId: string | null;
  onFocusRelation: (targetId: string | null) => void;
}

const resolveName = (id: string) => nodeById.get(id)?.name ?? id;

export default function AgentProfileDrawer({
  node,
  onClose,
  focusedRelationId,
  onFocusRelation,
}: Props) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState<string | null>(null);
  const [portraitBroken, setPortraitBroken] = useState(false);

  // 人设 + 推演当前轮次的合成视图；推进轮次时自动刷新
  const sim = useSimulation();
  const profile = useMemo(
    () => (node.agentId ? getAgentProfileSnapshot(node.agentId) : null),
    [node.agentId, sim],
  );

  // 切换节点时重置展开/过滤/头像错误状态（数据为同步快照，无加载闪烁）
  useEffect(() => {
    setPromptOpen(false);
    setMemoryFilter(null);
    setPortraitBroken(false);
  }, [node.uuid]);

  // 从关系列表点选关系时，记忆时间线同步过滤为该对象。
  useEffect(() => {
    if (focusedRelationId) setMemoryFilter(focusedRelationId);
  }, [focusedRelationId]);

  return (
    <aside
      role="dialog"
      aria-label={`${node.name} 档案`}
      className="drawer-enter absolute inset-x-2 bottom-2 z-30 flex h-[64%] flex-col overflow-hidden border-[3px] border-[#3a4466] bg-[#182331f2] shadow-[0_6px_0_#0a101d,0_14px_32px_#07101c99] backdrop-blur md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:h-auto md:w-[420px]"
    >
      <header className="flex items-center justify-between border-b-[3px] border-[#3a4466] px-4 py-3">
        <h2 className="text-sm tracking-[0.3em] text-[#8b9bb4]">
          {profile ? 'AGENT 档案' : '实体档案'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭档案"
          className="px-1 text-xl leading-none text-[#8b9bb4] transition-colors hover:text-[#fff4d6]"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* 1. 角色头部 */}
        <div className="flex items-start gap-3">
          {profile && profile.portrait && !portraitBroken ? (
            <img
              src={profile.portrait}
              alt={`${node.name} 头像`}
              onError={() => setPortraitBroken(true)}
              className="h-24 w-16 shrink-0 border-2 border-[#d8c37b] object-cover object-top [image-rendering:pixelated]"
            />
          ) : (
            <div className="grid h-24 w-16 shrink-0 place-items-center border-2 border-[#3a4466] bg-[#181425] text-2xl text-[#8b9bb4]">
              {node.icon ?? node.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-[#fff4d6]">{node.name}</span>
              <span className="border border-[#5a6988] px-1.5 py-px text-[10px] text-[#c0cbdc]">
                {KIND_BADGE[node.labels[1]] ?? '实体'}
              </span>
              {profile && (
                <span className="border border-[#d8c37b] bg-[#d8c37b1a] px-1.5 py-px text-[10px] text-[#d8c37b]">
                  {profile.faction}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[#c0cbdc]">{profile?.role ?? node.summary}</p>
            {profile &&
              (profile.status.text ? (
                <p className="mt-2 border-l-2 border-[#e8a04c] pl-2 text-xs leading-5 text-[#e8a04c]">
                  {profile.status.text}
                  <span className="ml-2 text-[10px] text-[#8b9bb4]">
                    截至 R{profile.status.asOfRound}
                  </span>
                </p>
              ) : (
                <p className="mt-2 border-l-2 border-[#3a4466] pl-2 text-xs leading-5 text-[#5a6988]">
                  暂无推演状态 — 运行后更新
                </p>
              ))}
          </div>
        </div>

        {profile ? (
          <>
            {/* 2. 系统提示词（默认折叠） */}
            <section className="mt-4 border-t-2 border-[#3a4466] pt-3">
              <button
                type="button"
                onClick={() => setPromptOpen((v) => !v)}
                aria-expanded={promptOpen}
                className="flex w-full items-center justify-between text-left"
              >
                <h3 className="text-[11px] tracking-[0.2em] text-[#8b9bb4]">
                  系统提示词
                </h3>
                <span className="text-[11px] text-[#d8c37b]">
                  {promptOpen ? '收起 ▴' : '查看 Agent 设定 ▾'}
                </span>
              </button>
              {promptOpen && (
                <dl className="mt-3 space-y-3 text-xs leading-5">
                  <div>
                    <dt className="text-[#8b9bb4]">身份</dt>
                    <dd className="mt-0.5 text-[#c0cbdc]">
                      {profile.systemPrompt.identity}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#8b9bb4]">动机</dt>
                    <dd className="mt-0.5 text-[#c0cbdc]">
                      {profile.systemPrompt.motivation}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#8b9bb4]">策略</dt>
                    <dd className="mt-0.5">
                      <ol className="list-decimal space-y-1 pl-4 text-[#c0cbdc]">
                        {profile.systemPrompt.strategy.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#8b9bb4]">行为边界</dt>
                    <dd className="mt-0.5">
                      <ul className="list-disc space-y-1 pl-4 text-[#c0cbdc]">
                        {profile.systemPrompt.boundaries.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#8b9bb4]">语言风格</dt>
                    <dd className="mt-0.5 text-[#c0cbdc]">
                      {profile.systemPrompt.speakingStyle}
                    </dd>
                  </div>
                </dl>
              )}
            </section>

            {/* 3. 记忆时间线 */}
            <AgentMemoryTimeline
              memories={profile.memories}
              filterAgentId={memoryFilter}
              onFilterChange={setMemoryFilter}
              resolveName={resolveName}
            />

            {/* 4. 关系上下文 */}
            <section className="mt-4 border-t-2 border-[#3a4466] pt-3">
              <h3 className="text-[11px] tracking-[0.2em] text-[#8b9bb4]">关系上下文</h3>
              {profile.relations.length === 0 ? (
                <p className="mt-3 border-2 border-dashed border-[#3a4466] p-4 text-center text-xs text-[#8b9bb4]">
                  暂无直接关系
                </p>
              ) : (
                <ul className="mt-2">
                  {profile.relations.map((r) => {
                    const meta = RELATION_META[r.type];
                    const active = focusedRelationId === r.targetId;
                    return (
                      <li key={r.targetId}>
                        <button
                          type="button"
                          onClick={() =>
                            onFocusRelation(active ? null : r.targetId)
                          }
                          className={`flex w-full items-center justify-between gap-2 border-b border-dashed border-[#3a4466] px-1 py-2 text-left transition-colors ${
                            active ? 'bg-[#d8c37b14]' : 'hover:bg-[#3a446633]'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="text-xs font-bold text-[#c0cbdc]">
                              {resolveName(r.targetId)}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-[#8b9bb4]">
                              {r.label}
                            </span>
                          </span>
                          <span
                            className="shrink-0 border px-1.5 py-px text-[10px]"
                            style={{ color: meta.color, borderColor: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-[10px] leading-4 text-[#5a6988]">
                点击关系可在关系图中高亮该连线，并只看双方相关记忆。
              </p>
            </section>
          </>
        ) : (
          /* 非 Agent 实体：基础信息 + 优雅空状态 */
          <>
            {Object.keys(node.attributes).length > 0 && (
              <section className="mt-4 border-t-2 border-[#3a4466] pt-3">
                <h3 className="text-[11px] tracking-[0.2em] text-[#8b9bb4]">
                  实体基础信息
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {Object.entries(node.attributes).map(([k, v]) => (
                    <div key={k} className="bg-[#181425] p-2">
                      <div className="text-[10px] text-[#8b9bb4]">{k}</div>
                      <div className="mt-0.5 text-xs text-[#c0cbdc]">{v}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="mt-4 border-2 border-dashed border-[#3a4466] p-4 text-center text-xs leading-6 text-[#8b9bb4]">
              该实体暂无 Agent 设定与记忆
              <br />
              <span className="text-[11px]">接入推演后将自动生成档案</span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
