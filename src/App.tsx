import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GlassTabs, GlassTabsList, GlassTabsTrigger } from '@mawtech/glass-ui';
import { PROJECT_VISUAL_PALETTES } from '../packages/map-visuals/src/MapProjectLayer';
import { emptyNegotiationRecord, NegotiationOverlay } from './components/NegotiationOverlay';
import type { NegotiationRecord } from './components/NegotiationOverlay';
import { TableScene } from './components/TableScene';
import { ResourceGauge } from './components/ResourceGauge';
import { ActionButton, FrameCorners, FramedCard, FramedPanel, PanelHeading, SectionLabel } from './components/ui/ParlorUI';
import { ENTERPRISE_ARCHETYPES, simulationToMapSnapshot } from './integration/mapAdapter';
import { TableMapSurface } from './map/TableMapSurface';
import {
  agentLabels,
  agentReports,
  enterprises as enterpriseProfiles,
  getEnterprise,
  jointReviewSummaries,
  stages,
  supportToolLabels,
} from './game/scenario';
import {
  continueSimulation,
  enterApplications,
  enterEnterpriseMeeting,
  initialState,
  openAllocation,
  openAnalysis,
  revealEvent,
  selectEnterprise,
  settleRound,
  submitDecision,
  toggleSupportTool,
  updateAllocation,
} from './game/simulation';
import type { CameraMode, EnterpriseId, SimulationState, SupportTool } from './game/types';

function enterpriseIdentityStyle(id: EnterpriseId): CSSProperties {
  const palette = PROJECT_VISUAL_PALETTES[ENTERPRISE_ARCHETYPES[id]];
  return {
    '--enterprise-accent': palette.accent,
    '--enterprise-primary': palette.primary,
  } as CSSProperties;
}

const phaseLabels = {
  briefing: '决策时点',
  applications: '项目申请',
  analysis: '部门联席研判',
  allocation: '政府条件单',
  response: '企业自主行动',
  settlement: '统一结算',
  feedback: '状态变化',
  result: '历史对照',
} as const;

const phaseOrder = Object.keys(phaseLabels) as Array<keyof typeof phaseLabels>;

const resourceLabels = {
  fiscal: '可用财政点数',
  committed: '已承诺资本',
  industry: '产业基础',
  supplyChain: '供应链',
  talent: '人才供给',
  infrastructure: '基础设施余度',
  credibility: '政府信用',
} as const;

function CurrentStepTrigger({
  phase,
  open,
  pinned,
  onOpen,
  onLeave,
  onToggle,
}: {
  phase: keyof typeof phaseLabels;
  open: boolean;
  pinned: boolean;
  onOpen: () => void;
  onLeave: () => void;
  onToggle: () => void;
}) {
  return (
    <button
      className={`current-step-trigger ${open ? 'active' : ''}`}
      type="button"
      aria-expanded={open}
      aria-controls="decision-timeline-popover"
      aria-label={`当前步骤：${phaseLabels[phase]}，悬浮查看流程，点击${pinned ? '取消固定' : '固定时间线'}`}
      onMouseEnter={onOpen}
      onMouseLeave={onLeave}
      onFocus={onOpen}
      onClick={onToggle}
    >
      <small>CURRENT STEP</small>
      <strong>{phaseLabels[phase]}</strong>
    </button>
  );
}

