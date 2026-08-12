import React, { useMemo } from 'react';
import type { AgentMemory, MemoryStance } from './types.ts';
import {
  filterMemoriesByAgent,
  sortMemoriesByRoundDesc,
} from './agentProfiles.fixture.ts';

const STANCE_LABEL: Record<MemoryStance, string> = {
  support: '支持',
  oppose: '反对',
  cautious: '谨慎',
  neutral: '中立',
};

const STANCE_COLOR: Record<MemoryStance, string> = {
  support: '#46c0a8',
  oppose: '#e05f5f',
  cautious: '#e8a04c',
  neutral: '#8b9bb4',
};

interface Props {
  memories: AgentMemory[];
  /** 非空时只展示与该人物/机构有关的记忆 */
  filterAgentId: string | null;
  onFilterChange: (id: string | null) => void;
  resolveName: (id: string) => string;
}

export default function AgentMemoryTimeline({
  memories,
  filterAgentId,
  onFilterChange,
  resolveName,
}: Props) {
  const sorted = useMemo(() => sortMemoriesByRoundDesc(memories), [memories]);
  const relatedIds = useMemo(() => {
    const ids: string[] = [];
    for (const m of memories) {
      for (const id of m.relatedAgentIds) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
    return ids;
  }, [memories]);

  const visible = filterAgentId
    ? filterMemoriesByAgent(sorted, filterAgentId)
    : sorted;

  return (
    <section className="mt-4 border-t-2 border-[#3a4466] pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] tracking-[0.2em] text-[#8b9bb4]">记忆时间线</h3>
        {filterAgentId && (
          <span className="text-[11px] text-[#e8a04c]">
            只看与「{resolveName(filterAgentId)}」有关
          </span>
        )}
      </div>

      {relatedIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onFilterChange(null)}
            className={`border px-2 py-0.5 text-[11px] transition-colors ${
              filterAgentId === null
                ? 'border-[#d8c37b] bg-[#d8c37b1a] text-[#fff4d6]'
                : 'border-[#3a4466] text-[#8b9bb4] hover:border-[#5a6988]'
            }`}
          >
            全部
          </button>
          {relatedIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onFilterChange(id === filterAgentId ? null : id)}
              className={`border px-2 py-0.5 text-[11px] transition-colors ${
                filterAgentId === id
                  ? 'border-[#d8c37b] bg-[#d8c37b1a] text-[#fff4d6]'
                  : 'border-[#3a4466] text-[#8b9bb4] hover:border-[#5a6988]'
              }`}
            >
              {resolveName(id)}
            </button>
          ))}
        </div>
      )}

      <ol className="mt-3 space-y-3">
        {visible.length === 0 && (
          <li className="border-2 border-dashed border-[#3a4466] p-4 text-center text-xs leading-6 text-[#8b9bb4]">
            暂无相关记忆
            <br />
            <span className="text-[11px]">推演运行后将自动沉淀</span>
          </li>
        )}
        {visible.map((m) => (
          <li
            key={`${m.round}-${m.scene}`}
            className={`relative border-l-2 pl-3 ${
              filterAgentId ? 'border-[#d8c37b]' : 'border-[#3a4466]'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-bold text-[#fff4d6]">
                R{m.round} · {m.scene}
              </span>
              <span
                className="shrink-0 border px-1.5 py-px text-[10px]"
                style={{
                  color: STANCE_COLOR[m.stance],
                  borderColor: STANCE_COLOR[m.stance],
                }}
              >
                {STANCE_LABEL[m.stance]}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#c0cbdc]">{m.summary}</p>
            {m.relatedAgentIds.length > 0 && (
              <p className="mt-1 text-[11px] text-[#8b9bb4]">
                影响对象：{m.relatedAgentIds.map(resolveName).join('、')}
              </p>
            )}
            {m.decision && (
              <p className="mt-1 bg-[#181425] px-2 py-1 text-[11px] leading-4 text-[#e8a04c]">
                ▸ 决策：{m.decision}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
