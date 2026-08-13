import { useEffect, useMemo, useRef, useState } from 'react';
import type { BackendResult, Deliberation, DepartmentMemo, PolicyPackage } from '../integration/investmentBackend';
import { getEnterprise } from '../game/scenario';
import type { EnterpriseState, SupportTool } from '../game/types';
import { enterpriseThemeStyle } from '../theme/enterpriseTheme';
import { ActionButton, DirectionalButton, FramedPanel, PanelHeading } from './ui/ParlorUI';

export type NegotiationRecord = {
  fiscalOffer: number;
  tools: SupportTool[];
  conditions: string[];
  submitted: boolean;
  proposalId?: string;
  finalized?: boolean;
};

export const emptyNegotiationRecord: NegotiationRecord = { fiscalOffer: 0, tools: [], conditions: [], submitted: false };

const departmentLabels: Record<string, string> = {
  finance: '财政部门',
  industry_information: '经信部门',
  science_technology: '科技部门',
  development_reform: '发改部门',
};
const departmentMarks: Record<string, string> = {
  finance: '财', industry_information: '经', science_technology: '科', development_reform: '发',
};
const stanceLabels: Record<string, string> = {
  support: '支持', conditional_support: '有条件支持', defer: '暂缓', oppose: '反对',
};

function isUsefulChineseJudgment(value?: string) {
  if (!value) return false;
  const text = value.trim();
  return text.length >= 12
    && /[\u4e00-\u9fff]/.test(text)
    && !/(?:_page|_review)$/i.test(text)
    && !/^(?:详见|参考|参见)/.test(text);
}

function openingJudgment(memo: DepartmentMemo) {
  if (isUsefulChineseJudgment(memo.key_page)) return memo.key_page.trim();
  return `本部门建议${stanceLabels[memo.recommendation]}，当前最需要控制的是${memo.most_important_risk.replace(/[。；;]+$/, '')}。`;
}