function CurrentStepTimeline({
  phase,
  open,
  pinned,
  onOpen,
  onLeave,
}: {
  phase: keyof typeof phaseLabels;
  open: boolean;
  pinned: boolean;
  onOpen: () => void;
  onLeave: () => void;
}) {
  const activeIndex = phaseOrder.indexOf(phase);
  const pastCount = activeIndex;
  const futureCount = phaseOrder.length - activeIndex - 1;

  return (
    <div
      id="decision-timeline-popover"
      className={`step-timeline-popover ${open ? 'timeline-visible' : ''}`}
      role="dialog"
      aria-label="决策流程时间线"
      aria-hidden={!open}
      onMouseEnter={onOpen}
      onMouseLeave={onLeave}
    >
        <div className="timeline-caption"><span>DECISION TIMELINE</span><b>{pinned ? '已固定 · 点击顶部状态收起' : '当前步骤始终位于中央'}</b></div>
        <svg className="timeline-u-track" viewBox="0 0 520 205" aria-hidden="true">
          <path d="M28 30 C34 118 92 166 216 174 Q260 190 304 174 C428 166 486 118 492 30" />
        </svg>
        {phaseOrder.map((item, index) => {
          const current = index === activeIndex;
          let x = 260;
          let y = 176;
          if (index < activeIndex) {
            const distance = activeIndex - index;
            const ratio = pastCount ? distance / pastCount : 0;
            x = 216 - 188 * ratio;
            y = 163 - 130 * ratio;
          } else if (index > activeIndex) {
            const distance = index - activeIndex;
            const ratio = futureCount ? distance / futureCount : 0;
            x = 304 + 188 * ratio;
            y = 163 - 130 * ratio;
          }
          return (
            <div
              className={`timeline-node ${current ? 'current' : index < activeIndex ? 'past' : 'future'}`}
              key={item}
              style={{ left: `${x / 5.2}%`, top: `${y / 2.05}%` }}
            >
              <i />
              <span>{String(index + 1).padStart(2, '0')}</span>
              <b>{phaseLabels[item]}</b>
            </div>
          );
        })}
        <div className="timeline-pointer"><i /><span>NOW</span></div>
    </div>
  );
}

