import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GlassTabs, GlassTabsList, GlassTabsTrigger } from '@mawtech/glass-ui';
import { createFullCityDemoSnapshot } from './map/tableDemoState';
import { emptyNegotiationRecord, NegotiationOverlay } from './components/NegotiationOverlay';
import type { NegotiationRecord } from './components/NegotiationOverlay';
import { RelationNetwork } from './components/RelationNetwork';
import { TableScene } from './components/TableScene';
import { AnnouncementOverlay } from './components/AnnouncementOverlay';
import { ResourceGauge } from './components/ResourceGauge';
import { StageContextPanel } from './components/StageContextPanel';
import { ActionButton, FrameCorners, FramedCard, FramedPanel, PanelHeading, SectionLabel } from './components/ui/ParlorUI';
import { ENTERPRISE_ARCHETYPES, simulationToMapSnapshot } from './integration/mapAdapter';
import { appendSandboxEvent, fetchFirmRequests, fetchFirmResponses, fetchGovReview, type AgentHealth } from './integration/agentApi';
import { relationshipEventsForTransition } from './integration/relationshipEvents';
import { createDecisionReviewExport } from './game/exportRun';
import { restoreSimulationState } from './game/persistence';
import { MOCK_EVENT_FEED, type MockEventItem } from './game/mockEventFeed';
import { stageContexts } from './game/stageContext';
import { TableMapSurface } from './map/TableMapSurface';
const openingBackgroundUrl = '/assets/hefei-strategy-room-v1.png';
import {
  agentLabels,
  agentReports,
  getEnterprise,
  jointReviewSummaries,
  stages,
  supportToolLabels,
} from './game/scenario';
import {
  applyAgentRequests,
  applyAgentReview,
  continueSimulation,
  enterApplications,
  enterEnterpriseMeeting,
  finalizeNegotiation,
  initialState,
  openAllocation,
  openAnalysis,
  revealEvent,
  selectEnterprise,
  settleRound,
  startSimulation,
  submitDecision,
  toggleSupportTool,
  updateAllocation,
} from './game/simulation';
import type { CameraMode, EnterpriseId, SimulationState, SupportTool } from './game/types';
import { enterpriseThemeStyle } from './theme/enterpriseTheme';
import { BackendDecisionFlow, backendToEnterprise } from './components/BackendDecisionFlow';
import { createBackendRun, fetchBackendHealth, resumeBackendRun, type BackendResult, type BackendStage } from './integration/investmentBackend';

const phaseLabels = {
  setup: '开场选局',
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
  credibility: '组合公共价值',
} as const;

type IntroBeat = 'cover' | 'history' | 'overview' | 'enterprise' | 'handoff';

