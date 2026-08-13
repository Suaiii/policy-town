import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GlassTabs, GlassTabsList, GlassTabsTrigger } from '@mawtech/glass-ui';
import { createFullCityDemoSnapshot } from './map/tableDemoState';
import { emptyNegotiationRecord, NegotiationOverlay } from './components/NegotiationOverlay';
import type { NegotiationRecord } from './components/NegotiationOverlay';
import { TableScene } from './components/TableScene';
import { AnnouncementOverlay } from './components/AnnouncementOverlay';
import { ResourceBar } from './components/ResourceBar';
import { StageContextPanel } from './components/StageContextPanel';
import { ActionButton, FramedCard, FramedPanel, NoticeDetailPopover, PanelHeading, SectionLabel } from './components/ui/ParlorUI';
import { createBackendRun, fetchDeliberation, resumeBackendRun, selectPolicyPackage, type BackendResult, type BackendStage, type Deliberation, type PolicyPackage } from './integration/investmentBackend';
import { clearBackendRunId, readBackendRunId, writeBackendRunId } from './integration/backendRunPersistence';
import { createDecisionReviewExport } from './game/exportRun';
import { restoreInteractiveSimulationState } from './game/persistence';
import { createMockEventFeed, type MockEventItem } from './game/mockEventFeed';
import { createResourceInsights } from './game/resourceInsights';
import { getRoundLoopStepIndex, roundLoopSteps } from './game/roundLoop';
import {
  APPLICATION_DOSSIERS,
  comparisonDimensionLabels,
  getComparisonRows,
  type ComparisonDimension,
} from './game/applicationReview';
import { stageContexts } from './game/stageContext';
import { TableMapSurface } from './map/TableMapSurface';
const openingBackgroundUrl = '/assets/hefei-strategy-room-v1.png';
import {
  getEnterprise,
  jointReviewSummaries,
  stages,
  supportToolLabels,
} from './game/scenario';
import {
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
import type { CameraMode, EnterpriseId, EnterpriseState, SimulationState } from './game/types';
import { enterpriseThemeStyle } from './theme/enterpriseTheme';

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

type IntroBeat = 'cover' | 'history' | 'overview' | 'enterprise' | 'handoff';

function IntroExperience({ state, setState, mapCanvas, onMapCanvas, onNewRun, onComplete, error }: {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
  mapCanvas: HTMLCanvasElement | null;
  onMapCanvas: (canvas: HTMLCanvasElement) => void;
  onNewRun: () => Promise<void>;
  onComplete: () => void;
  error: string;
}) {
  const [beat, setBeat] = useState<IntroBeat>('cover');
  const [focusIndex, setFocusIndex] = useState(0);
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);
  const [historyDetailsOpen, setHistoryDetailsOpen] = useState(false);
  const hasSavedRun = state.phase !== 'setup';
  const focusEnterprise = state.enterprises[focusIndex];
  const showingScene = beat === 'overview' || beat === 'enterprise' || beat === 'handoff';

  const beginAssignment = async () => {
    const randomValues = new Uint32Array(1);
    window.crypto.getRandomValues(randomValues);
    const seed = randomValues[0] || 1;
    await onNewRun();
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
          {error && <p className="opening-resume-error" role="alert">{error}</p>}
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
    <section className="intro-world" aria-label="固定双企业进入决策沙盘">
      <TableScene
        mode="table"
        enterprises={state.enterprises}
        resources={state.resources}
        mapSnapshot={createFullCityDemoSnapshot(state.settlementRevision)}
        mapCanvas={mapCanvas}
        selectedId={focusEnterprise?.id ?? state.selectedEnterpriseId}
        introFocus={beat === 'handoff' ? 'handoff' : beat === 'overview' ? 'overview' : focusEnterprise?.id}
        introMinimal
        onEnterpriseSelect={() => undefined}
      />
      <TableMapSurface onCanvasReady={onMapCanvas} />
    </section>
    <div className="intro-shade" />
    {beat === 'overview' && <section className="assignment-reveal" aria-live="polite">
      <p>THIS ROUND · FIXED COMPARISON</p>
      <h2>双企业申请已就位</h2>
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
    {beat === 'handoff' && <div className="intro-handoff-message" role="status">
      <span aria-hidden="true" />
      <div><strong>决策桌已就绪</strong><small>Make 合肥 Great Again!</small></div>
      <span aria-hidden="true" />
    </div>}
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
  const activeIndex = getRoundLoopStepIndex(phase);

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
        <div><span>ROUND LOOP</span><strong>本轮闭环</strong></div>
        {pinned && <b>已固定</b>}
      </div>
      <ol className="timeline-list">
        {roundLoopSteps.map((item, index) => {
          const current = index === activeIndex;
          return <li className={`timeline-node ${current ? 'current' : index < activeIndex ? 'past' : 'future'}`} key={item.id} aria-current={current ? 'step' : undefined}>
            <span className="timeline-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="timeline-copy">
              <b>{item.label}</b>
              <small>{current ? `当前 · ${phaseLabels[phase]}` : item.hint}</small>
            </div>
            {index < roundLoopSteps.length - 1 && <i className="timeline-connector" aria-hidden="true" />}
          </li>;
        })}
      </ol>
    </div>
  );
}

function EventIntelligenceRail({ state }: { state: SimulationState }) {
  const eventFeed = useMemo(() => createMockEventFeed(state), [state]);
  const [detailEvent, setDetailEvent] = useState<MockEventItem | null>(null);
  const [feedScrollProgress, setFeedScrollProgress] = useState(0);
  const context = stageContexts[state.stageIndex];
  const toneSymbols: Record<MockEventItem['tone'], string> = {
    policy: '政',
    enterprise: '企',
    city: '城',
    audit: '审',
    media: '媒',
  };

  useEffect(() => {
    if (detailEvent && !eventFeed.some((event) => event.id === detailEvent.id)) setDetailEvent(null);
  }, [detailEvent, eventFeed]);
  useEffect(() => {
    if (!detailEvent) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailEvent(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [detailEvent]);

  return (
    <>
      <FramedPanel as="aside" disableAnimation className="event-intelligence-rail layout-notice-rail">
        <div className="event-rail-head-row">
          <div className="event-panel-heading">
            <PanelHeading variant="notice">阶段播报</PanelHeading>
          </div>
          <span><b>最新</b>{eventFeed.length} 条</span>
        </div>
        <div className="event-feed-scroll-shell">
          <ol
            className="event-feed-list"
            aria-label="阶段事件播报"
            aria-live="polite"
            onScroll={(event) => {
              const list = event.currentTarget;
              const availableScroll = list.scrollHeight - list.clientHeight;
              setFeedScrollProgress(availableScroll > 0 ? list.scrollTop / availableScroll : 0);
            }}
          >
            {eventFeed.map((event) => {
              const active = event.id === detailEvent?.id;
              return <li key={event.id} className={`event-feed-item tone-${event.tone} ${active ? 'active' : ''}`}>
                <button
                  type="button"
                  className="event-feed-summary"
                  aria-haspopup="dialog"
                  aria-expanded={active}
                  onClick={() => setDetailEvent(active ? null : event)}
                >
                  <span className="event-feed-kind" aria-hidden="true">{toneSymbols[event.tone]}</span>
                  <span className="event-feed-copy">
                    <small><b>{event.category}</b><time dateTime={event.logicalTime}>{event.logicalTime}</time></small>
                    <strong>{event.headline}</strong>
                  </span>
                  <span className="event-feed-detail-cta">详情 <i aria-hidden="true">→</i></span>
                </button>
              </li>;
            })}
          </ol>
          <span className="event-feed-scroll-track" aria-hidden="true">
            <i style={{ transform: `translateY(${feedScrollProgress * 96}px)` }} />
          </span>
        </div>

        <FramedCard as="section" className="broadcast-context-anchor" aria-label="当前局势背景">
          <header className="broadcast-context-heading">
            <SectionLabel>背景局势</SectionLabel>
            <span><i aria-hidden="true" />截止已生效</span>
          </header>
          <div className="broadcast-context-primary">
            <small>核心矛盾</small>
            <p>{context.coreConflict}</p>
          </div>
          <dl className="broadcast-context-signals">
            <div><dt>市场周期</dt><dd>{context.marketCycle}</dd></div>
            <div className="risk"><dt>风险信号</dt><dd>{context.riskWarning}</dd></div>
          </dl>
        </FramedCard>
      </FramedPanel>

      {detailEvent && <NoticeDetailPopover
        tone={detailEvent.tone}
        symbol={toneSymbols[detailEvent.tone]}
        eyebrow={<>{detailEvent.category} · {detailEvent.logicalTime}</>}
        title={detailEvent.headline}
        description={detailEvent.brief}
        facts={[
          { label: '影响', value: detailEvent.impact },
          { label: '来源', value: detailEvent.source },
          { label: '证据', value: detailEvent.evidenceIds.join(' · ') },
          { label: '边界', value: `截止 ${detailEvent.cutoffDate} 可见` },
        ]}
        stamp="情景数据 · 非真实媒体或企业事实"
        onClose={() => setDetailEvent(null)}
      />}
    </>
  );
}

function App() {
  const [state, setState] = useState<SimulationState>(() => restoreInteractiveSimulationState(
    window.localStorage.getItem('hefei-sandbox-run-v1'),
  ));
  const [introActive, setIntroActive] = useState(true);
  const [formalUiEntering, setFormalUiEntering] = useState(false);
  const [backendRun, setBackendRun] = useState<BackendStage | null>(null);
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [backendResult, setBackendResult] = useState<BackendResult | null>(null);
  const [backendBusy, setBackendBusy] = useState('');
  const [backendError, setBackendError] = useState('');
  const [stageTransition, setStageTransition] = useState<{ from: number; to: number } | null>(null);
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
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [comparisonDimension, setComparisonDimension] = useState<ComparisonDimension>('overview');
  const timelineCloseTimer = useRef<number | null>(null);
  const stageTimelineCloseTimer = useRef<number | null>(null);
  const mapSnapshot = useMemo(() => createFullCityDemoSnapshot(state.settlementRevision), [state.settlementRevision]);
  const resourceInsights = useMemo(() => createResourceInsights(state), [state]);
  useEffect(() => {
    window.localStorage.setItem('hefei-sandbox-run-v1', JSON.stringify(state));
  }, [state]);
  useEffect(() => {
    window.localStorage.setItem('hefei-negotiation-drafts-v1', JSON.stringify(negotiationRecords));
  }, [negotiationRecords]);
  useEffect(() => {
    if (!formalUiEntering) return;
    const timer = window.setTimeout(() => setFormalUiEntering(false), 1500);
    return () => window.clearTimeout(timer);
  }, [formalUiEntering]);
  const receiveMapCanvas = useCallback((canvas: HTMLCanvasElement) => setMapCanvas(canvas), []);
  const selected = state.enterprises.find((enterprise) => enterprise.id === state.selectedEnterpriseId)!;
  const comparisonPair = useMemo(() => {
    if (state.enterprises.length <= 2) return state.enterprises;
    const selectedIndex = state.enterprises.findIndex((enterprise) => enterprise.id === state.selectedEnterpriseId);
    return selectedIndex <= 1
      ? state.enterprises.slice(0, 2)
      : [state.enterprises[0], state.enterprises[selectedIndex]];
  }, [state.enterprises, state.selectedEnterpriseId]);
  const meetingOpen = state.cameraMode === 'meeting';
  const meetingCameraAvailable = state.phase === 'allocation';
  const meetingKey = `${state.stageIndex}:${state.selectedEnterpriseId}`;
  const meetingRecord = negotiationRecords[meetingKey] ?? emptyNegotiationRecord;
  useEffect(() => {
    if (!meetingCameraAvailable && state.cameraMode === 'meeting') {
      setState((current) => ({ ...current, cameraMode: 'table' }));
    }
  }, [meetingCameraAvailable, state.cameraMode]);
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
  const chooseEnterprise = (id: EnterpriseId) => {
    if (state.phase === 'briefing') return;
    setState((current) => current.phase === 'allocation'
      ? enterEnterpriseMeeting(current, id)
      : selectEnterprise(current, id));
  };

  const closeMeeting = () => {
    setState((current) => ({ ...current, cameraMode: 'table' }));
  };

  const applyNegotiatedOffer = async (record: NegotiationRecord, proposal: PolicyPackage) => {
    if (!backendRun || !deliberation) return;
    setBackendBusy('后端正在校验政策包并结算…');
    setBackendError('');
    try {
      const result = await selectPolicyPackage(backendRun, deliberation.company_id, proposal.proposal_id);
      setBackendResult(result);
      if (state.stageIndex < stages.length - 1) {
        const nextBackendStage = await resumeBackendRun(backendRun.run_id);
        setBackendRun(nextBackendStage);
      }
    } catch (reason) {
      setBackendError(reason instanceof Error ? reason.message : String(reason));
      setBackendBusy('');
      return;
    }
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
      next = submitDecision(next);
      next = revealEvent(next);
      next = settleRound(next);
      return next;
    });
    setBackendBusy('');
  };

  const beginVerification = async (id: EnterpriseId) => {
    if (!backendRun) {
      setBackendError('后端运行尚未就绪，请稍候重试。');
      return;
    }
    setBackendBusy('四部门 Agent 正在独立研判…');
    setBackendError('');
    try {
      setDeliberation(await fetchDeliberation(backendRun, id === 'enterprise-a' ? 'company_a' : 'company_d'));
    } catch (reason) {
      setBackendError(reason instanceof Error ? reason.message : String(reason));
      setBackendBusy('');
      return;
    }
    const key = `${state.stageIndex}:${id}`;
    setNegotiationRecords((current) => ({
      ...current,
      [key]: {
        ...emptyNegotiationRecord,
      },
    }));
    setState((current) => {
      const selectedState = selectEnterprise(current, id);
      const analysisState = selectedState.phase === 'applications' ? openAnalysis(selectedState) : selectedState;
      const allocationState = analysisState.phase === 'analysis' ? openAllocation(analysisState) : analysisState;
      return enterEnterpriseMeeting(allocationState, id);
    });
    setBackendBusy('');
  };

  const restart = () => {
    setNegotiationRecords({});
    setDeliberation(null);
    setBackendResult(null);
    window.localStorage.removeItem('hefei-sandbox-run-v1');
    window.localStorage.removeItem('hefei-negotiation-drafts-v1');
    clearBackendRunId(window.localStorage);
    setBackendRun(null);
    setState(initialState);
    setIntroActive(true);
  };

  const advanceToNextStage = () => {
    if (state.stageIndex >= stages.length - 1) {
      setState((current) => continueSimulation(current));
      return;
    }
    const from = state.stageIndex;
    const to = from + 1;
    setStageTransition({ from, to });
    window.setTimeout(() => {
      setDeliberation(null);
      setBackendResult(null);
      setBackendError('');
      setState((current) => continueSimulation(current));
    }, 900);
    window.setTimeout(() => setStageTransition(null), 2500);
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
        setBackendError('');
        setNegotiationRecords({});
        clearBackendRunId(window.localStorage);
        setBackendRun(null);
        return createBackendRun().then((run) => {
          setBackendRun(run);
          writeBackendRunId(window.localStorage, run.run_id);
        }).catch((reason) => {
          setBackendError(reason instanceof Error ? reason.message : String(reason));
          throw reason;
        });
      }}
      onComplete={() => {
        const savedRunId = readBackendRunId(window.localStorage);
        if (!savedRunId) {
          setBackendError('此旧本地记录没有云端存档，不能安全恢复。请点击“进入决策时点”新建一份可恢复的云端推演。');
          return;
        }
        void resumeBackendRun(savedRunId).then((run) => {
          const stageIndex = Number(run.stage_id.slice(1)) - 1;
          if (stageIndex < state.stageIndex) {
            setBackendError('本地记录与云端存档阶段不匹配，已阻止回退到较早阶段。请新建一份云端推演。');
            return;
          }
          setBackendRun(run);
          writeBackendRunId(window.localStorage, run.run_id);
          setState((current) => ({
            ...current,
            stageIndex: Math.max(0, Math.min(stages.length - 1, stageIndex)),
            phase: 'applications',
            cameraMode: 'table',
          }));
          setIntroActive(false);
          setFormalUiEntering(true);
        }).catch(() => setBackendError('云端存档不可用，未创建新推演。请检查服务器后重试。'));
      }}
      error={backendError}
    />;
  }

  return (
    <main className={`app-shell phase-${state.phase} ${meetingOpen ? 'is-meeting' : ''} ${formalUiEntering ? 'formal-ui-entering' : ''}`}>
      <section className="world-layer" aria-label="360 度政府产业投资决策空间">
        <TableScene
          mode={state.cameraMode}
          enterprises={state.phase === 'analysis' ? [selected] : state.enterprises}
          resources={state.resources}
          resourceInsights={resourceInsights}
          mapSnapshot={mapSnapshot}
          mapCanvas={mapCanvas}
          selectedId={state.selectedEnterpriseId}
          globalFocus={state.phase === 'briefing'}
          comparisonIds={state.phase === 'applications' ? comparisonPair.map((enterprise) => enterprise.id) : undefined}
          onEnterpriseSelect={chooseEnterprise}
        />
        <TableMapSurface onCanvasReady={receiveMapCanvas} />
      </section>

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
          <GlassTabs value={state.cameraMode} onValueChange={(mode) => {
            if (mode === 'meeting' && !meetingCameraAvailable) return;
            setState((current) => ({ ...current, cameraMode: mode as CameraMode }));
          }} className="camera-tabs">
            <GlassTabsList className="camera-switch ui-segmented-control" aria-label="镜头切换">
              {([
                ['table', '沙盘'],
                ['meeting', '企业核验'],
                ['panorama', '360°'],
              ] as Array<[CameraMode, string]>).map(([mode, label]) => (
                <GlassTabsTrigger
                  key={mode}
                  value={mode}
                  disabled={mode === 'meeting' && !meetingCameraAvailable}
                  title={mode === 'meeting' && !meetingCameraAvailable ? '完成部门联席研判后开放' : undefined}
                  className={state.cameraMode === mode ? 'active' : ''}
                >{label}</GlassTabsTrigger>
              ))}
            </GlassTabsList>
          </GlassTabs>
        </div>
      </FramedPanel>

      {meetingOpen && deliberation && <NegotiationOverlay
        enterprise={selected}
        stageLabel={stages[state.stageIndex].date}
        record={meetingRecord}
        deliberation={deliberation}
        result={backendResult}
        busy={backendBusy}
        error={backendError}
        onClose={closeMeeting}
        onApply={applyNegotiatedOffer}
      />}

      {!meetingOpen && state.cameraMode !== 'panorama' && state.phase !== 'applications' && state.phase !== 'analysis' && <EventIntelligenceRail state={state} />}

      {!meetingOpen && state.cameraMode !== 'panorama' && state.phase === 'applications' && <ApplicationComparisonStage
        enterprises={comparisonPair}
        candidates={state.enterprises}
        selectedId={state.selectedEnterpriseId}
        onSelect={chooseEnterprise}
        fiscal={state.roundFiscalStart}
        busy={backendBusy}
        error={backendError}
        onContinue={(id) => void beginVerification(id)}
      />}

      {state.cameraMode !== 'panorama' && state.phase !== 'applications' && <FramedPanel as="aside" className="decision-panel layout-operation-panel enterprise-ui-theme" style={enterpriseThemeStyle(selected.id)}>
        <PanelContent state={state} setState={setState} comparisonDimension={comparisonDimension} onComparisonDimensionChange={setComparisonDimension} onRestart={restart} onStartMeeting={chooseEnterprise} onBeginVerification={beginVerification} onContinueStage={advanceToNextStage} onExport={exportRun} />
      </FramedPanel>}

      {state.cameraMode !== 'panorama' && <FramedPanel as="footer" className="resource-bar layout-data-bar">
        <div className="resource resource-primary">
          <div><span>可用财政点数</span><b>{Math.round(backendRun?.available_budget ?? state.resources.fiscal)}</b></div>
          <ResourceBar value={backendRun?.available_budget ?? state.resources.fiscal} tone="primary" />
        </div>
        <div className="commitment-ledger">
          <small>当前焦点</small>
          <strong>{state.phase === 'briefing' ? '全局 · 城市初始快照' : `${selected.code} · ${getEnterprise(selected.id).industry}`}</strong>
        </div>
      </FramedPanel>}

      {state.cameraMode === 'panorama' && <div className="orbit-hint">拖动场景环视 · 滚轮已锁定</div>}

      {stageTransition && <div className="stage-transition-overlay" role="status" aria-live="assertive">
        <div className="stage-transition-shock" />
        <small>HISTORICAL WINDOW ADVANCING</small>
        <div className="stage-transition-codes"><span>{stages[stageTransition.from].code}</span><i>→</i><strong>{stages[stageTransition.to].code}</strong></div>
        <h1>{stages[stageTransition.to].date}</h1>
        <h2>{stages[stageTransition.to].label}</h2>
        <p>上一轮财政、承诺、企业状态与部门 Memory 已全部继承</p>
      </div>}

      {state.phase !== 'applications' && <AnnouncementOverlay
        open={announcementOpen}
        state={state}
        enterprise={selected}
        onOpen={() => setAnnouncementOpen(true)}
        onClose={() => setAnnouncementOpen(false)}
      />}
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

function ApplicationComparisonStage({ enterprises, candidates, selectedId, onSelect, fiscal, busy, error, onContinue }: {
  enterprises: EnterpriseState[];
  candidates: EnterpriseState[];
  selectedId: EnterpriseId;
  onSelect: (id: EnterpriseId) => void;
  fiscal: number;
  busy: string;
  error: string;
  onContinue: (id: EnterpriseId) => void;
}) {
  const [busyBeat, setBusyBeat] = useState(0);
  const busySteps = [
    ['第一轮', '四部门 Agent 正在分别形成初始判断'],
    ['企业回应', '企业 Agent 正在回应关键核验问题'],
    ['第二轮', '四部门 Agent 正在结合企业回应独立复盘'],
    ['政策编译', '正在汇总约束并生成两个可执行政策包'],
  ] as const;
  useEffect(() => {
    if (!busy) { setBusyBeat(0); return; }
    const timer = window.setInterval(() => setBusyBeat((current) => Math.min(busySteps.length - 1, current + 1)), 6500);
    return () => window.clearInterval(timer);
  }, [busy, busySteps.length]);
  if (enterprises.length < 2) return null;
  const [left, right] = enterprises;
  const leftProfile = getEnterprise(left.id);
  const rightProfile = getEnterprise(right.id);
  const leftDossier = APPLICATION_DOSSIERS[left.id];
  const rightDossier = APPLICATION_DOSSIERS[right.id];
  const rows = [
    {
      label: '申请额度', left: `${leftProfile.request} 点`, right: `${rightProfile.request} 点`,
      leftDetail: leftDossier.resourceBreakdown.map((item) => `${item.label}：${item.value}`).join(' · '),
      rightDetail: rightDossier.resourceBreakdown.map((item) => `${item.label}：${item.value}`).join(' · '),
    },
    {
      label: '财政占比', left: leftDossier.derivedIndicators[0].value, right: rightDossier.derivedIndicators[0].value,
      leftDetail: leftDossier.derivedIndicators[0].basis, rightDetail: rightDossier.derivedIndicators[0].basis,
    },
    {
      label: '资本强度', left: leftDossier.capitalIntensity, right: rightDossier.capitalIntensity,
      leftDetail: leftDossier.market, rightDetail: rightDossier.market,
    },
    {
      label: '交付风险', left: leftDossier.deliveryRisk, right: rightDossier.deliveryRisk,
      leftDetail: leftDossier.milestones.slice(0, 3).join(' → '), rightDetail: rightDossier.milestones.slice(0, 3).join(' → '),
    },
    {
      label: '证据状态', left: leftDossier.evidenceQuality, right: rightDossier.evidenceQuality,
      leftDetail: `${leftDossier.visibleSourceCount} 项来源 · ${leftDossier.knownFacts.map((fact) => fact.label).join('；')}`,
      rightDetail: `${rightDossier.visibleSourceCount} 项来源 · ${rightDossier.knownFacts.map((fact) => fact.label).join('；')}`,
    },
    {
      label: '数据缺口', left: `${leftDossier.dataGaps.length} 项`, right: `${rightDossier.dataGaps.length} 项`,
      leftDetail: leftDossier.dataGaps.join('；'), rightDetail: rightDossier.dataGaps.join('；'),
    },
  ];

  return <section className="application-comparison-stage" aria-label={`企业 ${left.code} 与企业 ${right.code} 申请数据比较`}>
    <header>
      <small>APPLICATION COMPARISON</small>
      <strong>企业申请比较</strong>
      <span>悬浮任一维度查看依据</span>
    </header>
    <div className="comparison-enterprise-heads">
      <button type="button" aria-pressed={selectedId === left.id} className={`enterprise-identity ${selectedId === left.id ? 'selected' : ''}`} style={enterpriseThemeStyle(left.id)} onClick={() => onSelect(left.id)}>
        <span>{left.code}</span><div><small>企业 {left.code}</small><b>{leftProfile.industry}</b></div><strong>{leftProfile.request}<em>点</em></strong>
      </button>
      <i>VS</i>
      <button type="button" aria-pressed={selectedId === right.id} className={`enterprise-identity ${selectedId === right.id ? 'selected' : ''}`} style={enterpriseThemeStyle(right.id)} onClick={() => onSelect(right.id)}>
        <span>{right.code}</span><div><small>企业 {right.code}</small><b>{rightProfile.industry}</b></div><strong>{rightProfile.request}<em>点</em></strong>
      </button>
    </div>
    <div className="comparison-data-rows">
      {rows.map((row) => <div className="comparison-data-row" tabIndex={0} key={row.label}>
        <strong>{row.left}</strong><span>{row.label}</span><strong>{row.right}</strong>
        <aside className="comparison-row-detail" role="tooltip">
          <header><small>MORE INFORMATION</small><b>{row.label} · 对比依据</b></header>
          <div><span>企业 {left.code}</span><p>{row.leftDetail}</p></div>
          <div><span>企业 {right.code}</span><p>{row.rightDetail}</p></div>
        </aside>
      </div>)}
    </div>
    <footer>
      <div className="comparison-request-total"><span>两项申请合计</span><b>{leftProfile.request + rightProfile.request} / {fiscal} 点</b></div>
      {candidates.length > 2 && <div className="comparison-candidate-switch" aria-label="切换比较企业">
        <span>切换比较对象</span>
        {candidates.map((enterprise) => <button
          type="button"
          className={enterprises.some((item) => item.id === enterprise.id) ? 'active' : ''}
          onClick={() => onSelect(enterprise.id)}
          key={enterprise.id}
        >企业 {enterprise.code}</button>)}
      </div>}
      <button disabled={Boolean(busy)} type="button" className="comparison-continue comparison-continue-left enterprise-ui-theme" style={enterpriseThemeStyle(left.id)} onClick={() => onContinue(left.id)}>进入企业 {left.code} 联判 <span>→</span></button>
      <button disabled={Boolean(busy)} type="button" className="comparison-continue comparison-continue-right enterprise-ui-theme" style={enterpriseThemeStyle(right.id)} onClick={() => onContinue(right.id)}>进入企业 {right.code} 联判 <span>→</span></button>
    </footer>
    {error && <div className="comparison-agent-error" role="alert"><b>联判未能启动</b><span>{error}</span></div>}
    {busy && <div className="comparison-agent-loading" role="status" aria-live="polite">
      <div className="agent-loading-orbit"><i /><i /><i /><span>{busyBeat + 1}/4</span></div>
      <small>AGENT DELIBERATION IN PROGRESS</small>
      <h2>{busySteps[busyBeat][0]}</h2>
      <p>{busySteps[busyBeat][1]}</p>
      <ol>{busySteps.map((item, index) => <li className={index < busyBeat ? 'done' : index === busyBeat ? 'active' : ''} key={item[0]}><span>{index < busyBeat ? '✓' : index + 1}</span><b>{item[0]}</b></li>)}</ol>
      <em>真实 Agent 调用通常需要 20–60 秒，请不要重复点击</em>
    </div>}
  </section>;
}

function ApplicationPhasePanel({ state, setState, dimension, onDimensionChange }: {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
  dimension: ComparisonDimension;
  onDimensionChange: (dimension: ComparisonDimension) => void;
}) {
  const [detailId, setDetailId] = useState<EnterpriseId | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const selected = state.enterprises.find((enterprise) => enterprise.id === state.selectedEnterpriseId)!;
  const totalRequest = state.enterprises.reduce((sum, enterprise) => sum + getEnterprise(enterprise.id).request, 0);

  const selectApplication = (id: EnterpriseId) => {
    setState((current) => selectEnterprise(current, id));
  };

  if (detailId) {
    const enterprise = state.enterprises.find((item) => item.id === detailId) ?? selected;
    const profile = getEnterprise(enterprise.id);
    const dossier = APPLICATION_DOSSIERS[enterprise.id];
    return <>
      <PanelHeading index="03" kicker="APPLICATION DOSSIER">企业 {enterprise.code} 申请详情</PanelHeading>
      <div className="application-detail-identity enterprise-identity" style={enterpriseThemeStyle(enterprise.id)}>
        <span>{enterprise.code}</span>
        <div><small>ANONYMOUS PROJECT · 演示情景</small><strong>{profile.industry}</strong></div>
        <b>{profile.request} 点</b>
      </div>
      <p className="panel-intro">仅显示截止 {stages[state.stageIndex].cutoff} 已知的申请材料；真实企业原型与未来结果保持封存。</p>

      <SectionLabel>申请资源构成</SectionLabel>
      <dl className="application-resource-grid">
        {dossier.resourceBreakdown.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
      </dl>
      <div className="request-tools application-support-tools">
        {dossier.citySupport.map((tool) => <span key={tool}>{supportToolLabels[tool]}</span>)}
      </div>

      <SectionLabel>项目里程碑</SectionLabel>
      <ol className="application-milestones">
        {dossier.milestones.map((milestone, index) => <li key={milestone}><span>{String(index + 1).padStart(2, '0')}</span><b>{milestone}</b></li>)}
      </ol>

      <SectionLabel>已知事实与派生指标</SectionLabel>
      <div className="application-evidence-list">
        {dossier.knownFacts.map((fact) => <button type="button" key={fact.evidenceId} onClick={() => setEvidenceId(fact.evidenceId)}>
          <span>已知事实</span><b>{fact.label}</b><small>{fact.evidenceId} ↗</small>
        </button>)}
        {dossier.derivedIndicators.map((indicator) => <div key={indicator.label}>
          <span>规则派生</span><b>{indicator.label} · {indicator.value}</b><small>{indicator.basis}</small>
        </div>)}
      </div>

      <SectionLabel>证据质量与数据缺口</SectionLabel>
      <div className="application-gap-summary">
        <div><small>截止日前可见来源</small><b>{dossier.visibleSourceCount} 项</b><em>{dossier.evidenceQuality}</em></div>
        <ul>{dossier.dataGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        <p><span aria-hidden="true">◇</span> 当时不可知 · 截止日后材料已封存</p>
      </div>

      <ActionButton onClick={() => { setDetailId(null); setEvidenceId(null); }}>返回项目比较</ActionButton>

      {evidenceId && <div className="context-evidence-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEvidenceId(null); }}>
        <aside className="context-evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="application-evidence-title">
          <button type="button" className="context-evidence-close" aria-label="关闭证据详情" onClick={() => setEvidenceId(null)}>×</button>
          <small>APPLICATION EVIDENCE · SCENARIO</small>
          <h3 id="application-evidence-title">截止日前申请材料</h3>
          <dl>
            <div><dt>证据编号</dt><dd>{evidenceId}</dd></div>
            <div><dt>所属对象</dt><dd>企业 {enterprise.code} · {profile.industry}</dd></div>
            <div><dt>信息截止日</dt><dd>{stages[state.stageIndex].cutoff}</dd></div>
            <div><dt>质量等级</dt><dd>SCENARIO</dd></div>
            <div><dt>可见性</dt><dd className="visible">玩家可见</dd></div>
          </dl>
          <p>用于 P03 排版与规则联调的演示情景材料，不代表真实企业事实。</p>
        </aside>
      </div>}
    </>;
  }

  return <>
    <PanelHeading index="02" kicker="APPLICATIONS">企业申请比较</PanelHeading>
    <div className="application-comparison-status">
      <span>{state.enterprises.length} 家匿名项目 · 截止日前材料</span>
      <b>合计申请 {totalRequest} / 财政池 {state.roundFiscalStart}</b>
    </div>
    <div className="application-dimension-tabs" role="tablist" aria-label="项目比较维度">
      {(Object.keys(comparisonDimensionLabels) as ComparisonDimension[]).map((item) => <button
        type="button"
        role="tab"
        aria-selected={dimension === item}
        className={dimension === item ? 'active' : ''}
        key={item}
        onClick={() => onDimensionChange(item)}
      >{comparisonDimensionLabels[item]}</button>)}
    </div>
    <div className="application-comparison-list application-candidate-list" aria-label="匿名企业申请比较">
      {state.enterprises.map((enterprise) => {
        const profile = getEnterprise(enterprise.id);
        const dossier = APPLICATION_DOSSIERS[enterprise.id];
        const active = enterprise.id === state.selectedEnterpriseId;
        return <article
          key={enterprise.id}
          className={`application-compare-card enterprise-identity ${active ? 'active' : ''}`}
          style={enterpriseThemeStyle(enterprise.id)}
        >
          <button type="button" className="application-card-select" aria-pressed={active} onClick={() => selectApplication(enterprise.id)}>
            <header><span>{enterprise.code}</span><div><small>企业 {enterprise.code}</small><strong>{profile.industry}</strong></div><b>{profile.request}<em>点</em></b></header>
            <footer><span>{dossier.evidenceQuality}</span><i>{dossier.visibleSourceCount} 项来源 · {dossier.dataGaps.length} 项缺口</i></footer>
          </button>
          <button type="button" className="application-detail-link" onClick={() => { selectApplication(enterprise.id); setDetailId(enterprise.id); }}>查看申请详情 ↗</button>
        </article>;
      })}
    </div>
    <div className="application-opportunity-cost">
      <small>机会成本</small>
      <p>{totalRequest > state.roundFiscalStart
        ? `全部申请合计 ${totalRequest} 点，超过本轮财政池 ${totalRequest - state.roundFiscalStart} 点。`
        : `全部申请合计 ${totalRequest} 点，若全部满足仍余 ${state.roundFiscalStart - totalRequest} 点，但会压缩未来阶段空间。`} 此处只比较，不形成投入或承诺。</p>
    </div>
    <ActionButton onClick={() => setState((current) => openAnalysis(current))}>继续</ActionButton>
  </>;
}

function PanelContent({ state, setState, comparisonDimension, onComparisonDimensionChange, onRestart, onStartMeeting, onBeginVerification, onContinueStage, onExport }: {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
  comparisonDimension: ComparisonDimension;
  onComparisonDimensionChange: (dimension: ComparisonDimension) => void;
  onRestart: () => void;
  onStartMeeting: (id: EnterpriseId) => void;
  onBeginVerification: (id: EnterpriseId) => void | Promise<void>;
  onContinueStage: () => void;
  onExport: () => void;
}) {
  const selected = state.enterprises.find((enterprise) => enterprise.id === state.selectedEnterpriseId)!;
  const profile = getEnterprise(selected.id);
  const allocationTotal = state.enterprises.reduce((sum, enterprise) => sum + enterprise.allocation, 0);
  const loopStepIndex = getRoundLoopStepIndex(state.phase);

  const loopHeader = state.phase !== 'setup' && <div className="round-loop-strip" aria-label="本轮闭环进度">
    <div><small>ROUND {state.stageIndex + 1}</small><b>本轮只完成一个闭环</b></div>
    <ol>{roundLoopSteps.map((step, index) => <li className={index === loopStepIndex ? 'active' : index < loopStepIndex ? 'done' : ''} key={step.id}>
      <span>{index < loopStepIndex ? '✓' : index + 1}</span><b>{step.label}</b>
    </li>)}</ol>
  </div>;

  if (state.phase === 'setup') {
    return <>
      <PanelHeading index="00" kicker="SCENARIO INITIALIZING">双企业申请载入中</PanelHeading>
      <p className="panel-intro">企业组合由系统一次性分配，不提供手动选择或重抽。</p>
    </>;
  }

  if (state.phase === 'briefing') {
    return <>{loopHeader}<StageContextPanel state={state} onComplete={() => setState((current) => enterApplications(current))} /></>;
  }

  if (state.phase === 'applications') {
    return <>{loopHeader}<ApplicationPhasePanel state={state} setState={setState} dimension={comparisonDimension} onDimensionChange={onComparisonDimensionChange} /></>;
  }

  if (state.phase === 'analysis') {
    return <>{loopHeader}
      <PanelHeading index="1V1" kicker="ENTERPRISE RESPONSE × DEPARTMENT REVIEW">企业回应和部门复盘</PanelHeading>
      <FramedCard className="notice amber" tone="amber"><b>联判仅仅在 1v1 对话框内进行</b><span>四部门先各说一句，向企业核验后再各复盘一句；点击部门发言可查看完整独立判断。</span></FramedCard>
      <ActionButton onClick={() => void onBeginVerification(selected.id)}>进入 1v1 联判</ActionButton>
    </>;
  }

  if (state.phase === 'allocation') {
    return <>{loopHeader}
      <PanelHeading index="05" kicker="PLAYER DECISION">企业核验与最终决策</PanelHeading>
      <FramedCard className="notice amber" tone="amber"><b>本轮锁定企业 {selected.code} · {profile.alias}</b><span>政策参数由核验结果自动形成；玩家只选择方案，不手动修改金额。</span></FramedCard>
      <p className="panel-intro">继续核验会话，查看企业回应和四部门复议。会话末尾选择一个政府方案后，本轮将自动结算并更新沙盘建筑。</p>
      <ActionButton onClick={() => onStartMeeting(selected.id)}>继续企业核验与最终决策</ActionButton>
    </>;
  }

  if (state.phase === 'response') {
    return <>{loopHeader}
      <PanelHeading index="06" kicker="ENTERPRISE INTENT">企业形成自主行动</PanelHeading>
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
    return <>{loopHeader}
      <PanelHeading index="03" kicker="ACTION × SHOCK">企业行动与历史冲击</PanelHeading>
      <p className="panel-intro compact-intro">你的条件单先改变企业行动，随后共同承受本阶段历史冲击。</p>
      <div className="response-list compact-response-list">
        {state.enterprises.map((enterprise) => (
          <FramedCard as="article" key={enterprise.id}>
            <span>{enterprise.code}</span>
            <div><small>投入 {enterprise.allocation} 点 · {enterprise.supportTools.length} 项配套</small><b>{enterprise.action}</b></div>
          </FramedCard>
        ))}
      </div>
      <FramedCard className="historical-event" tone="alert">
        <small>{stages[state.stageIndex].code} · 本轮外部冲击</small>
        <h3>{state.event?.title}</h3>
        <p>{state.event?.description}</p>
        <div>{state.event?.effects.map((effect) => <span key={effect}>{effect}</span>)}</div>
      </FramedCard>
      <ActionButton tone="danger" onClick={() => setState((current) => settleRound(current))}>结算本轮并查看变化</ActionButton>
    </>;
  }

  if (state.phase === 'feedback') {
    const advancingCount = state.enterprises.filter((enterprise) => enterprise.lastSettlementDelta.progress > 0).length;
    const supported = state.enterprises.find((enterprise) => enterprise.allocation > 0);
    const unsupported = state.enterprises.find((enterprise) => enterprise.id !== supported?.id);
    return <>{loopHeader}
      <PanelHeading index="04" kicker="ROUND REVIEW">本轮决策回执</PanelHeading>
      <div className="round-outcome-summary">
        <div><small>本轮投入</small><b>{allocationTotal}</b></div>
        <div><small>推进项目</small><b>{advancingCount}/{state.enterprises.length}</b></div>
        <div><small>财政余额</small><b>{state.resources.fiscal}</b></div>
      </div>
      <div className="feedback-list">
        {state.enterprises.map((enterprise) => {
          const previous = enterprise.previousMetrics!;
          const progressDelta = enterprise.metrics.progress - previous.progress;
          const riskDelta = enterprise.metrics.risk - previous.risk;
          return (
            <FramedCard as="article" key={enterprise.id}>
              <div><b>{enterprise.code} · {getEnterprise(enterprise.id).industry}</b><span>{enterprise.action}</span></div>
              <dl className="feedback-key-deltas">
                <div><dt>建设进度</dt><dd>{enterprise.metrics.progress}<em className={progressDelta >= 0 ? 'up' : 'down'}>{progressDelta >= 0 ? '+' : ''}{progressDelta}</em></dd></div>
                <div><dt>风险</dt><dd>{enterprise.metrics.risk}<em className={riskDelta <= 0 ? 'up' : 'down'}>{riskDelta >= 0 ? '+' : ''}{riskDelta}</em></dd></div>
              </dl>
              <details className="feedback-audit-detail"><summary>查看结算明细</summary><p>现金 {enterprise.metrics.cash} · 技术 {enterprise.metrics.technology} · 规划资产 {enterprise.physicalAssets.assets.length} · 建设增量 {enterprise.physicalAssets.constructionDelta}</p></details>
            </FramedCard>
          );
        })}
      </div>
      <FramedCard className="round-causal-summary" tone="amber">
        <small>WHY THIS RESULT · 本轮关键因果</small>
        <p>
          政府向企业 {supported?.code ?? '—'} 投入 {supported?.allocation ?? 0} 点并附加里程碑条件
          <i>→</i>{supported ? `${getEnterprise(supported.id).industry}项目选择“${supported.action}”` : '没有项目获得支持'}
          <i>→</i>本阶段遭遇“{state.event?.title ?? '外部环境变化'}”
          <i>→</i>{unsupported ? `未获支持的企业 ${unsupported.code} 选择“${unsupported.action}”` : '其他企业状态同步更新'}
          <i>→</i>最终形成 {advancingCount}/{state.enterprises.length} 个推进项目，财政剩余 {state.resources.fiscal} 点。
        </p>
      </FramedCard>
      <FramedCard className="notice"><b>闭环完成，结果已写入下一轮。</b><span>财政、企业状态和城市产业基础都会延续。</span></FramedCard>
      <ActionButton onClick={onContinueStage}>{state.stageIndex < stages.length - 1 ? `推进至 ${stages[state.stageIndex + 1].code} · ${stages[state.stageIndex + 1].date}` : '进入终局历史对照'}</ActionButton>
    </>;
  }

  return <>
    <PanelHeading index="09" kicker="HISTORICAL REPLAY">查看历史路径与关键分叉</PanelHeading>
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