function App() {
  const [state, setState] = useState(initialState);
  const [mapCanvas, setMapCanvas] = useState<HTMLCanvasElement | null>(null);
  const [negotiationRecords, setNegotiationRecords] = useState<Record<string, NegotiationRecord>>({});
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelinePinned, setTimelinePinned] = useState(false);
  const timelineCloseTimer = useRef<number | null>(null);
  const mapSnapshot = useMemo(() => simulationToMapSnapshot(state), [state]);
  const receiveMapCanvas = useCallback((canvas: HTMLCanvasElement) => setMapCanvas(canvas), []);
  const selected = state.enterprises.find((enterprise) => enterprise.id === state.selectedEnterpriseId)!;
  const allocationTotal = state.enterprises.reduce((sum, enterprise) => sum + enterprise.allocation, 0);
  const meetingOpen = state.cameraMode === 'meeting';
  const meetingKey = `${state.stageIndex}:${state.selectedEnterpriseId}`;
  const meetingRecord = negotiationRecords[meetingKey] ?? emptyNegotiationRecord;
  const openTimeline = () => {
    if (timelineCloseTimer.current !== null) window.clearTimeout(timelineCloseTimer.current);
    timelineCloseTimer.current = null;
    setTimelineOpen(true);
  };
  const scheduleTimelineClose = () => {
    if (timelinePinned) return;
    if (timelineCloseTimer.current !== null) window.clearTimeout(timelineCloseTimer.current);
    timelineCloseTimer.current = window.setTimeout(() => setTimelineOpen(false), 180);
  };
  const toggleTimelinePin = () => {
    setTimelinePinned((current) => {
      const next = !current;
      setTimelineOpen(next);
      return next;
    });
  };
  const chooseEnterprise = (id: EnterpriseId) => {
    setState((current) => enterEnterpriseMeeting(current, id));
  };

  const switchMeetingEnterprise = (direction: -1 | 1) => {
    setState((current) => {
      const currentIndex = current.enterprises.findIndex((enterprise) => enterprise.id === current.selectedEnterpriseId);
      const nextIndex = (currentIndex + direction + current.enterprises.length) % current.enterprises.length;
      return enterEnterpriseMeeting(current, current.enterprises[nextIndex].id);
    });
  };

  const updateMeetingRecord = (record: NegotiationRecord) => {
    setNegotiationRecords((current) => ({ ...current, [meetingKey]: record }));
  };

  const closeMeeting = () => {
    setState((current) => ({ ...current, cameraMode: 'table' }));
  };

  const applyNegotiatedOffer = (record: NegotiationRecord) => {
    setState((current) => {
      let next = updateAllocation(current, current.selectedEnterpriseId, record.fiscalOffer);
      const currentEnterprise = next.enterprises.find((enterprise) => enterprise.id === next.selectedEnterpriseId)!;
      for (const tool of currentEnterprise.supportTools) {
        if (!record.tools.includes(tool)) next = toggleSupportTool(next, next.selectedEnterpriseId, tool);
      }
      for (const tool of record.tools) {
        const enterprise = next.enterprises.find((item) => item.id === next.selectedEnterpriseId)!;
        if (!enterprise.supportTools.includes(tool) && enterprise.supportTools.length < 3) {
          next = toggleSupportTool(next, next.selectedEnterpriseId, tool);
        }
      }
      return { ...next, cameraMode: 'table' };
    });
  };

  const restart = () => {
    setNegotiationRecords({});
    setState(initialState);
  };

  return (
    <main className={`app-shell ${meetingOpen ? 'is-meeting' : ''}`}>
      <section className="world-layer" aria-label="360 度政府产业投资决策空间">
        <TableScene
          mode={state.cameraMode}
          enterprises={state.enterprises}
          mapSnapshot={mapSnapshot}
          mapCanvas={mapCanvas}
          selectedId={state.selectedEnterpriseId}
          onEnterpriseSelect={chooseEnterprise}
        />
        <TableMapSurface onCanvasReady={receiveMapCanvas} />
      </section>

      <FramedPanel as="header" className="topbar">
        <div className="brand-block">
          <div><strong>合肥产业投资决策沙盘</strong><small>HEFEI INDUSTRIAL DECISION SANDBOX</small></div>
        </div>
        <div className="turn-status">
          <span className="live-dot" />
          <div><small>DECISION STAGE</small><strong>{stages[state.stageIndex].code} · {stages[state.stageIndex].date}</strong></div>
          <i />
          {meetingOpen
            ? <div><small>CURRENT STEP</small><strong>政企关键核验</strong></div>
            : <CurrentStepTrigger
                phase={state.phase}
                open={timelineOpen}
                pinned={timelinePinned}
                onOpen={openTimeline}
                onLeave={scheduleTimelineClose}
                onToggle={toggleTimelinePin}
              />}
        </div>
        <GlassTabs value={state.cameraMode} onValueChange={(mode) => setState((current) => ({ ...current, cameraMode: mode as CameraMode }))} className="camera-tabs">
          <GlassTabsList className="camera-switch" aria-label="镜头切换">
            {([
              ['table', '沙盘'],
              ['meeting', '企业核验'],
              ['panorama', '360°'],
            ] as Array<[CameraMode, string]>).map(([mode, label]) => (
              <GlassTabsTrigger key={mode} value={mode} className={state.cameraMode === mode ? 'active' : ''}>{label}</GlassTabsTrigger>
            ))}
          </GlassTabsList>
        </GlassTabs>
      </FramedPanel>

      {!meetingOpen && <CurrentStepTimeline
        phase={state.phase}
        open={timelineOpen}
        pinned={timelinePinned}
        onOpen={openTimeline}
        onLeave={scheduleTimelineClose}
      />}

      {meetingOpen && <NegotiationOverlay
        enterprise={selected}
        phase={state.phase}
        stageLabel={stages[state.stageIndex].date}
        record={meetingRecord}
        onChange={updateMeetingRecord}
        onClose={closeMeeting}
        onApply={applyNegotiatedOffer}
        onPrevious={() => switchMeetingEnterprise(-1)}
        onNext={() => switchMeetingEnterprise(1)}
      />}

      {state.cameraMode === 'table' && <nav className="table-enterprise-strip" aria-label="沙盘企业席位">
        {state.enterprises.map((enterprise) => {
          const enterpriseProfile = getEnterprise(enterprise.id);
          const visualPalette = PROJECT_VISUAL_PALETTES[ENTERPRISE_ARCHETYPES[enterprise.id]];
          const identityStyle = {
            '--enterprise-accent': visualPalette.accent,
            '--enterprise-primary': visualPalette.primary,
          } as CSSProperties;
          return (
            <button
              key={enterprise.id}
              className={`table-enterprise-plaque table-seat-plaque enterprise-identity ${enterprise.id === state.selectedEnterpriseId ? 'active' : ''}`}
              style={identityStyle}
              onClick={() => chooseEnterprise(enterprise.id)}
            >
              <FrameCorners inset />
              <small>企业 {enterprise.code}</small>
              <strong>{enterpriseProfile.industry}</strong>
              <span>{enterprise.allocation > 0 ? `政府投入 ${enterprise.allocation} 点` : `资金请求 ${enterpriseProfile.request} 点`}</span>
            </button>
          );
        })}
      </nav>}

      <FramedPanel as="aside" className="left-rail">
        <div className="eyebrow">FROZEN CONTEXT · {stages[state.stageIndex].code}</div>
        <h1>{stages[state.stageIndex].date}<br /><em>{stages[state.stageIndex].label}</em></h1>
        <p>你是政府最终决策者。本轮只呈现截止 {stages[state.stageIndex].cutoff} 当时可知的信息，未来结果保持隔离。</p>

        <FramedCard className="fiscal-callout" tone="amber">
          <span>本轮财政池</span>
          <strong>{state.roundFiscalStart}</strong>
          <small>{state.phase === 'allocation' ? `已配置 ${allocationTotal} · 可用 ${state.roundFiscalStart - allocationTotal}` : '支持一个项目，会压缩其他项目与未来阶段空间'}</small>
        </FramedCard>

      </FramedPanel>

      <FramedPanel as="aside" className="decision-panel enterprise-ui-theme" style={enterpriseIdentityStyle(selected.id)}>
        <PanelContent state={state} setState={setState} onRestart={restart} onStartMeeting={chooseEnterprise} />
      </FramedPanel>

      <FramedPanel as="footer" className="resource-bar">
        {(Object.keys(resourceLabels) as Array<keyof typeof resourceLabels>).map((key) => (
          <div className={`resource ${key === 'fiscal' ? 'resource-primary' : ''}`} key={key}>
            <ResourceGauge value={state.resources[key]} primary={key === 'fiscal'} />
            <div><span>{resourceLabels[key]}</span><b>{Math.round(state.resources[key])}</b></div>
          </div>
        ))}
        <div className="commitment-ledger">
          <small>当前焦点</small>
          <strong>{selected.code} · {getEnterprise(selected.id).industry}</strong>
        </div>
      </FramedPanel>

      {state.cameraMode === 'panorama' && <div className="orbit-hint">拖动场景环视 · 滚轮已锁定</div>}
    </main>
  );
}

