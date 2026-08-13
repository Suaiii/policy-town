import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getJointReview, type DepartmentKey } from '../game/jointReview';
import { agentLabels, getEnterprise, stages } from '../game/scenario';
import type { EnterpriseId, SimulationState } from '../game/types';
import { ActionButton, FramedCard, PanelHeading, SectionLabel } from './ui/ParlorUI';

type ReviewView = 'summary' | 'departments' | 'challenge' | 'questions';

const departmentOrder: DepartmentKey[] = ['fiscal', 'industry', 'technology', 'market'];
const departmentCodes: Record<DepartmentKey, string> = {
  fiscal: 'FIN',
  industry: 'IND',
  technology: 'SCI',
  market: 'DEV',
};
const departmentMarks: Record<DepartmentKey, string> = { fiscal: '财', industry: '经', technology: '科', market: '发' };
const departmentRoles: Record<DepartmentKey, string> = {
  fiscal: '财政承受能力 · 资金节奏 · 风险敞口',
  industry: '产业基础 · 供应链协同 · 落地条件',
  technology: '技术能力 · 研发价值 · 技术风险',
  market: '项目时序 · 长期价值 · 退出条件',
};

export function JointReviewPanel({ state, onBeginVerification }: {
  state: SimulationState;
  onBeginVerification: (id: EnterpriseId, question: string) => void;
}) {
  const [view, setView] = useState<ReviewView>('departments');
  const [departmentStep, setDepartmentStep] = useState(0);
  const [departmentsComplete, setDepartmentsComplete] = useState(false);
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const selected = state.enterprises.find((enterprise) => enterprise.id === state.selectedEnterpriseId)!;
  const review = getJointReview(selected.id);
  const selectedQuestion = review.verificationCandidates.find((candidate) => candidate.id === selectedQuestionId);

  useEffect(() => {
    setView('departments');
    setDepartmentStep(0);
    setDepartmentsComplete(false);
    setExpandedChallenge(null);
    setSelectedQuestionId(null);
    setEvidenceId(null);
  }, [selected.id]);

  const goBackToSummary = () => {
    setView('summary');
    setEvidenceId(null);
  };

  const activeDepartmentKey = departmentOrder[departmentStep];
  const activeDepartment = review.departments[activeDepartmentKey];
  const continueDepartmentReview = () => {
    if (departmentStep < departmentOrder.length - 1) {
      setDepartmentStep((current) => current + 1);
      return;
    }
    setDepartmentsComplete(true);
    setView('challenge');
  };

  return <>
    <PanelHeading index="04" kicker="JOINT REVIEW">四部门联席研判</PanelHeading>
    <div className="review-locked-enterprise" aria-label={`当前只研判企业 ${selected.code}`}>
      <span>{selected.code}</span>
      <div><small>本轮已选企业 · 锁定研判</small><b>{getEnterprise(selected.id).alias}</b></div>
      <em>{getEnterprise(selected.id).industry}</em>
    </div>
    <nav className="review-view-nav" aria-label="联席研判步骤">
      {([
        ['departments', '逐项研判'],
        ['challenge', '部门质询'],
        ['summary', '联席结论'],
        ['questions', '核验问题'],
      ] as Array<[ReviewView, string]>).map(([key, label], index) => <button
        type="button"
        className={view === key ? 'active' : ''}
        aria-current={view === key ? 'step' : undefined}
        disabled={key !== 'departments' && !departmentsComplete}
        onClick={() => setView(key)}
        key={key}
      ><span>4.{index + 1}</span><b>{label}</b></button>)}
    </nav>

    {view === 'summary' && <section className="review-summary-view" aria-labelledby="review-summary-title">
      <div className="review-section-heading"><small>4.3 · JOINT CONCLUSION</small><h3 id="review-summary-title">企业 {selected.code} 联席结论</h3></div>
      <dl className="review-summary-grid">
        <div className="consensus"><dt>共识</dt><dd>{review.consensus}</dd></div>
        <div className="unresolved"><dt>关键未穿透项</dt><dd>{review.unresolved}</dd></div>
        <div><dt>建议动作</dt><dd>{review.recommendation}</dd></div>
      </dl>

      <details className="review-more-context">
        <summary>查看分歧与备选方案</summary>
        <dl><div><dt>最大分歧</dt><dd>{review.disagreement}</dd></div><div><dt>少数意见</dt><dd>{review.minorityOpinion}</dd></div></dl>
        <SectionLabel>备选方案 · 尚未形成政府承诺</SectionLabel>
        <div className="review-option-list">
          {review.options.map((option) => <FramedCard as="article" key={option.id}>
            <small>{option.label}</small><b>{option.title}</b>
            <p>{option.conditions.join(' · ')}</p>
          </FramedCard>)}
        </div>
      </details>
      <div className="review-secondary-actions">
        <button type="button" onClick={() => setView('departments')}>回看四部门逐项研判 <span>→</span></button>
        <button type="button" onClick={() => setView('challenge')}>回看质询与立场变化 <span>→</span></button>
      </div>
      <ActionButton onClick={() => setView('questions')}>选择企业 {selected.code} 进入核验</ActionButton>
    </section>}

    {view === 'departments' && <section className="review-department-view" aria-labelledby="review-department-title">
      <div className="review-section-heading"><small>4.1 · ONE-BY-ONE REVIEW</small><h3 id="review-department-title">四部门逐个独立研判</h3></div>
      <ol className="department-scene-progress" aria-label="四部门逐项研判进度">
        {departmentOrder.map((key, index) => <li className={index < departmentStep || departmentsComplete ? 'done' : index === departmentStep ? 'active' : 'pending'} key={key}>
          <span>{index < departmentStep || departmentsComplete ? '✓' : index + 1}</span><div><small>{departmentCodes[key]}</small><b>{agentLabels[key]}</b></div>
        </li>)}
      </ol>
      <article className={`department-one-by-one-scene department-${activeDepartmentKey}`} key={activeDepartmentKey}>
        <aside className="department-agent-focus">
          <div className="department-agent-figure" aria-hidden="true"><span>{departmentMarks[activeDepartmentKey]}</span></div>
          <small>DEPARTMENT AGENT · {departmentCodes[activeDepartmentKey]}</small>
          <h4>{agentLabels[activeDepartmentKey]}</h4>
          <p>{departmentRoles[activeDepartmentKey]}</p>
        </aside>
        <div className="department-agent-statement">
          <header><div><small>独立判断 · 仅使用截止日前材料</small><h4>{activeDepartment.stance}</h4></div><span><small>置信度</small><b>{activeDepartment.confidence}%</b><i><em style={{ width: `${activeDepartment.confidence}%` }} /></i></span></header>
          <blockquote>“{activeDepartment.claim}”</blockquote>
          <dl>
            <div><dt>关键假设</dt><dd>{activeDepartment.assumption}</dd></div>
            <div><dt>部门红线</dt><dd>{activeDepartment.redLine}</dd></div>
            <div><dt>可接受条件</dt><dd>{activeDepartment.acceptableCondition}</dd></div>
          </dl>
          <div className="review-evidence-links"><span>引用证据</span>{activeDepartment.evidenceIds.map((id) => <button type="button" onClick={() => setEvidenceId(id)} key={id}>{id} ↗</button>)}</div>
          <footer><small>{departmentStep < departmentOrder.length - 1 ? `下一位：${agentLabels[departmentOrder[departmentStep + 1]]}` : '四部门独立判断即将完成'}</small><ActionButton onClick={continueDepartmentReview}>继续</ActionButton></footer>
        </div>
      </article>
    </section>}

    {view === 'challenge' && <section className="review-challenge-view" aria-labelledby="review-challenge-title">
      <div className="review-section-heading"><small>4.2 · DIRECTED CHALLENGE</small><h3 id="review-challenge-title">质询如何改变立场</h3></div>
      <p className="review-helper-copy">只记录改变判断或新增约束的质询；未解决分歧不会被强行合并。</p>
      <div className="review-challenge-list">
        {review.challenges.map((challenge) => {
          const expanded = expandedChallenge === challenge.id;
          return <article key={challenge.id} className={expanded ? 'expanded' : ''}>
            <button type="button" aria-expanded={expanded} onClick={() => setExpandedChallenge(expanded ? null : challenge.id)}>
              <small>{agentLabels[challenge.from]} → {agentLabels[challenge.to]}</small>
              <b>{challenge.claim}</b>
              <span>{challenge.changed ? '立场已变化' : '立场未变化'} · {expanded ? '收起' : '查看因果路径'}</span>
            </button>
            {expanded && <div className="review-challenge-detail">
              <dl>
                <div><dt>质询</dt><dd>{challenge.question}</dd></div>
                <div><dt>回应</dt><dd>{challenge.response}</dd></div>
              </dl>
              <div className="stance-transition"><span>{challenge.stanceBefore}</span><i>→</i><strong>{challenge.stanceAfter}</strong></div>
              <p><span>改变原因</span>{challenge.changedBecause}</p>
              <p><span>新增条件</span>{challenge.addedCondition}</p>
              <div className="review-evidence-links"><span>改变立场的证据</span>{challenge.evidenceIds.map((id) => <button type="button" onClick={() => setEvidenceId(id)} key={id}>{id} ↗</button>)}</div>
            </div>}
          </article>;
        })}
      </div>
      <ActionButton onClick={goBackToSummary}>继续</ActionButton>
    </section>}

    {view === 'questions' && <section className="review-question-view" aria-labelledby="review-question-title">
      <div className="review-section-heading"><small>4.4 · VERIFICATION CANDIDATES</small><h3 id="review-question-title">选择一个核验问题</h3></div>
      <FramedCard className="review-unresolved-anchor" tone="amber"><small>当前关键未穿透项</small><b>{review.unresolved}</b></FramedCard>
      <p className="review-helper-copy">问题只来自当前未穿透项。本轮只能选择一张，进入企业席位后企业只回应一次。</p>
      <div className="verification-candidate-list" role="radiogroup" aria-label={`企业 ${selected.code} 核验问题候选`}>
        {review.verificationCandidates.map((candidate, index) => {
          const checked = selectedQuestionId === candidate.id;
          return <button
            type="button"
            role="radio"
            aria-checked={checked}
            className={checked ? 'selected' : ''}
            onClick={() => setSelectedQuestionId(candidate.id)}
            key={candidate.id}
          >
            <span>0{index + 1}</span>
            <div><small>{candidate.status}</small><b>{candidate.question}</b><p><em>可能改变的决策</em>{candidate.decisionImpact}</p></div>
            <i>{checked ? '已选择' : '选择'}</i>
          </button>;
        })}
      </div>
      <p className="review-selection-state">{selectedQuestion ? `已选择 · ${selectedQuestion.id}` : '尚未选择核验问题'}</p>
      <ActionButton disabled={!selectedQuestion} onClick={() => selectedQuestion && onBeginVerification(selected.id, selectedQuestion.question)}>向企业 {selected.code} 发起核验</ActionButton>
      <button type="button" className="review-back-action" onClick={goBackToSummary}>← 返回联席摘要</button>
    </section>}

    {evidenceId && createPortal(<div className="context-evidence-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEvidenceId(null); }}>
      <aside className="context-evidence-drawer review-evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="review-evidence-title">
        <button type="button" className="context-evidence-close" aria-label="关闭证据详情" onClick={() => setEvidenceId(null)}>×</button>
        <small>JOINT REVIEW EVIDENCE · SCENARIO</small>
        <h3 id="review-evidence-title">部门主张证据</h3>
        <dl>
          <div><dt>证据编号</dt><dd>{evidenceId}</dd></div>
          <div><dt>所属对象</dt><dd>企业 {selected.code} · {getEnterprise(selected.id).industry}</dd></div>
          <div><dt>信息截止日</dt><dd>{stages[state.stageIndex].cutoff}</dd></div>
          <div><dt>质量等级</dt><dd>SCENARIO</dd></div>
          <div><dt>可见性</dt><dd className="visible">截止日前可见</dd></div>
        </dl>
        <p>用于 P04 结构化研判和因果链联调的演示情景材料，不代表真实企业事实。</p>
      </aside>
    </div>, document.body)}
  </>;
}
