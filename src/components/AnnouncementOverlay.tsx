import { useEffect, useMemo, useRef } from 'react';
import { getEnterprise, stages, supportToolLabels } from '../game/scenario';
import type { EnterpriseState, SimulationState } from '../game/types';

const phaseLabels: Record<SimulationState['phase'], string> = {
  setup: '推演设置',
  briefing: '决策时点',
  applications: '项目申请',
  analysis: '部门联席研判',
  allocation: '政府条件单',
  response: '企业自主行动',
  settlement: '统一结算',
  feedback: '状态变化',
  result: '历史对照',
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function announcementTopic(state: SimulationState, enterprise: EnterpriseState) {
  const stage = stages[state.stageIndex];
  const profile = getEnterprise(enterprise.id);
  const decision = enterprise.allocation > 0
    ? `安排财政投入 ${enterprise.allocation} 点并实施分期履约管理`
    : '纳入联席研判并实施审慎的里程碑管理';
  return `${stage.date}阶段对企业 ${enterprise.code}（${profile.alias}）${profile.industry}项目作出决策：${decision}`;
}

export function AnnouncementOverlay({
  open,
  state,
  enterprise,
  onOpen,
  onClose,
}: {
  open: boolean;
  state: SimulationState;
  enterprise: EnterpriseState;
  onOpen: () => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const profile = getEnterprise(enterprise.id);
  const stage = stages[state.stageIndex];

  const frameUrl = useMemo(() => {
    const params = new URLSearchParams({
      autoplay: '1',
      issuer: '合肥市人民政府',
      subject: `企业 ${enterprise.code} · ${profile.alias}`,
      stage: `${stage.code} · ${stage.date}`,
      phase: phaseLabels[state.phase],
      allocation: String(enterprise.allocation),
      tools: enterprise.supportTools.map((tool) => supportToolLabels[tool]).join('、'),
      conditions: enterprise.conditions.join('；'),
      topic: announcementTopic(state, enterprise),
    });
    const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
    if (siteUrl) params.set('api', siteUrl.replace(/\/+$/, ''));
    return `/announce/index.html?${params.toString()}`;
  }, [enterprise, profile.alias, stage.code, stage.date, state.phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        onClose();
        return;
      }
      if (
        event.code === 'KeyA' &&
        !open &&
        !event.repeat &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        onOpen();
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'policy-town:close-announce') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('message', onMessage);
    };
  }, [onClose, onOpen, open]);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="announcement-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="announcement-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`查看企业 ${enterprise.code} 决策公告`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="announcement-dialog-header">
          <span className="announcement-star" aria-hidden="true">★</span>
          <div>
            <strong>决策公告 · 企业 {enterprise.code} · {profile.alias}</strong>
            <small>{stage.code} · {stage.date} · {phaseLabels[state.phase]}</small>
          </div>
          <span className="announcement-shortcut"><kbd>A</kbd> 快速调出</span>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭红头文件界面">×</button>
        </header>
        <iframe className="announcement-frame" src={frameUrl} title={`企业 ${enterprise.code} 决策红头文件`} />
      </section>
    </div>
  );
}