function IntroExperience({ state, setState, mapCanvas, onMapCanvas, onNewRun, onComplete }: {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
  mapCanvas: HTMLCanvasElement | null;
  onMapCanvas: (canvas: HTMLCanvasElement) => void;
  onNewRun: () => void;
  onComplete: () => void;
}) {
  const [beat, setBeat] = useState<IntroBeat>('cover');
  const [focusIndex, setFocusIndex] = useState(0);
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);
  const [historyDetailsOpen, setHistoryDetailsOpen] = useState(false);
  const hasSavedRun = state.phase !== 'setup';
  const focusEnterprise = state.enterprises[focusIndex];
  const showingScene = beat === 'overview' || beat === 'enterprise' || beat === 'handoff';

  const beginAssignment = () => {
    const randomValues = new Uint32Array(1);
    window.crypto.getRandomValues(randomValues);
    const seed = randomValues[0] || 1;
    onNewRun();
    const freshSetup = {
      ...structuredClone(initialState),
      setupStartStage: selectedStageIndex,
    };
    setState(startSimulation(freshSetup, seed));
    setBeat('overview');
  };

  const continueAssignmentReveal = () => {
    if (beat === 'overview') {
      setFocusIndex(0);
      setBeat('enterprise');
      return;
    }
    if (beat === 'enterprise') {
      if (focusIndex < state.enterprises.length - 1) {
        setFocusIndex((current) => current + 1);
      } else {
        setBeat('handoff');
      }
      return;
    }
    onComplete();
  };

  const skipIntro = () => {
    setBeat('handoff');
  };

  if (!showingScene) {
    const selectedStage = stages[selectedStageIndex];
    return <main className={`opening-screen opening-${beat}`}>
      <img className="opening-background" src={openingBackgroundUrl} alt="政府与企业在会议厅前握手" />
      <div className="opening-vignette" />
      <div className="opening-boundary"><i />真实结果已隔离 · 你是最终决策者</div>
      <section className="opening-copy" aria-live="polite">
        {beat === 'cover' ? <>
          <p className="opening-kicker">HEFEI · INDUSTRIAL DECISION SANDBOX</p>
          <h1>合肥产业投资决策沙盘</h1>
          <p className="opening-lead">坐到政府决策桌前，在当时可知的信息中决定有限资源投向何处。</p>
          <button className="opening-action" onClick={() => setBeat('history')}>进入决策时点 <span>→</span></button>
          {hasSavedRun && <button className="opening-resume" onClick={onComplete}>
            <span>继续上一次推演</span>
            <b>{stages[state.stageIndex].code} · {phaseLabels[state.phase]}</b>
          </button>}
        </> : <>
          <p className="opening-kicker">CHOOSE THE HISTORICAL WINDOW</p>
          <h1>回到决策发生之前</h1>
          <p className="opening-lead">选择一个历史窗口。系统只会载入截止日之前能够获得的材料。</p>
          <div className="opening-stage-switch" aria-label="历史决策起点">
            {stages.map((stage, index) => {
              const selected = selectedStageIndex === index;
              return <button
                className={selected ? 'active' : ''}
                key={stage.code}
                onClick={() => {
                  setSelectedStageIndex(index);
                  setHistoryDetailsOpen(false);
                }}
              >
                <small>{stage.code}</small><strong>{stage.date}</strong><span>{stage.label.split(' · ')[0]}</span>
              </button>;
            })}
          </div>
          <div className="opening-stage-summary-row">
            <div className="opening-stage-inline-summary" style={{ gridColumn: selectedStageIndex + 1 }}>
              <span>本阶段命题</span><b>{selectedStage.action}</b>
              <span>信息截止</span><b>{selectedStage.cutoff}</b>
            </div>
          </div>
          <button className="opening-detail-trigger" onClick={() => setHistoryDetailsOpen(true)}>了解本时期背景 <span>+</span></button>
          <div className="opening-history-actions">
            <button className="opening-action" onClick={beginAssignment}>确认历史时点 <span>→</span></button>
            <button className="opening-back" onClick={() => setBeat('cover')}>返回台面导入</button>
          </div>
        </>}
      </section>
      {beat === 'history' && historyDetailsOpen && <div
        className="stage-background-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) setHistoryDetailsOpen(false);
        }}
      >
        <section className="stage-background-modal" role="dialog" aria-modal="true" aria-labelledby="stage-background-title">
          <button className="stage-background-close" aria-label="关闭时期背景" onClick={() => setHistoryDetailsOpen(false)}>×</button>
          <small>HISTORICAL CONTEXT · {selectedStage.code}</small>
          <h2 id="stage-background-title">{selectedStage.date}<br />{selectedStage.label}</h2>
          <dl>
            <div><dt>时期外部环境</dt><dd>{selectedStage.event}</dd></div>
            <div><dt>政府核心任务</dt><dd>{selectedStage.action}</dd></div>
            <div><dt>信息截止时间</dt><dd>{selectedStage.cutoff}</dd></div>
          </dl>
          <div className="stage-agent-brief" data-agent-slot="stage-background-brief">
            <span>AGENT BACKGROUND BRIEF</span>
            <p>时期背景简报将在 Agent 接入后生成。内容将只使用截止日前可知的政策、产业、财政与市场材料。</p>
          </div>
        </section>
      </div>}
    </main>;
  }

  return <main className={`intro-scene intro-${beat}`}>
    <section className="intro-world" aria-label="随机企业进入决策沙盘">
      <TableScene
        mode="table"
        enterprises={state.enterprises}
        resources={state.resources}
        mapSnapshot={createFullCityDemoSnapshot(state.settlementRevision)}
        mapCanvas={mapCanvas}
        selectedId={focusEnterprise?.id ?? state.selectedEnterpriseId}
        introFocus={beat === 'overview' || beat === 'handoff' ? 'overview' : focusEnterprise?.id}
        introMinimal
        onEnterpriseSelect={() => undefined}
      />
      <TableMapSurface onCanvasReady={onMapCanvas} />
    </section>
    <div className="intro-shade" />
    {beat === 'overview' && <section className="assignment-reveal" aria-live="polite">
      <p>THIS ROUND · RANDOM ASSIGNMENT</p>
      <h2>本轮项目已分配</h2>
      <div className="assignment-sheets">
        {state.enterprises.map((enterprise, index) => {
          const profile = getEnterprise(enterprise.id);
          return <article
            className="enterprise-assignment-sheet"
            key={enterprise.id}
            style={{ ...enterpriseThemeStyle(enterprise.id), '--sheet-index': index } as CSSProperties}
          >
            <small>ANONYMOUS PROJECT · {enterprise.code}</small>
            <strong>{profile.industry}</strong>
            <p>{profile.background}</p>
            <dl><div><dt>申请量级</dt><dd>{profile.request} 点</dd></div><div><dt>主要诉求</dt><dd>{supportToolLabels[profile.requestedTools[0]]}</dd></div></dl>
          </article>;
        })}
      </div>
    </section>}
    {beat === 'enterprise' && focusEnterprise && <section
      className="enterprise-intro-sheet enterprise-ui-theme"
      key={focusEnterprise.id}
      style={enterpriseThemeStyle(focusEnterprise.id)}
    >
      <small>PROJECT {String(focusIndex + 1).padStart(2, '0')} / {String(state.enterprises.length).padStart(2, '0')}</small>
      <h2>企业 {focusEnterprise.code}</h2>
      <strong>{getEnterprise(focusEnterprise.id).industry}</strong>
      <p>{getEnterprise(focusEnterprise.id).background}</p>
      <div><span>资金请求</span><b>{getEnterprise(focusEnterprise.id).request} 点</b></div>
    </section>}
    {beat === 'handoff' && <div className="intro-handoff-message"><span />决策桌已就绪<span /></div>}
    <button
      className="intro-continue"
      key={`intro-continue-${beat}-${focusIndex}`}
      onClick={continueAssignmentReveal}
      aria-label="点击任意部分继续"
    >
      <span>点击任意部分继续</span>
    </button>
    {beat !== 'handoff' && <button className="intro-skip" onClick={skipIntro}>跳过入场</button>}
  </main>;
}

function CurrentStepTrigger({
  phase,
  displayLabel,
  open,
  pinned,
  onOpen,
  onLeave,
  onToggle,
}: {
  phase: keyof typeof phaseLabels;
  displayLabel?: string;
  open: boolean;
  pinned: boolean;
  onOpen: () => void;
  onLeave: () => void;
  onToggle: () => void;
}) {
  const label = displayLabel ?? phaseLabels[phase];
  return (
    <button
      className={`current-step-trigger ${open ? 'active' : ''}`}
      type="button"
      aria-expanded={open}
      aria-controls="decision-timeline-popover"
      aria-label={`当前步骤：${label}，悬浮查看流程，点击${pinned ? '取消固定' : '固定时间线'}`}
      onMouseEnter={onOpen}
      onMouseLeave={onLeave}
      onFocus={onOpen}
      onClick={onToggle}
    >
      <small>CURRENT STEP</small>
      <strong>{label}</strong>
      <span className="timeline-hover-hint"><i aria-hidden="true" />HOVER · 查看完整流程</span>
    </button>
  );
}

