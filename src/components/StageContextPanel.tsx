import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getContextMetricValues, getFiscalContextSnapshot, stageContexts, type ContextMetricKey } from '../game/stageContext';
import { stages } from '../game/scenario';
import type { SimulationState } from '../game/types';
import { ActionButton, FramedCard } from './ui/ParlorUI';

const metricOrder: ContextMetricKey[] = ['industry', 'supplyChain', 'talent', 'publicValue'];

export function StageContextPanel({ state, onComplete }: { state: SimulationState; onComplete: () => void }) {
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const stage = stages[state.stageIndex];
  const context = stageContexts[state.stageIndex];
  const metricValues = getContextMetricValues(state);
  const fiscal = getFiscalContextSnapshot(state);
  const evidence = useMemo(() => context.evidence.find((item) => item.id === evidenceId), [context.evidence, evidenceId]);
  const priorSnapshot = state.stageSnapshots.at(-1);

  return <>
    <section className="context-section context-one-page">
      <div className="stage-entry-hero">
        <small>01 · ROUND BRIEF · {stage.code} · {stage.date}</small>
        <h2>本轮一页简报</h2>
        <strong>{stage.label}</strong>
        <p>{context.coreConflict}</p>
      </div>

      <div className="round-three-things" aria-label="本轮三项关键信息">
        <article><span>01</span><div><small>这轮要做什么</small><b>{stage.action}</b></div></article>
        <article><span>02</span><div><small>市场正在发生什么</small><b>{context.marketCycle}</b></div></article>
        <article className="risk"><span>03</span><div><small>最需要防什么</small><b>{context.riskWarning}</b></div></article>
      </div>

      <div className="round-capacity-row">
        <FramedCard className="round-fiscal-card" tone="amber">
          <small>本轮可用财政</small><strong>{fiscal.finalAvailable}<em>点</em></strong>
        </FramedCard>
        <div className="round-metric-grid">
          {metricOrder.map((key) => <button key={key} type="button" onClick={() => setEvidenceId(context.metricNotes[key].evidenceId)} title={context.metricNotes[key].summary}>
            <small>{context.metricNotes[key].label}</small><b>{Math.round(metricValues[key])}</b>
          </button>)}
        </div>
      </div>

      {priorSnapshot && <FramedCard className="context-prior-summary" tone="amber">
        <small>上一轮带来的局面 · {priorSnapshot.stageCode}</small>
        <b>{priorSnapshot.enterprises.filter((item) => item.lifecycle === 'active').length} 个项目继续推进 · {priorSnapshot.commitments.length} 项承诺待跟踪</b>
      </FramedCard>}

      <ActionButton onClick={onComplete}>继续</ActionButton>

      <details className="round-brief-details">
        <summary>查看政策依据与财政口径</summary>
        <p>{context.marketSignal}</p>
        <div className="context-policy-list">
          {context.policies.map((policy) => <button key={policy.evidenceId} type="button" onClick={() => setEvidenceId(policy.evidenceId)}>
            <span>已生效 · {policy.effectiveAt}</span><b>{policy.title}</b><small>{policy.evidenceId} ↗</small>
          </button>)}
        </div>
        <p>财政口径：新增 {fiscal.stageAdded} + 上轮余额 {fiscal.previousBalance} − 维护 {fiscal.maintenanceCost} = {fiscal.finalAvailable} 点</p>
        <p>信息截止 {stage.cutoff} · 未来结果与截止日后证据已隔离</p>
      </details>
    </section>

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