function confidencePercent(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function reviewJudgment(memo: DepartmentMemo, reviewText?: string) {
  if (isUsefulChineseJudgment(reviewText)) return reviewText!.trim();
  return `企业回应后，本部门维持“${stanceLabels[memo.recommendation]}”判断，并继续将${memo.most_important_risk}作为执行约束。`;
}

function DepartmentMessage({ memo, reviewText, onOpen }: {
  memo: DepartmentMemo;
  reviewText?: string;
  onOpen: () => void;
}) {
  return <button
    type="button"
    className={`verification-message department department-${memo.department}`}
    onClick={onOpen}
    aria-haspopup="dialog"
  >
    <span className="verification-speaker-mark">{departmentMarks[memo.department]}</span>
    <div>
      <header><b>{departmentLabels[memo.department]}</b><small>{stanceLabels[memo.recommendation]} · 置信度 {confidencePercent(memo.confidence)}%</small></header>
      <p>{reviewText === undefined ? openingJudgment(memo) : reviewJudgment(memo, reviewText)}</p>
      <em className="department-message-hint">点击查看完整研判</em>
    </div>
  </button>;
}

export function NegotiationOverlay({ enterprise, stageLabel, record, deliberation, busy, error, onClose, onApply }: {
  enterprise: EnterpriseState;
  stageLabel: string;
  record: NegotiationRecord;
  deliberation: Deliberation;
  busy?: string;
  error?: string;
  result?: BackendResult | null;
  onClose: () => void;
  onApply: (record: NegotiationRecord, proposal: PolicyPackage) => void;
}) {
  const profile = getEnterprise(enterprise.id);
  const identityStyle = enterpriseThemeStyle(enterprise.id);
  const [step, setStep] = useState<'opening' | 'response' | 'review' | 'packages'>(record.finalized ? 'packages' : 'opening');
  const [detailDepartment, setDetailDepartment] = useState<DepartmentMemo | null>(null);
  const [settlementBeat, setSettlementBeat] = useState(0);
  const [selectedProposalId, setSelectedProposalId] = useState(deliberation.meeting.proposals[0]?.proposal_id ?? '');
  const feedRef = useRef<HTMLDivElement>(null);
  const selectedProposal = deliberation.meeting.proposals.find((item) => item.proposal_id === selectedProposalId)
    ?? deliberation.meeting.proposals[0];
  const reviewByDepartment = useMemo(() => new Map(
    deliberation.department_review_updates.map((item) => [item.department, item]),
  ), [deliberation.department_review_updates]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    if (!detailDepartment) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailDepartment(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [detailDepartment]);
  const settling = Boolean(busy?.includes('校验政策包'));
  const settlementSteps = [
    ['政策包校验', '确认方案属于本轮，企业和阶段一致'],
    ['财政与条件校验', '核对可用财政、分期总额、里程碑和退出条件'],
    ['企业行动生成', '企业依据政策包与自身 Memory 形成行动'],
    ['规则引擎结算', '叠加外部事件，写入状态变化与承诺账'],
  ] as const;
  useEffect(() => {
    if (!settling) { setSettlementBeat(0); return; }
    const timer = window.setInterval(() => setSettlementBeat((current) => Math.min(settlementSteps.length - 1, current + 1)), 1200);
    return () => window.clearInterval(timer);
  }, [settling, settlementSteps.length]);

  return <>
    <div className="meeting-focus-shade enterprise-ui-theme" style={identityStyle} aria-hidden="true" />
    <section className="meeting-enterprise-stage enterprise-ui-theme" style={identityStyle} aria-label={`${profile.alias}企业代表`}>
      <div className="meeting-identity"><span>{enterprise.code}</span><div><small>{profile.industry} · {profile.negotiation.representative}</small><strong>{profile.alias}</strong></div></div>
      <blockquote>“{profile.negotiation.opening}”</blockquote>
    </section>
    <nav className="meeting-enterprise-nav enterprise-ui-theme" style={identityStyle}><DirectionalButton direction="back" className="meeting-nav-return" onClick={onClose}>返回沙盘</DirectionalButton></nav>

    <FramedPanel as="aside" className="negotiation-panel verification-room-panel layout-operation-panel enterprise-ui-theme" style={identityStyle}>
      <div className="negotiation-toolbar"><span>{stageLabel} · 1v1 联判</span><b>{deliberation.model_runtime.all_departments_model_generated ? '四部门 Agent 已接入' : '确定性降级模式'}</b><button aria-label="关闭联判" onClick={onClose}>×</button></div>
      <PanelHeading index="1V1" kicker="ENTERPRISE RESPONSE × DEPARTMENT REVIEW">企业回应和部门复盘</PanelHeading>

      <section className="verification-context">
        <div className="verification-context-lead"><small>本轮唯一核验问题</small><strong>{deliberation.verification_question.question}</strong><span>{deliberation.verification_question.critical_proposition}</span></div>
        <dl className="verification-context-stats"><div><dt>项目规模</dt><dd>{profile.investment}</dd></div><div><dt>财政申请</dt><dd>{profile.request} 点</dd></div><div><dt>已知证据</dt><dd>{profile.evidenceStatus}</dd></div><div><dt>企业底线</dt><dd>{profile.negotiation.bottomLine}</dd></div></dl>
      </section>

      <section className="verification-dialogue">
        <header><div><span className={busy ? 'live' : ''} /><b>现场联判对话</b><small>点击任一部门发言，查看其约 100 字完整思路</small></div></header>
        <div className="verification-message-feed" ref={feedRef} aria-live="polite">
          {deliberation.department_memos.map((memo) => <DepartmentMessage key={`opening-${memo.department}`} memo={memo} onOpen={() => setDetailDepartment(memo)} />)}
          {step !== 'opening' && <article className="verification-message system"><span className="verification-speaker-mark">问</span><div><header><b>决策者核验</b><small>系统由部门分歧生成</small></header><p>{deliberation.verification_question.question}</p></div></article>}
          {step !== 'opening' && <article className="verification-message enterprise"><span className="verification-speaker-mark">{enterprise.code}</span><div><header><b>{profile.alias} · 企业代表</b><small>{deliberation.enterprise_disclosure.response_type}</small></header><p>{deliberation.enterprise_disclosure.statement}</p></div></article>}
          {(step === 'review' || step === 'packages') && deliberation.department_memos.map((memo) => {
            const update = reviewByDepartment.get(memo.department);
            const reviewedMemo = update ? {
              ...memo,
              recommendation: update.recommendation_after as DepartmentMemo['recommendation'],
              key_page: update.key_page,
              independent_view: update.independent_view,
              confidence: update.confidence,
              generation_mode: update.generation_mode,
            } : memo;
            return <DepartmentMessage key={`review-${memo.department}`} memo={reviewedMemo} reviewText={update?.key_page ?? ''} onOpen={() => setDetailDepartment(reviewedMemo)} />;
          })}
        </div>
      </section>

      {error && <p className="validation-note">{error}</p>}
      <div className="verification-session-action">
        <div><b>{step === 'opening' ? '四部门已分别给出一句关键判断' : step === 'response' ? '企业已回应关键问题' : step === 'review' ? '四部门已完成复盘' : '政策包已由后端编译'}</b><small>没有自由参数编辑，所有金额与条件均来自后端</small></div>
        {step === 'opening' && <ActionButton onClick={() => setStep('response')}>向企业核验</ActionButton>}
        {step === 'response' && <ActionButton onClick={() => setStep('review')}>查看部门复盘</ActionButton>}
        {step === 'review' && <ActionButton onClick={() => setStep('packages')}>形成政策包</ActionButton>}
        {step === 'packages' && <span className="policy-package-ready">请在中央政策包中选择并执行</span>}
      </div>
    </FramedPanel>

    {step === 'packages' && selectedProposal && <div className="policy-package-backdrop">
      <section className="policy-package-dialog" role="dialog" aria-modal="true" aria-labelledby="policy-package-title">
        {settling && <div className="policy-settlement-progress" role="status" aria-live="polite">
          <div className="settlement-progress-spinner"><span>{settlementBeat + 1}/4</span></div>
          <small>DETERMINISTIC SETTLEMENT</small>
          <h2>{settlementSteps[settlementBeat][0]}</h2>
          <p>{settlementSteps[settlementBeat][1]}</p>
          <ol>{settlementSteps.map((item, index) => <li className={index < settlementBeat ? 'done' : index === settlementBeat ? 'active' : ''} key={item[0]}><span>{index < settlementBeat ? '✓' : index + 1}</span><div><b>{item[0]}</b><small>{item[1]}</small></div></li>)}</ol>
          <em>本请求仅仅结算已选方案一次；双方案反事实对照已移出主执行链。</em>
        </div>}
        <header><div><small>DETERMINISTIC POLICY COMPILER</small><h2 id="policy-package-title">选择本轮执行政策包</h2></div><b>玩家仅仅二选一</b></header>
        <div className="policy-package-choice-grid" role="radiogroup" aria-label="选择本轮执行政策包">
          {deliberation.meeting.proposals.map((proposal) => <button type="button" role="radio" aria-checked={selectedProposalId === proposal.proposal_id} className={selectedProposalId === proposal.proposal_id ? 'selected' : ''} onClick={() => setSelectedProposalId(proposal.proposal_id)} key={proposal.proposal_id}>
            <span>{proposal.label}</span><h3>财政投入 {proposal.capital_points} 点</h3><p>{proposal.rationale}</p>
            <dl><div><dt>分期安排</dt><dd>{proposal.tranches.join(' + ') || '无'}</dd></div><div><dt>硬约束</dt><dd>{proposal.conditions.length} 项</dd></div></dl>
            <ul>{proposal.conditions.slice(0, 4).map((condition) => <li key={condition}>{condition}</li>)}</ul>
            <em>{selectedProposalId === proposal.proposal_id ? '当前选择' : '选择此方案'}</em>
          </button>)}
        </div>
        {error && <p className="validation-note">{error}</p>}
        <footer><span>金额、分期、条件与退出机制均由后端编译，前端不可修改。</span><ActionButton disabled={Boolean(busy) || record.finalized} onClick={() => onApply({ fiscalOffer: selectedProposal.capital_points, tools: ['investment'], conditions: selectedProposal.conditions, submitted: true, proposalId: selectedProposal.proposal_id }, selectedProposal)}>{busy || (record.finalized ? '本轮已完成' : `执行${selectedProposal.label}`)}</ActionButton></footer>
      </section>
    </div>}

    {detailDepartment && <div
      className="department-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailDepartment(null); }}
    >
      <section className="department-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="department-detail-title">
        <button type="button" className="department-detail-close" aria-label="关闭完整研判" onClick={() => setDetailDepartment(null)}>×</button>
        <header>
          <span>{departmentMarks[detailDepartment.department]}</span>
          <div><small>DEPARTMENT AGENT · INDEPENDENT VIEW</small><h3 id="department-detail-title">{departmentLabels[detailDepartment.department]}完整研判</h3></div>
          <b>{stanceLabels[detailDepartment.recommendation]} · 置信度 {confidencePercent(detailDepartment.confidence)}%</b>
        </header>
        <div className="department-detail-key-page"><small>现场一句话</small><p>{openingJudgment(detailDepartment)}</p></div>
        <article><small>完整独立判断</small><p>{isUsefulChineseJudgment(detailDepartment.independent_view) ? detailDepartment.independent_view : `${openingJudgment(detailDepartment)} 该判断基于本部门职责、现有证据和风险红线形成；后续支持必须绑定可核验条件，并在证据不足或触碰红线时暂停执行。`}</p></article>
        <footer><span>该内容来自本部门独立 Agent Memory</span><button type="button" onClick={() => setDetailDepartment(null)}>返回联判对话</button></footer>
      </section>
    </div>}
  </>;
}