function EnterpriseTabs({ state, setState }: {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
}) {
  return (
    <GlassTabs value={state.selectedEnterpriseId} onValueChange={(id) => setState((current) => selectEnterprise(current, id as EnterpriseId))}>
      <GlassTabsList className="enterprise-tabs" aria-label="候选企业">
        {state.enterprises.map((enterprise) => {
          const profile = getEnterprise(enterprise.id);
          return (
            <GlassTabsTrigger
              value={enterprise.id}
              className={`enterprise-identity ${state.selectedEnterpriseId === enterprise.id ? 'active' : ''}`}
              style={enterpriseIdentityStyle(enterprise.id)}
              key={enterprise.id}
            >
              <b>{enterprise.code}</b><span>{profile.industry}</span>
            </GlassTabsTrigger>
          );
        })}
      </GlassTabsList>
    </GlassTabs>
  );
}

function PanelContent({ state, setState, onRestart, onStartMeeting }: {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
  onRestart: () => void;
  onStartMeeting: (id: EnterpriseId) => void;
}) {
  const selected = state.enterprises.find((enterprise) => enterprise.id === state.selectedEnterpriseId)!;
  const profile = getEnterprise(selected.id);
  const allocationTotal = state.enterprises.reduce((sum, enterprise) => sum + enterprise.allocation, 0);

  if (state.phase === 'briefing') {
    return <>
      <PanelHeading index="01" kicker="DECISION CONTEXT">进入历史决策时点</PanelHeading>
      <p className="panel-intro">{stages[state.stageIndex].date}，合肥需要在财政安全、产业机会和未来承诺之间作出取舍。你只能使用当时已经公开的信息。</p>
      <div className="stat-grid">
        <FramedCard as="article"><small>本轮可用财政</small><b>{state.roundFiscalStart} 点</b></FramedCard>
        <FramedCard as="article"><small>竞争项目</small><b>3 家匿名企业</b></FramedCard>
        <FramedCard as="article"><small>阶段任务</small><b>{stages[state.stageIndex].code} · 产业底座</b></FramedCard>
        <FramedCard as="article" className="warning" tone="alert"><small>市场周期</small><b>信贷与需求转弱</b></FramedCard>
      </div>
      <FramedCard className="notice"><b>信息截止已生效 · {stages[state.stageIndex].cutoff}</b><span>真实企业名称、截止日后披露和最终结果均被隔离，只在终局历史对照中揭示。</span></FramedCard>
      <ActionButton onClick={() => setState((current) => enterApplications(current))}>接收匿名项目申请</ActionButton>
    </>;
  }

  if (state.phase === 'applications') {
    return <>
      <PanelHeading index="02" kicker="COMPETING PROJECTS">比较匿名项目申请</PanelHeading>
      <EnterpriseTabs state={state} setState={setState} />
      <FramedCard as="section" className="enterprise-profile">
        <div className="profile-title"><span>{selected.code}</span><div><small>ANONYMOUS PROJECT</small><h3>{profile.alias}</h3></div><em>资金请求 {profile.request} 点</em></div>
        <p>{profile.background}</p>
        <dl>
          <div><dt>产品与市场</dt><dd>{profile.product}</dd></div>
          <div><dt>技术成熟度</dt><dd>{profile.technology}</dd></div>
          <div><dt>财务状态</dt><dd>{profile.finance}</dd></div>
          <div><dt>执行能力</dt><dd>{profile.execution}</dd></div>
          <div><dt>项目规模</dt><dd>{profile.investment} · {profile.cycle}</dd></div>
          <div><dt>证据状态</dt><dd>{profile.evidenceStatus}</dd></div>
          <div><dt>当前数据缺口</dt><dd>{profile.dataGap}</dd></div>
        </dl>
        <div className="request-tools">{profile.requestedTools.map((tool) => <span key={tool}>{supportToolLabels[tool]}</span>)}</div>
      </FramedCard>
      <button className="inline-meeting-action" onClick={() => onStartMeeting(selected.id)}>与企业 {selected.code} 核验关键命题 →</button>
      <FramedCard className="notice amber" tone="amber"><b>机会成本</b><span>三家合计请求 {enterpriseProfiles.reduce((sum, item) => sum + item.request, 0)} 点，本轮可用 {state.roundFiscalStart} 点。支持一家，会减少其他项目及未来阶段的财政空间。</span></FramedCard>
      <ActionButton onClick={() => setState((current) => openAnalysis(current))}>查看四部门联席摘要</ActionButton>
    </>;
  }

  if (state.phase === 'analysis') {
    const reports = agentReports[selected.id];
    const summary = jointReviewSummaries[selected.id];
    return <>
      <PanelHeading index="03" kicker="JOINT REVIEW">查看部门联席研判</PanelHeading>
      <EnterpriseTabs state={state} setState={setState} />
      <FramedCard className="joint-summary" tone="amber">
        <dl>
          <div><dt>共同判断</dt><dd>{summary.consensus}</dd></div>
          <div><dt>最大分歧</dt><dd>{summary.disagreement}</dd></div>
          <div><dt>关键未穿透项</dt><dd>{summary.unresolved}</dd></div>
          <div><dt>建议动作</dt><dd>{summary.recommendation}</dd></div>
        </dl>
      </FramedCard>
      <details className="department-details">
        <summary>展开四部门独立初审</summary>
        <div className="agent-list">
          {(Object.keys(agentLabels) as Array<keyof typeof agentLabels>).map((key) => (
            <FramedCard as="article" key={key}>
              <i>{agentLabels[key][0]}</i>
              <div><div><b>{agentLabels[key]}</b><em>{reports[key].stance}</em></div><p>{reports[key].text}</p></div>
            </FramedCard>
          ))}
        </div>
      </details>
      <button className="inline-meeting-action" onClick={() => onStartMeeting(selected.id)}>向企业 {selected.code} 追问关键未穿透项 →</button>
      <FramedCard className="notice"><b>当前为联席研判基础版。</b><span>已展示四部门独立初审与争议摘要；部门定向质询、立场变化和少数意见尚未接入，不模拟真实历史会议原话。</span></FramedCard>
      <ActionButton onClick={() => setState((current) => openAllocation(current))}>形成政府条件单</ActionButton>
    </>;
  }

  if (state.phase === 'allocation') {
    const remaining = state.roundFiscalStart - allocationTotal;
    const missingTools = state.enterprises.some((enterprise) => enterprise.allocation > 0 && enterprise.supportTools.length === 0);
    const canSubmit = allocationTotal > 0 && remaining >= 0 && !missingTools;
    return <>
      <PanelHeading index="04" kicker="GOVERNMENT TERM SHEET">提交政府条件单</PanelHeading>
      <EnterpriseTabs state={state} setState={setState} />
      <div className="allocation-summary">
        <FramedCard><small>已配置政府投入</small><strong>{allocationTotal}</strong></FramedCard>
        <FramedCard tone={remaining < 15 ? 'alert' : 'default'}><small>本轮可用余额</small><strong className={remaining < 15 ? 'warning-text' : ''}>{remaining}</strong></FramedCard>
      </div>
      <label className="allocation-slider">
        <div><span>{profile.alias} · 资金请求 {profile.request}</span><b>政府投入 {selected.allocation} 点</b></div>
        <input
          type="range"
          min="0"
          max="60"
          value={selected.allocation}
          onChange={(event) => setState((current) => updateAllocation(current, selected.id, Number(event.target.value)))}
        />
      </label>
      <div className="allocation-actions" aria-label={`${selected.code} 企业点数快捷调整`}>
        <button
          aria-label={`${selected.code} 企业减少 5 点`}
          onClick={() => setState((current) => updateAllocation(current, selected.id, selected.allocation - 5))}
        >− 5</button>
        <button
          aria-label={`${selected.code} 企业增加 5 点`}
          onClick={() => setState((current) => updateAllocation(current, selected.id, selected.allocation + 5))}
        >＋ 5</button>
        <button
          aria-label={`${selected.code} 企业按申请额度配置`}
          onClick={() => setState((current) => updateAllocation(current, selected.id, profile.request))}
        >按请求额度</button>
      </div>
      <div className="allocation-ledger">
        {state.enterprises.map((enterprise) => (
          <button key={enterprise.id} onClick={() => setState((current) => selectEnterprise(current, enterprise.id))}>
            <span>{enterprise.code} · {getEnterprise(enterprise.id).industry}</span><b>{enterprise.allocation}</b>
            <i style={{ width: `${enterprise.allocation}%` }} />
          </button>
        ))}
      </div>
      <SectionLabel>城市支持 · 每家最多三项</SectionLabel>
      <div className="support-tools">
        {(Object.keys(supportToolLabels) as SupportTool[]).map((tool) => (
          <button
            key={tool}
            className={selected.supportTools.includes(tool) ? 'selected' : ''}
            disabled={!selected.supportTools.includes(tool) && selected.supportTools.length >= 3}
            onClick={() => setState((current) => toggleSupportTool(current, selected.id, tool))}
          >
            {selected.supportTools.includes(tool) ? '✓ ' : '+ '}{supportToolLabels[tool]}
          </button>
        ))}
      </div>
      {!canSubmit && <p className="validation-note">{allocationTotal === 0 ? '至少为一个项目配置政府投入。' : '获得政府投入的项目必须配置至少一种城市支持。'}</p>}
      <button className="inline-meeting-action" onClick={() => onStartMeeting(selected.id)}>核验企业回应或查看一次性反提案 →</button>
      <ActionButton disabled={!canSubmit} onClick={() => setState((current) => submitDecision(current))}>确认本轮政府动作</ActionButton>
    </>;
  }

  if (state.phase === 'response') {
    return <>
      <PanelHeading index="05" kicker="ENTERPRISE INTENT">企业形成自主行动</PanelHeading>
      <p className="panel-intro">企业 Agent 根据可见事实、获得的资源和自身判断选择行动意图；实际完成程度仍由确定性规则引擎结算。</p>
      <div className="response-list">
        {state.enterprises.map((enterprise) => (
          <FramedCard as="article" key={enterprise.id}>
            <span>{enterprise.code}</span>
            <div><small>{getEnterprise(enterprise.id).industry} · 政府投入 {enterprise.allocation} 点</small><b>{enterprise.action}</b><p>{enterprise.actionReason}</p></div>
          </FramedCard>
        ))}
      </div>
      <FramedCard className="notice amber" tone="amber"><b>未获支持不等于静止。</b><span>企业仍会融资、收缩、等待、迁移或错过窗口，不会被系统冻结。</span></FramedCard>
      <ActionButton onClick={() => setState((current) => revealEvent(current))}>进入历史事件与统一结算</ActionButton>
    </>;
  }

  if (state.phase === 'settlement') {
    return <>
      <PanelHeading index="06" kicker="DETERMINISTIC SETTLEMENT">历史事件进入统一结算</PanelHeading>
      <FramedCard className="historical-event" tone="alert">
        <small>{stages[state.stageIndex].code} · 已发生的历史事件</small>
        <h3>{state.event?.title}</h3>
        <p>{state.event?.description}</p>
        <div>{state.event?.effects.map((effect) => <span key={effect}>{effect}</span>)}</div>
      </FramedCard>
      <FramedCard className="equation-card">
        <span>上一阶段状态</span><i>＋</i><span>政府结构化动作</span><i>＋</i><span>企业行动意图</span><i>＋</i><span>历史事件与产业协同</span><strong>确定性规则引擎生成下一阶段状态</strong>
      </FramedCard>
      <ActionButton tone="danger" onClick={() => setState((current) => settleRound(current))}>确认并执行统一结算</ActionButton>
    </>;
  }

  if (state.phase === 'feedback') {
    return <>
      <PanelHeading index="07" kicker="STATE TRANSITION">查看企业、财政与城市变化</PanelHeading>
      <div className="feedback-list">
        {state.enterprises.map((enterprise) => {
          const previous = enterprise.previousMetrics!;
          const progressDelta = enterprise.metrics.progress - previous.progress;
          const riskDelta = enterprise.metrics.risk - previous.risk;
          return (
            <FramedCard as="article" key={enterprise.id}>
              <div><b>{enterprise.code} · {getEnterprise(enterprise.id).industry}</b><span>{enterprise.action}</span></div>
              <dl>
                <div><dt>建设进度</dt><dd>{enterprise.metrics.progress}<em className={progressDelta >= 0 ? 'up' : 'down'}>{progressDelta >= 0 ? '+' : ''}{progressDelta}</em></dd></div>
                <div><dt>现金</dt><dd>{enterprise.metrics.cash}</dd></div>
                <div><dt>技术</dt><dd>{enterprise.metrics.technology}</dd></div>
                <div><dt>风险</dt><dd>{enterprise.metrics.risk}<em className={riskDelta <= 0 ? 'up' : 'down'}>{riskDelta >= 0 ? '+' : ''}{riskDelta}</em></dd></div>
              </dl>
            </FramedCard>
          );
        })}
      </div>
      <FramedCard className="notice"><b>本轮结果将冻结为下一阶段 Context。</b><span>企业状态、财政承诺和城市产业资产持续累积；早期选择既可能形成协同，也可能锁定未来财政。</span></FramedCard>
      <ActionButton onClick={() => setState((current) => continueSimulation(current))}>{state.stageIndex < stages.length - 1 ? '进入下一决策阶段' : '进入终局历史对照'}</ActionButton>
    </>;
  }

  return <>
    <PanelHeading index="08" kicker="HISTORICAL REPLAY">查看历史路径与关键分叉</PanelHeading>
    <p className="panel-intro">终局不判断你是否“押中答案”，而是解释政府动作如何改变企业变量，并进一步改变城市路径。</p>
    <div className="reveal-list">
      {state.enterprises.map((enterprise) => {
        const company = getEnterprise(enterprise.id);
        return <FramedCard as="article" key={enterprise.id}><span>{enterprise.code}</span><div><small>{company.alias}</small><b>{company.reveal}</b><p>最终建设 {enterprise.metrics.progress} · 技术 {enterprise.metrics.technology} · 风险 {enterprise.metrics.risk}</p></div></FramedCard>;
      })}
    </div>
    <FramedCard className="path-summary" tone="amber"><small>用户决策世界线 · 基础版</small><b>财政余度 {state.resources.fiscal} · 产业基础 {state.resources.industry}</b><p>当前已展示原型揭示与状态因果链；历史关键决策路径、关键命题复盘和信息泄漏审计将在校准数据接入后展开。</p></FramedCard>
    <ActionButton tone="secondary" onClick={onRestart}>以新的政府方案重新推演</ActionButton>
  </>;
}

export default App;
