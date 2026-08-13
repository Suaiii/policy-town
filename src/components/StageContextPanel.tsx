import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getContextMetricValues, getFiscalContextSnapshot, stageContexts, type ContextMetricKey } from '../game/stageContext';
import { stages } from '../game/scenario';
import type { SimulationState } from '../game/types';
import { ActionButton, FramedCard, PanelHeading, SectionLabel } from './ui/ParlorUI';

type ContextStep = 1 | 2 | 3;

const metricOrder: ContextMetricKey[] = ['industry', 'supplyChain', 'talent', 'publicValue'];

export function StageContextPanel({ state, onComplete }: { state: SimulationState; onComplete: () => void }) {
  const [step, setStep] = useState<ContextStep>(1);
  const [selectedMetric, setSelectedMetric] = useState<ContextMetricKey>('industry');
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const stage = stages[state.stageIndex];
  const context = stageContexts[state.stageIndex];
  const metricValues = getContextMetricValues(state);
  const fiscal = getFiscalContextSnapshot(state);
  const evidence = useMemo(() => context.evidence.find((item) => item.id === evidenceId), [context.evidence, evidenceId]);
  const selectedMetricNote = context.metricNotes[selectedMetric];
  const priorSnapshot = state.stageSnapshots.at(-1);

  return <>
    <PanelHeading index={`2.${step}`} kicker="STAGE CONTEXT">
      {step === 1 ? '确认阶段任务' : step === 2 ? '审视城市现状' : '锁定资源与约束'}
    </PanelHeading>

    <ol className="context-stepper" aria-label="P02 阶段流程">
      {(['阶段入场', '城市现状', '资源约束'] as const).map((label, index) => {
        const itemStep = (index + 1) as ContextStep;
        return <li key={label} className={itemStep === step ? 'active' : itemStep < step ? 'done' : ''}>
          <span>{itemStep < step ? '✓' : itemStep}</span><small>{label}</small>
        </li>;
      })}
    </ol>

    {step === 1 && <section className="context-section">
      <div className="stage-entry-hero">
        <small>{stage.code} · {stage.date}</small>
        <h3>{stage.label}</h3>
        <p>{context.coreConflict}</p>
      </div>
      <dl className="context-brief-list">
        <div><dt>阶段任务</dt><dd>{stage.action}</dd></div>
        <div><dt>历史窗口</dt><dd>{stage.event}</dd></div>
        <div><dt>信息截止</dt><dd>{stage.cutoff}</dd></div>
      </dl>
      {priorSnapshot && <FramedCard className="context-prior-summary" tone="amber">
        <small>上阶段摘要 · {priorSnapshot.stageCode}</small>
        <b>{priorSnapshot.enterprises.filter((item) => item.lifecycle === 'active').length} 个项目仍处于有效推进路径</b>
        <span>承诺 {priorSnapshot.commitments.length} 项 · 快照 {priorSnapshot.decisionId}</span>
      </FramedCard>}
      {!priorSnapshot && <FramedCard className="context-prior-summary"><small>上阶段摘要</small><b>S1 无上阶段决策记录</b><span>城市状态以冻结初始快照进入。</span></FramedCard>}
      <FramedCard className="context-boundary-notice">
        <b>信息截止已生效 · {stage.cutoff}</b>
        <span>未来结果、真实企业原型与截止日后证据均已隔离。</span>
      </FramedCard>
      <ActionButton onClick={() => setStep(2)}>查看本轮局势</ActionButton>
    </section>}

    {step === 2 && <section className="context-section">
      <p className="panel-intro">切换四项城市指标查看阶段初始快照。所有数值均来自已锁定的 Context，不在界面端重新计算。</p>
      <div className="context-metric-tabs" role="tablist" aria-label="城市指标">
        {metricOrder.map((key) => <button
          key={key}
          type="button"
          role="tab"
          aria-selected={selectedMetric === key}
          className={selectedMetric === key ? 'active' : ''}
          onClick={() => setSelectedMetric(key)}
        >
          <small>{context.metricNotes[key].label}</small><b>{Math.round(metricValues[key])}</b>
        </button>)}
      </div>
      <FramedCard className="metric-focus-card">
        <div><span>{selectedMetricNote.label}</span><strong>{Math.round(metricValues[selectedMetric])}<small>/ 100</small></strong></div>
        <i><span style={{ width: `${metricValues[selectedMetric]}%` }} /></i>
        <p>{selectedMetricNote.summary}</p>
        <button type="button" onClick={() => setEvidenceId(selectedMetricNote.evidenceId)}>查看数据来源 · {selectedMetricNote.evidenceId} ↗</button>
      </FramedCard>
      <SectionLabel>市场周期与已生效政策</SectionLabel>
      <FramedCard className="market-cycle-card" tone="amber">
        <small>CURRENT MARKET CYCLE</small><b>{context.marketCycle}</b><p>{context.marketSignal}</p>
      </FramedCard>
      <div className="context-policy-list">
        {context.policies.map((policy) => <button key={policy.evidenceId} type="button" onClick={() => setEvidenceId(policy.evidenceId)}>
          <span>已生效 · {policy.effectiveAt}</span><b>{policy.title}</b><small>来源 {policy.evidenceId} ↗</small>
        </button>)}
      </div>
      <div className="context-nav-actions"><button type="button" onClick={() => setStep(1)}>返回</button><ActionButton onClick={() => setStep(3)}>继续</ActionButton></div>
    </section>}

    {step === 3 && <section className="context-section">
      <p className="panel-intro">财政池快照已由规则引擎生成。本页仅呈现锁定结果与计算口径。</p>
      <FramedCard className="fiscal-lock-card" tone="amber">
        <div><small>FINAL AVAILABLE POINTS</small><span>规则引擎快照</span></div>
        <strong>{fiscal.finalAvailable}<small> 点</small></strong>
        <p>快照编号 · {fiscal.snapshotId}</p>
      </FramedCard>
      <details className="fiscal-formula" open>
        <summary>展开计算口径 <span>已校验财政守恒</span></summary>
        <dl>
          <div><dt>阶段新增财力</dt><dd>+ {fiscal.stageAdded}</dd></div>
          <div><dt>上轮可用余额</dt><dd>+ {fiscal.previousBalance}</dd></div>
          <div><dt>退出回收</dt><dd>+ {fiscal.exitRecovery}</dd></div>
          <div className="reference"><dt>已承诺资本</dt><dd>{fiscal.committedCapital} <small>存量跟踪</small></dd></div>
          <div><dt>本轮维护成本</dt><dd>− {fiscal.maintenanceCost}</dd></div>
          <div className="total"><dt>最终可用点数</dt><dd>{fiscal.finalAvailable}</dd></div>
        </dl>
      </details>
      <FramedCard className="context-risk-card" tone="alert"><small>本轮约束提醒</small><b>{context.riskWarning}</b></FramedCard>
      {state.commitments.length > 0 && <div className="context-commitments">
        <SectionLabel>承诺占用</SectionLabel>
        {state.commitments.slice(-3).map((commitment) => <div key={commitment.id}><span>{commitment.stageCode} · {commitment.status}</span><b>{commitment.promise}</b></div>)}
      </div>}
      <div className="context-nav-actions"><button type="button" onClick={() => setStep(2)}>返回</button><ActionButton onClick={onComplete}>查看项目申请</ActionButton></div>
    </section>}

    {evidence && createPortal(<div className="context-evidence-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEvidenceId(null); }}>
      <aside className="context-evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="context-evidence-title">
        <button type="button" className="context-evidence-close" aria-label="关闭来源" onClick={() => setEvidenceId(null)}>×</button>
        <small>EVIDENCE DRAWER · PLAYER VIEW</small>
        <h3 id="context-evidence-title">{evidence.title}</h3>
        <dl>
          <div><dt>证据编号</dt><dd>{evidence.id}</dd></div>
          <div><dt>来源</dt><dd>{evidence.source}</dd></div>
          <div><dt>最早可知日</dt><dd>{evidence.publishedAt}</dd></div>
          <div><dt>信息截止日</dt><dd>{stage.cutoff}</dd></div>
          <div><dt>质量等级</dt><dd>{evidence.grade}</dd></div>
          <div><dt>可见性</dt><dd className="visible">截止日前可见</dd></div>
        </dl>
        <p>{evidence.note}</p>
        <div className="evidence-boundary-stamp">未来材料已过滤 · {stage.cutoff}</div>
      </aside>
    </div>, document.body)}
  </>;
}