function DecisionStageTrigger({ stageIndex, open, pinned, onOpen, onLeave, onToggle }: {
  stageIndex: number;
  open: boolean;
  pinned: boolean;
  onOpen: () => void;
  onLeave: () => void;
  onToggle: () => void;
}) {
  const stage = stages[stageIndex];
  return (
    <button
      className={`decision-stage-trigger ${open ? 'active' : ''}`}
      type="button"
      aria-expanded={open}
      aria-controls="decision-stage-popover"
      aria-label={`当前历史阶段：${stage.code}，${stage.date}，悬浮查看当前阶段背景，点击${pinned ? '取消固定' : '固定阶段卡'}`}
      onMouseEnter={onOpen}
      onMouseLeave={onLeave}
      onFocus={onOpen}
      onClick={onToggle}
    >
      <small>DECISION STAGE</small>
      <strong>{stage.code} · {stage.date}</strong>
      <span className="timeline-hover-hint"><i aria-hidden="true" />HOVER · 查看阶段背景</span>
    </button>
  );
}

function DecisionStagePopover({ stageIndex, fiscalValue, open, pinned, onOpen, onLeave }: {
  stageIndex: number;
  fiscalValue: number;
  open: boolean;
  pinned: boolean;
  onOpen: () => void;
  onLeave: () => void;
}) {
  const stage = stages[stageIndex];
  const [theme, ...detail] = stage.label.split(' · ');
  return (
    <div
      id="decision-stage-popover"
      className={`decision-stage-popover ${open ? 'stage-visible' : ''}`}
      role="dialog"
      aria-label="当前历史阶段背景"
      aria-hidden={!open}
      onMouseEnter={onOpen}
      onMouseLeave={onLeave}
    >
      <div className="stage-context-kicker">
        <span>FROZEN CONTEXT · {stage.code}</span>
        {pinned && <b>已固定</b>}
      </div>
      <div className="stage-context-summary">
        <strong>{stage.date}</strong>
        <h2><span>{theme}</span>{detail.length > 0 && <span>{detail.join(' · ')}</span>}</h2>
        <p>你是政府最终决策者。本轮只呈现截止 {stage.cutoff} 当时可知的信息，未来结果保持隔离。</p>
      </div>
      <div className="stage-context-fiscal">
        <div><span>本轮财政池</span><strong>{fiscalValue}</strong></div>
        <small>支持一个项目，会压缩其他项目与未来阶段空间</small>
      </div>
    </div>
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
      <div className="timeline-caption">
        <div><span>DECISION TIMELINE</span><strong>决策流程</strong></div>
        {pinned && <b>已固定</b>}
      </div>
      <ol className="timeline-list">
        {phaseOrder.map((item, index) => {
          const current = index === activeIndex;
          return <li className={`timeline-node ${current ? 'current' : index < activeIndex ? 'past' : 'future'}`} key={item} aria-current={current ? 'step' : undefined}>
            <span className="timeline-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="timeline-copy">
              <b>{phaseLabels[item]}</b>
              {current && <small>当前步骤</small>}
            </div>
            {index < phaseOrder.length - 1 && <i className="timeline-connector" aria-hidden="true" />}
          </li>;
        })}
      </ol>
    </div>
  );
}

