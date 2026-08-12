import React from 'react';
import type { AgentProfile, GraphNode } from './types.ts';

/**
 * 悬停预览卡：抽屉内容的轻量子集，pointer-events 透明（纯展示）。
 * 内容由 RelationshipGraph 按悬停意图延迟后挂载。
 */

export const PREVIEW_CARD_WIDTH = 264;
export const PREVIEW_CARD_HEIGHT = 168;

interface Props {
  node: GraphNode;
  profile: AgentProfile | null;
  /** 节点圆心在页面坐标系中的位置 */
  x: number;
  y: number;
  /** 靠近右边缘（或抽屉遮挡区）时翻到节点左侧 */
  flipX: boolean;
}

export default function HoverPreviewCard({
  node,
  profile,
  x,
  y,
  flipX,
}: Props) {
  const left = flipX ? x - 30 - PREVIEW_CARD_WIDTH : x + 30;
  const top = Math.max(
    64,
    Math.min(y - 48, window.innerHeight - PREVIEW_CARD_HEIGHT - 12),
  );

  return (
    <div
      className="preview-pop pointer-events-none absolute z-30 border-[3px] border-[#3a4466] bg-[#182331f5] p-3 shadow-[0_4px_0_#0a101d,0_10px_24px_#07101c99]"
      style={{ left, top, width: PREVIEW_CARD_WIDTH }}
      aria-hidden
    >
      <div className="flex items-start gap-2.5">
        {profile && profile.portrait ? (
          <img
            src={profile.portrait}
            alt=""
            className="h-14 w-10 shrink-0 border-2 border-[#d8c37b] object-cover object-top [image-rendering:pixelated]"
          />
        ) : (
          <div className="grid h-14 w-10 shrink-0 place-items-center border-2 border-[#3a4466] bg-[#181425] text-lg text-[#8b9bb4]">
            {node.icon ?? node.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-[#fff4d6]">{node.name}</span>
            {profile && (
              <span className="border border-[#d8c37b] bg-[#d8c37b1a] px-1 py-px text-[9px] text-[#d8c37b]">
                {profile.faction}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-[#c0cbdc]">
            {profile?.role ?? node.summary}
          </p>
        </div>
      </div>

      {profile ? (
        <>
          <p className="mt-2 border-l-2 border-[#3a4466] pl-2 text-[11px] leading-4 text-[#5a6988]">
            {profile.status.text || '暂无推演状态 — 运行后更新'}
          </p>
          <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[#8b9bb4]">
            动机：{profile.systemPrompt.motivation}
          </p>
        </>
      ) : (
        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[#8b9bb4]">
          {node.summary}
        </p>
      )}

      <p className="mt-2 text-[9px] tracking-[0.15em] text-[#5a6988]">
        点击查看完整档案 →
      </p>
    </div>
  );
}