function HistoricalContextCard({
  state,
  className = '',
  attention = false,
  onMouseEnter,
  onMouseLeave,
}: {
  state: SimulationState;
  className?: string;
  attention?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const stage = stages[state.stageIndex];
  const context = stageContexts[state.stageIndex];
  const [stageTheme, ...stageDetail] = stage.label.split(' · ');

  return (
    <FramedPanel
      as="aside"
      disableAnimation
      className={`left-rail layout-notice-rail historical-context-card ${className}`.trim()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {attention && <i className="context-attention-signal" aria-hidden="true" />}
      <div className="eyebrow">FROZEN CONTEXT · {stage.code}</div>
      <h1>
        <span className="context-date">{stage.date}</span>
        <em>
          <span>{stageTheme}</span>
          {stageDetail.length > 0 && <span>{stageDetail.join(' · ')}</span>}
        </em>
      </h1>
      <p>你是政府最终决策者。本轮只呈现截止 {stage.cutoff} 当时可知的信息，未来结果保持隔离。</p>
      {attention && <div className="left-context-stack">
        <div><small>CORE CONFLICT · 核心矛盾</small><b>{context.coreConflict}</b></div>
        <div><small>MARKET CYCLE · 市场周期</small><b>{context.marketCycle}</b></div>
        <div className="risk"><small>RISK SIGNAL · 风险信号</small><b>{context.riskWarning}</b></div>
      </div>}
      <FramedCard className="fiscal-callout" tone="amber">
        <div><span>本轮财政池</span><strong>{state.roundFiscalStart}</strong></div>
        <small>支持一个项目，会压缩其他项目与未来阶段空间</small>
      </FramedCard>
    </FramedPanel>
  );
}

function HistoricalContextTrigger({ state, open, onOpen, onLeave }: {
  state: SimulationState;
  open: boolean;
  onOpen: () => void;
  onLeave: () => void;
}) {
  const stage = stages[state.stageIndex];
  return (
    <button
      type="button"
      className={`historical-context-trigger ${open ? 'active' : ''}`}
      aria-expanded={open}
      aria-controls="historical-context-popover"
      onMouseEnter={onOpen}
      onMouseLeave={onLeave}
      onFocus={onOpen}
      onBlur={onLeave}
      onClick={onOpen}
    >
      <small>FROZEN CONTEXT · {stage.code}</small>
      <strong>{stage.date}</strong>
      <span><i aria-hidden="true" />HOVER · 查看历史背景</span>
    </button>
  );
}

function EventIntelligenceRail({ state }: { state: SimulationState }) {
  const [selectedId, setSelectedId] = useState(MOCK_EVENT_FEED[0].id);
  const [sourceEvent, setSourceEvent] = useState<MockEventItem | null>(null);
  const selectedEvent = MOCK_EVENT_FEED.find((event) => event.id === selectedId) ?? MOCK_EVENT_FEED[0];
  const stage = stages[state.stageIndex];

  return (
    <>
      <FramedPanel as="aside" disableAnimation className="event-intelligence-rail layout-notice-rail">
        <header className="event-rail-heading">
          <div><small>LIVE ANNOUNCE</small><h2>事件追踪</h2></div>
          <span><i aria-hidden="true" />MOCK FEED</span>
        </header>
        <div className="event-information-boundary">
          <span>信息截止已生效</span><b>{stage.cutoff}</b>
        </div>
        <ol className="event-feed-list" aria-label="阶段事件播报">
          {MOCK_EVENT_FEED.map((event, index) => {
            const active = event.id === selectedEvent.id;
            return <li key={event.id} className={`event-feed-item tone-${event.tone} ${active ? 'active' : ''}`}>
              <button type="button" className="event-feed-summary" aria-expanded={active} onClick={() => setSelectedId(event.id)}>
                <span className="event-feed-axis"><i />{index === 0 && <em>LIVE</em>}</span>
                <span className="event-feed-copy">
                  <small><time>{event.time}</time><b>{event.category}</b></small>
                  <strong>{event.headline}</strong>
                </span>
                <span className="event-feed-impact">{event.impact}</span>
              </button>
              {active && <div className="event-feed-detail">
                <p>{event.brief}</p>
                <button type="button" onClick={() => setSourceEvent(event)}>查看来源 · {event.source} ↗</button>
              </div>}
            </li>;
          })}
        </ol>
        <footer className="event-rail-footer"><span>当前聚焦</span><b>{selectedEvent.category} · {selectedEvent.time}</b></footer>
      </FramedPanel>

      {sourceEvent && <div className="context-evidence-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceEvent(null); }}>
        <aside className="context-evidence-drawer event-source-drawer" role="dialog" aria-modal="true" aria-labelledby="event-source-title">
          <button type="button" className="context-evidence-close" aria-label="关闭事件来源" onClick={() => setSourceEvent(null)}>×</button>
          <small>EVENT SOURCE · MOCK DATA</small>
          <h3 id="event-source-title">{sourceEvent.headline}</h3>
          <dl>
            <div><dt>事件编号</dt><dd>{sourceEvent.id}</dd></div>
            <div><dt>来源席位</dt><dd>{sourceEvent.source}</dd></div>
            <div><dt>记录时间</dt><dd>{sourceEvent.time}</dd></div>
            <div><dt>信息截止日</dt><dd>{stage.cutoff}</dd></div>
            <div><dt>影响标签</dt><dd>{sourceEvent.impact}</dd></div>
            <div><dt>可见性</dt><dd className="visible">截止日前可见</dd></div>
          </dl>
          <p>{sourceEvent.brief}</p>
          <div className="evidence-boundary-stamp">排版 Mock · 尚未接入真实事件源</div>
        </aside>
      </div>}
    </>
  );
}

function AgentStatusBadge({ health }: { health: AgentHealth | null }) {
  const status = !health
    ? { tone: 'pending' as const, label: 'Agent 连接中…' }
    : health.bridge !== 'up'
      ? { tone: 'offline' as const, label: 'Agent 离线 · 确定性模式' }
      : health.agent?.stub
        ? { tone: 'stub' as const, label: 'Agent 确定性模式（stub）' }
        : { tone: 'live' as const, label: 'LLM Agent 在线' };
  return (
    <div className={`agent-status-badge ${status.tone}`} title={health?.error ?? (health?.agent ? `model via bridge :${health.agent.port}` : '')}>
      <span className="agent-status-dot" />
      <small>{status.label}</small>
    </div>
  );
}

function App() {
  const [state, setState] = useState<SimulationState>(() => restoreSimulationState(
    window.localStorage.getItem('hefei-sandbox-run-v1'),
  ));
  const [introActive, setIntroActive] = useState(true);
  const [formalUiEntering, setFormalUiEntering] = useState(false);
  const [agentHealth, setAgentHealth] = useState<AgentHealth | null>(null);
  const [backendRun, setBackendRun] = useState<BackendStage | null>(null);
  const [backendCompanyId, setBackendCompanyId] = useState('company_a');
  const [mapCanvas, setMapCanvas] = useState<HTMLCanvasElement | null>(null);
  const [negotiationRecords, setNegotiationRecords] = useState<Record<string, NegotiationRecord>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem('hefei-negotiation-drafts-v1') ?? '{}') as Record<string, NegotiationRecord>;
    } catch {
      return {};
    }
  });
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelinePinned, setTimelinePinned] = useState(false);
  const [stageTimelineOpen, setStageTimelineOpen] = useState(false);
  const [stageTimelinePinned, setStageTimelinePinned] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const timelineCloseTimer = useRef<number | null>(null);
  const previousRelationshipState = useRef(state);
  const stageTimelineCloseTimer = useRef<number | null>(null);
  const contextCloseTimer = useRef<number | null>(null);
  const mapSnapshot = useMemo(() => simulationToMapSnapshot(state), [state]);
  useEffect(() => {
    window.localStorage.setItem('hefei-sandbox-run-v1', JSON.stringify(state));
  }, [state]);
  useEffect(() => {
    if (backendRun) return;
    const before = previousRelationshipState.current;
    previousRelationshipState.current = state;
    const events = relationshipEventsForTransition(before, state, 'sandbox-state-updated');
    if (events.length > 0) void Promise.all(events.map(appendSandboxEvent));
  }, [state, backendRun]);
  useEffect(() => {
    window.localStorage.setItem('hefei-negotiation-drafts-v1', JSON.stringify(negotiationRecords));
  }, [negotiationRecords]);
  useEffect(() => {
    if (!formalUiEntering) return;
    const timer = window.setTimeout(() => setFormalUiEntering(false), 1500);
    return () => window.clearTimeout(timer);
  }, [formalUiEntering]);
  useEffect(() => {
    let cancelled = false;
    const refreshHealth = () => fetchBackendHealth().then((health) => {
      if (!cancelled) setAgentHealth({ bridge: 'up', agent: { ready: true, stub: health.agent_provider !== 'opencode-go', port: 8000 } });
    }).catch(() => { if (!cancelled) setAgentHealth({ bridge: 'down', error: '投资推演后端不可达' }); });
    void refreshHealth();
    const timer = window.setInterval(() => {
      void refreshHealth();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const runId = window.localStorage.getItem('hefei-investment-run-id');
    if (!runId) return;
    resumeBackendRun(runId).then((run) => {
      setBackendRun(run);
      setBackendCompanyId(run.companies[0].company_id);
    }).catch(() => window.localStorage.removeItem('hefei-investment-run-id'));
  }, []);
  const receiveMapCanvas = useCallback((canvas: HTMLCanvasElement) => setMapCanvas(canvas), []);
  const selected = state.enterprises.find((enterprise) => enterprise.id === state.selectedEnterpriseId)!;
  const meetingOpen = state.cameraMode === 'meeting';
  const meetingKey = `${state.stageIndex}:${state.selectedEnterpriseId}`;
  const meetingRecord = negotiationRecords[meetingKey] ?? emptyNegotiationRecord;
  const openTimeline = () => {
    if (timelineCloseTimer.current !== null) window.clearTimeout(timelineCloseTimer.current);
    timelineCloseTimer.current = null;
    setStageTimelineOpen(false);
    setStageTimelinePinned(false);
    setTimelineOpen(true);
  };
  const scheduleTimelineClose = () => {
    if (timelinePinned) return;
    if (timelineCloseTimer.current !== null) window.clearTimeout(timelineCloseTimer.current);
    timelineCloseTimer.current = window.setTimeout(() => setTimelineOpen(false), 420);
  };
  const toggleTimelinePin = () => {
    setTimelinePinned((current) => {
      const next = !current;
      setTimelineOpen(next);
      return next;
    });
  };
  const openStageTimeline = () => {
    if (stageTimelineCloseTimer.current !== null) window.clearTimeout(stageTimelineCloseTimer.current);
    stageTimelineCloseTimer.current = null;
    setTimelineOpen(false);
    setTimelinePinned(false);
    setStageTimelineOpen(true);
  };
  const scheduleStageTimelineClose = () => {
    if (stageTimelinePinned) return;
    if (stageTimelineCloseTimer.current !== null) window.clearTimeout(stageTimelineCloseTimer.current);
    stageTimelineCloseTimer.current = window.setTimeout(() => setStageTimelineOpen(false), 420);
  };
  const toggleStageTimelinePin = () => {
    setStageTimelinePinned((current) => {
      const next = !current;
      setStageTimelineOpen(next);
      return next;
    });
  };
  const openContext = () => {
    if (contextCloseTimer.current !== null) window.clearTimeout(contextCloseTimer.current);
    contextCloseTimer.current = null;
    setContextOpen(true);
  };
  const scheduleContextClose = () => {
    if (contextCloseTimer.current !== null) window.clearTimeout(contextCloseTimer.current);
    contextCloseTimer.current = window.setTimeout(() => setContextOpen(false), 180);
  };
  const chooseEnterprise = (id: EnterpriseId) => {
    if (state.phase === 'briefing') return;
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
    setNegotiationRecords((current) => ({ ...current, [meetingKey]: { ...record, finalized: true } }));
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
      next = finalizeNegotiation(next, next.selectedEnterpriseId, record.conditions);
      return { ...next, cameraMode: 'table' };
    });
  };

  const restart = () => {
    setNegotiationRecords({});
    window.localStorage.removeItem('hefei-sandbox-run-v1');
    window.localStorage.removeItem('hefei-negotiation-drafts-v1');
    window.localStorage.removeItem('hefei-investment-run-id');
    setBackendRun(null);
    setState(initialState);
    setIntroActive(true);
  };

  const exportRun = () => {
    const payload = createDecisionReviewExport(state);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${state.runId}-decision-review.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (introActive) {
    return <IntroExperience
      state={state}
      setState={setState}
      mapCanvas={mapCanvas}
      onMapCanvas={receiveMapCanvas}
      onNewRun={() => {
        setNegotiationRecords({});
        void createBackendRun().then((run) => {
          setBackendRun(run);
          setBackendCompanyId(run.companies[0].company_id);
          window.localStorage.setItem('hefei-investment-run-id', run.run_id);
          setState((current) => ({
            ...current,
            runId: run.run_id,
            setupEnterpriseIds: ['enterprise-a', 'enterprise-b'],
            enterprises: current.enterprises.filter((enterprise) => ['enterprise-a', 'enterprise-b'].includes(enterprise.id)),
            selectedEnterpriseId: 'enterprise-a',
            roundFiscalStart: run.available_budget,
            resources: { ...current.resources, fiscal: run.available_budget },
          }));
        });
      }}
      onComplete={() => {
        setIntroActive(false);
        setFormalUiEntering(true);
        if (backendRun) setState((current) => ({ ...current, phase: 'applications' }));
      }}
    />;
  }

  return (
    <main className={`app-shell ${meetingOpen ? 'is-meeting' : ''} ${formalUiEntering ? 'formal-ui-entering' : ''} ${state.cameraMode === 'relation' ? 'is-relation' : ''}`}>
      {state.cameraMode === 'relation'
        ? <div className="relation-graph-embed"><RelationNetwork active onBackToSandbox={() => setState((current) => ({ ...current, cameraMode: 'table' as const }))} /></div>
        : <section className="world-layer" aria-label="360 度政府产业投资决策空间">
            <TableScene
              mode={state.cameraMode}
              enterprises={state.enterprises}
              resources={state.resources}
              mapSnapshot={mapSnapshot}
              mapCanvas={mapCanvas}
              selectedId={state.selectedEnterpriseId}
              globalFocus={state.phase === 'briefing'}
              onEnterpriseSelect={chooseEnterprise}
            />
            <TableMapSurface onCanvasReady={receiveMapCanvas} />
          </section>}

      <FramedPanel as="header" className="topbar layout-header">
        <div className="brand-block">
          <img className="brand-logo" src="/assets/logo.png" alt="" aria-hidden="true" />
          <div><strong>合肥产业投资决策沙盘</strong><small>HEFEI INDUSTRIAL DECISION SANDBOX</small></div>
        </div>
        <div className="turn-status">
          <span className="live-dot" />
          <div className="header-hover-slot stage-hover-slot">
            <DecisionStageTrigger
              stageIndex={state.stageIndex}
              open={stageTimelineOpen}
              pinned={stageTimelinePinned}
              onOpen={openStageTimeline}
              onLeave={scheduleStageTimelineClose}
              onToggle={toggleStageTimelinePin}
            />
            <DecisionStagePopover
              stageIndex={state.stageIndex}
              fiscalValue={state.roundFiscalStart}
              open={stageTimelineOpen}
              pinned={stageTimelinePinned}
              onOpen={openStageTimeline}
              onLeave={scheduleStageTimelineClose}
            />
          </div>
          <i />
          <div className="header-hover-slot step-hover-slot">
            <CurrentStepTrigger
              phase={state.phase}
              displayLabel={meetingOpen ? '政企关键核验' : undefined}
              open={timelineOpen}
              pinned={timelinePinned}
              onOpen={openTimeline}
              onLeave={scheduleTimelineClose}
              onToggle={toggleTimelinePin}
            />
            <CurrentStepTimeline
              phase={state.phase}
              open={timelineOpen}
              pinned={timelinePinned}
              onOpen={openTimeline}
              onLeave={scheduleTimelineClose}
            />
          </div>
        </div>
        <div className="topbar-actions">
          <div className="information-cutoff-status" title="运行中的 Agent 与界面只能访问截止日前材料">
            <span />
            <div><small>INFORMATION CUTOFF</small><b>已生效 · {stages[state.stageIndex].cutoff}</b></div>
          </div>
          <GlassTabs value={state.cameraMode} onValueChange={(mode) => setState((current) => ({ ...current, cameraMode: mode as CameraMode }))} className="camera-tabs">
            <GlassTabsList className="camera-switch ui-segmented-control" aria-label="镜头切换">
              {([
                ['table', '沙盘'],
                ['meeting', '企业核验'],
                ['panorama', '360°'],
                ['relation', '关系网'],
              ] as Array<[CameraMode, string]>).map(([mode, label]) => (
                <GlassTabsTrigger key={mode} value={mode} className={state.cameraMode === mode ? 'active' : ''}>{label}</GlassTabsTrigger>
              ))}
            </GlassTabsList>
          </GlassTabs>
        </div>
        <AgentStatusBadge health={agentHealth} />
      </FramedPanel>

      {meetingOpen && !backendRun && <NegotiationOverlay
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

      {!meetingOpen && state.phase === 'briefing' && <HistoricalContextCard state={state} attention />}
      {!meetingOpen && state.phase !== 'briefing' && <>
        <HistoricalContextTrigger
          state={state}
          open={contextOpen}
          onOpen={openContext}
          onLeave={scheduleContextClose}
        />
        <div id="historical-context-popover" aria-hidden={!contextOpen}>
          <HistoricalContextCard
            state={state}
            className={`historical-context-popover ${contextOpen ? 'context-visible' : ''}`}
            onMouseEnter={openContext}
            onMouseLeave={scheduleContextClose}
          />
        </div>
        {!backendRun && <EventIntelligenceRail state={state} />}
      </>}

      <FramedPanel as="aside" className="decision-panel layout-operation-panel enterprise-ui-theme" style={enterpriseThemeStyle(selected.id)}>
        {backendRun ? <BackendDecisionFlow
          key={`${backendRun.run_id}:${backendRun.stage_id}`}
          run={backendRun}
          selectedCompanyId={backendCompanyId}
          onSelectedCompany={(companyId) => {
            setBackendCompanyId(companyId);
            setState((current) => selectEnterprise(current, backendToEnterprise(companyId)));
          }}
          onResult={(result: BackendResult) => {
            setState((current) => ({
              ...current,
              phase: 'feedback',
              resources: { ...current.resources, fiscal: result.budget.after },
            }));
          }}
          onPhase={(phase) => setState((current) => ({ ...current, phase }))}
          onNextStage={async () => {
            const next = await resumeBackendRun(backendRun.run_id);
            setBackendRun(next);
            setBackendCompanyId(next.companies[0].company_id);
            setState((current) => ({
              ...current,
              phase: 'applications',
              stageIndex: Math.max(0, ['S1', 'S2', 'S3', 'S4'].indexOf(next.stage_id)),
              roundFiscalStart: next.available_budget,
              resources: { ...current.resources, fiscal: next.available_budget },
              selectedEnterpriseId: backendToEnterprise(next.companies[0].company_id),
            }));
          }}
        /> : <PanelContent state={state} setState={setState} onRestart={restart} onStartMeeting={chooseEnterprise} onExport={exportRun} />}
      </FramedPanel>

      <FramedPanel as="footer" className="resource-bar layout-data-bar">
        {(Object.keys(resourceLabels) as Array<keyof typeof resourceLabels>).map((key) => (
          <div className={`resource ${key === 'fiscal' ? 'resource-primary' : ''}`} key={key}>
            <ResourceGauge value={state.resources[key]} primary={key === 'fiscal'} />
            <div><span>{resourceLabels[key]}</span><b>{Math.round(state.resources[key])}</b></div>
          </div>
        ))}
        <div className="commitment-ledger">
          <small>当前焦点</small>
          <strong>{state.phase === 'briefing' ? '全局 · 城市初始快照' : `${selected.code} · ${getEnterprise(selected.id).industry}`}</strong>
        </div>
      </FramedPanel>

      {state.cameraMode === 'panorama' && <div className="orbit-hint">拖动场景环视 · 滚轮已锁定</div>}

      <AnnouncementOverlay
        open={announcementOpen}
        state={state}
        enterprise={selected}
        onOpen={() => setAnnouncementOpen(true)}
        onClose={() => setAnnouncementOpen(false)}
      />
    </main>
  );
}

function EnterpriseTabs({ state, setState }: {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
}) {
  return (
    <GlassTabs value={state.selectedEnterpriseId} onValueChange={(id) => setState((current) => selectEnterprise(current, id as EnterpriseId))}>
      <GlassTabsList className="enterprise-tabs ui-segmented-control" aria-label="候选企业">
        {state.enterprises.map((enterprise) => {
          const profile = getEnterprise(enterprise.id);
          return (
            <GlassTabsTrigger
              value={enterprise.id}
              className={`enterprise-identity ${state.selectedEnterpriseId === enterprise.id ? 'active' : ''}`}
              style={enterpriseThemeStyle(enterprise.id)}
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

function MemoryCards({ state }: { state: SimulationState }) {
  const fact = state.facts.at(-1);
  const judgment = state.judgments.at(-1);
  const commitment = state.commitments.at(-1);
  return <details className="memory-drawer">
    <summary>事实卡 · 判断卡 · 承诺卡</summary>
    <div className="memory-card-grid">
      <FramedCard as="article"><small>事实卡</small><b>{fact?.title ?? '等待事实进入'}</b><p>{fact?.value ?? '阶段开始后生成可审计事实。'}</p><em>{fact ? `${fact.source} · 可知 ${fact.availableAt} · ${fact.quality} · ${fact.visibility}` : '来源、日期与质量将在入账后显示'}</em></FramedCard>
      <FramedCard as="article"><small>判断卡</small><b>{judgment?.belief ?? '等待结算更新'}</b><p>置信度 {judgment?.confidence ?? 0}%</p><em>{judgment?.changedBecause ? `变化原因：${judgment.changedBecause}` : '等待立场变化记录'}</em></FramedCard>
      <FramedCard as="article"><small>承诺卡</small><b>{commitment?.promise ?? '尚无正式承诺'}</b><p>{commitment?.status ?? '等待条件单确认'}</p><em>{commitment?.trigger ? `触发条件：${commitment.trigger}` : '等待履约触发条件'}</em></FramedCard>
    </div>
  </details>;
}

function PanelContent({ state, setState, onRestart, onStartMeeting, onExport }: {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
  onRestart: () => void;
  onStartMeeting: (id: EnterpriseId) => void;
  onExport: () => void;
}) {
  const selected = state.enterprises.find((enterprise) => enterprise.id === state.selectedEnterpriseId)!;
  const profile = getEnterprise(selected.id);
  const allocationTotal = state.enterprises.reduce((sum, enterprise) => sum + enterprise.allocation, 0);
  const [agentBusy, setAgentBusy] = useState<string | null>(null);

  const agentRequest = state.agentRequests?.[selected.id];

  const runWithAgent = async <T,>(
    task: (current: SimulationState) => Promise<T | null>,
    apply: (current: SimulationState, result: T) => SimulationState,
    fallback: (current: SimulationState) => SimulationState,
    busyLabel: string,
  ) => {
    if (agentBusy) return;
    setAgentBusy(busyLabel);
    try {
      const result = await task(state);
      setState((current) => (result ? apply(current, result) : fallback(current)));
    } catch {
      setState((current) => fallback(current));
    } finally {
      setAgentBusy(null);
    }
  };

  const handleEnterApplications = () => {
    void runWithAgent(
      fetchFirmRequests,
      (current, requests) => applyAgentRequests(enterApplications(current), requests),
      enterApplications,
      'LLM Agent 正在生成企业申请…',
    );
  };

  const handleOpenAnalysis = () => {
    void runWithAgent(
      fetchGovReview,
      (current, review) => applyAgentReview(openAnalysis(current), review),
      openAnalysis,
      'LLM Agent 正在联席研判…',
    );
  };

  const handleSubmitDecision = () => {
    const total = state.enterprises.reduce((sum, enterprise) => sum + enterprise.allocation, 0);
    const missingTools = state.enterprises.some((enterprise) => enterprise.allocation > 0 && enterprise.supportTools.length === 0);
    if (total <= 0 || total > state.roundFiscalStart || missingTools) return;
    void runWithAgent(
      fetchFirmResponses,
      (current, actions) => submitDecision(current, actions),
      submitDecision,
      'LLM Agent 正在形成企业行动…',
    );
  };

  if (state.phase === 'setup') {
    return <>
      <PanelHeading index="00" kicker="SCENARIO INITIALIZING">随机项目分配中</PanelHeading>
      <p className="panel-intro">企业组合由系统一次性分配，不提供手动选择或重抽。</p>
    </>;
  }

  if (state.phase === 'briefing') {
    return <StageContextPanel state={state} onComplete={handleEnterApplications} />;
  }

  if (state.phase === 'applications') {
    return <>
      <PanelHeading index="02" kicker="COMPETING PROJECTS">比较匿名项目申请</PanelHeading>
      <EnterpriseTabs state={state} setState={setState} />
      <FramedCard as="section" className="enterprise-profile">
        <div className="profile-title"><span>{selected.code}</span><div><small>ANONYMOUS PROJECT</small><h3>{profile.alias}</h3></div><em>资金请求 {agentRequest?.amount ?? profile.request} 点</em></div>
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
        <div className="request-tools">{(agentRequest?.tools ?? profile.requestedTools).map((tool) => <span key={tool}>{supportToolLabels[tool]}</span>)}</div>
        {agentRequest && <FramedCard className="agent-reason-card" tone="amber">
          <small>LLM Agent 申请说明 · {agentRequest.source === 'llm' ? '真实模型生成' : '确定性生成'}</small>
          <p>{agentRequest.useOfFunds}</p>
          <p className="agent-reason-text">{agentRequest.reasoning}</p>
        </FramedCard>}
      </FramedCard>
      <button className="inline-meeting-action" onClick={() => onStartMeeting(selected.id)}>与企业 {selected.code} 核验关键命题 →</button>
      <FramedCard className="notice amber" tone="amber"><b>机会成本</b><span>入局项目合计请求 {state.enterprises.reduce((sum, item) => sum + (state.agentRequests?.[item.id]?.amount ?? getEnterprise(item.id).request), 0)} 点，本轮可用 {state.roundFiscalStart} 点。支持一家，会减少其他项目及未来阶段的财政空间。</span></FramedCard>
      <ActionButton onClick={handleOpenAnalysis} disabled={agentBusy !== null}>
        {agentBusy ?? '查看四部门联席摘要'}
      </ActionButton>
    </>;
  }

  if (state.phase === 'analysis') {
    const reports = agentReports[selected.id];
    const summary = jointReviewSummaries[selected.id];
    const llmReview = state.agentReview;
    const review = llmReview ?? summary;
    const departments = llmReview?.departments.length
      ? llmReview.departments
      : (Object.keys(agentLabels) as Array<keyof typeof agentLabels>).map((key) => ({ dept: key, stance: reports[key].stance, text: reports[key].text }));
    return <>
      <PanelHeading index="03" kicker="JOINT REVIEW">查看部门联席研判</PanelHeading>
      <EnterpriseTabs state={state} setState={setState} />
      <FramedCard className="joint-summary" tone="amber">
        <dl>
          <div><dt>共同判断</dt><dd>{review.consensus}</dd></div>
          <div><dt>最大分歧</dt><dd>{review.disagreement}</dd></div>
          <div><dt>关键未穿透项</dt><dd>{review.unresolved}</dd></div>
          <div><dt>建议动作</dt><dd>{review.recommendation}</dd></div>
        </dl>
      </FramedCard>
      {llmReview && <FramedCard className="notice"><b>联席研判由 LLM Agent 生成。</b><span>四部门意见为模型基于本轮申请与台账的初判，仅供决策参考。</span></FramedCard>}
      <details className="department-details">
        <summary>展开四部门独立初审</summary>
        <div className="agent-list">
          {departments.map((report) => (
            <FramedCard as="article" key={report.dept}>
              <i>{agentLabels[report.dept][0]}</i>
              <div><div><b>{agentLabels[report.dept]}</b><em>{report.stance}</em></div><p>{report.text}</p></div>
            </FramedCard>
          ))}
        </div>
      </details>
      <div className="joint-options">
        <FramedCard><small>方案 A · 风险约束</small><b>分期支持并绑定资金、建设和审计里程碑</b></FramedCard>
        <FramedCard><small>方案 B · 保留财政</small><b>暂缓资本投入，仅保留核验与产业协同窗口</b></FramedCard>
      </div>
      <FramedCard className="directed-challenge"><small>定向质询与立场变化</small><b>财政部门 → 经信部门</b><p>追问后续追加上限；经信部门维持产业价值判断，但接受分期投入条件。科技部门保留量产证据不足的少数意见。</p></FramedCard>
      <button className="inline-meeting-action" onClick={() => onStartMeeting(selected.id)}>向企业 {selected.code} 追问关键未穿透项 →</button>
      <MemoryCards state={state} />
      <FramedCard className="notice"><b>当前为联席研判{llmReview ? '（LLM 版）' : '基础版'}。</b><span>已展示四部门独立初审与争议摘要；部门定向质询、立场变化和少数意见尚未接入，不模拟真实历史会议原话。</span></FramedCard>
      <ActionButton onClick={() => setState((current) => openAllocation(current))}>形成政府条件单</ActionButton>
    </>;
  }

  if (state.phase === 'allocation') {
    const remaining = state.roundFiscalStart - allocationTotal;
    const missingTools = state.enterprises.some((enterprise) => enterprise.allocation > 0 && enterprise.supportTools.length === 0);
    const missingFinalTerms = state.enterprises.some((enterprise) => enterprise.allocation > 0 && !enterprise.negotiationFinalized);
    const canSubmit = allocationTotal > 0 && remaining >= 0 && !missingTools && !missingFinalTerms;
    const requestAmount = agentRequest?.amount ?? profile.request;
    return <>
      <PanelHeading index="04" kicker="GOVERNMENT TERM SHEET">提交政府条件单</PanelHeading>
      <EnterpriseTabs state={state} setState={setState} />
      <div className="allocation-summary">
        <FramedCard><small>已配置政府投入</small><strong>{allocationTotal}</strong></FramedCard>
        <FramedCard tone={remaining < 15 ? 'alert' : 'default'}><small>本轮可用余额</small><strong className={remaining < 15 ? 'warning-text' : ''}>{remaining}</strong></FramedCard>
      </div>
      <label className="allocation-slider">
        <div><span>{profile.alias} · 资金请求 {requestAmount}</span><b>政府投入 {selected.allocation} 点</b></div>
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
          onClick={() => setState((current) => updateAllocation(current, selected.id, requestAmount))}
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
      {!canSubmit && <p className="validation-note">{allocationTotal === 0 ? '至少为一个项目配置政府投入。' : missingTools ? '获得政府投入的项目必须配置至少一种城市支持。' : '获得投入的项目必须先完成一次关键核验并确认企业回应。'}</p>}
      <button className="inline-meeting-action" onClick={() => onStartMeeting(selected.id)}>核验企业回应或查看一次性反提案 →</button>
      <ActionButton disabled={!canSubmit || agentBusy !== null} onClick={handleSubmitDecision}>
        {agentBusy ?? '确认本轮政府动作'}
      </ActionButton>
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
              <div className="physical-feedback">规划资产 {enterprise.physicalAssets.assets.length} · 建设增量 {enterprise.physicalAssets.constructionDelta} · 容量未落地 {enterprise.physicalAssets.overflowUnits}</div>
            </FramedCard>
          );
        })}
      </div>
      <MemoryCards state={state} />
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
    <div className="replay-timeline">
      {state.stageSnapshots.map((snapshot) => <FramedCard key={snapshot.decisionId}><small>{snapshot.stageCode}</small><b>财政 {snapshot.resources.fiscal} · 产业 {snapshot.resources.industry}</b><p>{snapshot.contextHash}</p></FramedCard>)}
    </div>
    <FramedCard className="path-summary" tone="amber"><small>用户世界线 × 历史对照</small><b>财政余度 {state.resources.fiscal} · 产业基础 {state.resources.industry}</b><p>方向、时序与机制分别记录；关键分叉来自条件单、承诺兑现和物理资产路径，不使用简单胜负排名。</p></FramedCard>
    <div className="replay-audit-grid">
      <FramedCard><small>关键命题复盘</small><b>{jointReviewSummaries[state.enterprises[0].id].unresolved}</b><p>当时证据、企业回应、你的条件与后来发生的结果已按阶段快照关联。</p></FramedCard>
      <FramedCard><small>信息泄漏审计</small><b>未来证据 0 · 私有 Prompt 0</b><p>导出仅包含玩家可见信息、结构化决策和场景假设标签。</p></FramedCard>
    </div>
    <MemoryCards state={state} />
    <ActionButton onClick={onExport}>导出结构化决策复盘 JSON</ActionButton>
    <ActionButton tone="secondary" onClick={onRestart}>以新的政府方案重新推演</ActionButton>
  </>;
}

export default App;
