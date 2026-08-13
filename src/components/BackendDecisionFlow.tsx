import { useState } from 'react';
import type { BackendResult, BackendStage, Deliberation, PolicyPackage } from '../integration/investmentBackend';
import { fetchDeliberation, selectPolicyPackage } from '../integration/investmentBackend';
import type { EnterpriseId } from '../game/types';
import { getEnterprise } from '../game/scenario';
import { ActionButton, FramedCard, PanelHeading } from './ui/ParlorUI';

const companyMap: Record<string, EnterpriseId> = { company_a: 'enterprise-a', company_d: 'enterprise-b' };
const departmentLabels: Record<string, string> = { finance: '财政部门', industry_information: '经信部门', science_technology: '科技部门', development_reform: '发改部门' };
const stanceLabels: Record<string, string> = { support: '支持', conditional_support: '有条件支持', defer: '暂缓', oppose: '反对' };
const parameterLabels: Record<string, string> = { funding_points: '财政投入', land_support: '土地支持', financing_support: '融资支持', energy_support: '能源保障', talent_support: '人才支持', research_support: '研发支持', milestone_strictness: '里程碑强度', audit_frequency: '审计频率' };
const actionLabels: Record<string, string> = { expand: '扩建', research: '研发验证', finance: '外部融资', seek_orders: '获取订单', contract: '收缩成本', relocate: '迁移', wait: '等待' };

export function backendToEnterprise(companyId: string): EnterpriseId { return companyMap[companyId] ?? 'enterprise-a'; }

export function BackendDecisionFlow({ run, selectedCompanyId, onSelectedCompany, onResult, onNextStage, onPhase }: {
  run: BackendStage;
  selectedCompanyId: string;
  onSelectedCompany: (companyId: string) => void;
  onResult: (result: BackendResult) => void;
  onNextStage: () => Promise<void>;
  onPhase: (phase: 'applications' | 'analysis' | 'settlement' | 'feedback') => void;
}) {
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [result, setResult] = useState<BackendResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [openDepartment, setOpenDepartment] = useState<string | null>(null);

  const selected = run.companies.find((company) => company.company_id === selectedCompanyId) ?? run.companies[0];
  const profile = getEnterprise(backendToEnterprise(selected.company_id));

  const startReview = async () => {
    onPhase('analysis');
    setBusy('四部门正在独立研判…'); setError('');
    try { setDeliberation(await fetchDeliberation(run, selected.company_id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); }
  };

  const choose = async (proposal: PolicyPackage) => {
    onPhase('settlement');
    setBusy('正在校验政策包并统一结算…'); setError('');
    try {
      const next = await selectPolicyPackage(run, selected.company_id, proposal.proposal_id);
      setResult(next); onResult(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); }
  };

  if (result) return <>
    <PanelHeading index="06" kicker="SANDBOX OUTCOME">查看沙盘反向推演</PanelHeading>
    <FramedCard className="joint-summary" tone="amber"><dl>
      <div><dt>政府行动</dt><dd>选择政策包，投入 {result.budget.spent} 点</dd></div>
      <div><dt>财政变化</dt><dd>{result.budget.before} → {result.budget.after}</dd></div>
      <div><dt>外部环境</dt><dd>{result.events[0]?.description ?? '本阶段历史事件已进入结算'}</dd></div>
    </dl></FramedCard>
    <div className="response-list">{result.companies.map((company) => {
      const action = result.company_actions.find((item) => item.company_id === company.company_id);
      const deltas = result.state_deltas.filter((item) => item.entity_id === company.company_id && item.delta !== 0).slice(-4);
      return <FramedCard as="article" key={company.company_id}><span>{company.company_id === selected.company_id ? '✓' : '·'}</span><div>
        <small>{company.display_name}</small><b>{actionLabels[action?.action ?? 'wait'] ?? action?.action}</b>
        <p>{action?.risk_response}</p>
        {deltas.map((delta) => <small key={`${delta.metric_id}-${delta.reason_code}`}>{delta.metric_id}：{delta.before} → {delta.after}</small>)}
      </div></FramedCard>;
    })}</div>
    <FramedCard className="notice"><b>关键因果链</b><span>政府政策包 → 企业自主行动 → 历史事件 → 规则结算 → 项目与城市状态变化</span></FramedCard>
    <ActionButton onClick={() => void onNextStage()}>{run.stage_id === 'S4' ? '进入终局验证' : '进入下一回合'}</ActionButton>
  </>;

  if (deliberation) return <>
    <PanelHeading index="03" kicker="INSTITUTIONAL REVIEW">四部门现场研判</PanelHeading>
    <FramedCard className="joint-summary" tone="amber"><dl>
      <div><dt>共同判断</dt><dd>{deliberation.meeting.consensus.join('；')}</dd></div>
      <div><dt>关键分歧</dt><dd>{deliberation.meeting.unresolved_disagreements.join('；')}</dd></div>
      <div><dt>关键核验问题</dt><dd>{deliberation.verification_question.question}</dd></div>
      <div><dt>联席建议</dt><dd>{deliberation.meeting.recommendation_rationale}</dd></div>
    </dl></FramedCard>
    <div className="agent-list backend-agent-list">{deliberation.department_memos.map((memo) => <FramedCard as="article" key={memo.department}>
      <i>{departmentLabels[memo.department][0]}</i><div><div><b>{departmentLabels[memo.department]}</b><em>{stanceLabels[memo.recommendation]}</em></div><p>{memo.key_page}</p>
        <button className="department-view-toggle" onClick={() => setOpenDepartment(openDepartment === memo.department ? null : memo.department)}>{openDepartment === memo.department ? '收起独立判断' : '查看独立判断'}</button>
        {openDepartment === memo.department && <p className="department-independent-view">{memo.independent_view}</p>}
      </div>
    </FramedCard>)}</div>
    <FramedCard className="directed-challenge"><small>定向质询</small><b>{deliberation.meeting.challenges.map((item) => `${departmentLabels[item.from_department]} → ${departmentLabels[item.to_department]}`).join('；')}</b><p>{deliberation.meeting.challenges.map((item) => `${item.question} ${item.response}`).join('；')}</p></FramedCard>
    <FramedCard className="verification-response" tone="amber"><div><small>企业关键回应</small><b>{deliberation.enterprise_disclosure.response_type}</b></div><p>{deliberation.enterprise_disclosure.statement}</p></FramedCard>
    <div className="joint-options backend-policy-packages">{deliberation.meeting.proposals.map((proposal) => <FramedCard key={proposal.proposal_id}>
      <small>{proposal.label} · {proposal.compiler_version}</small><b>财政 {proposal.capital_points} 点 · 分期 {proposal.tranches.join(' + ') || '0'}</b><p>{proposal.rationale}</p>
      <div className="policy-parameter-grid">{Object.entries(proposal.package_parameters).map(([key, value]) => <span key={key}>{parameterLabels[key] ?? key}<b>{String(value)}</b></span>)}</div>
      <p>{proposal.conditions.join('；')}</p><button className="inline-meeting-action" disabled={Boolean(busy)} onClick={() => void choose(proposal)}>选择{proposal.label} →</button>
    </FramedCard>)}</div>
    {error && <p className="validation-note">{error}</p>}
    {busy && <p className="panel-intro">{busy}</p>}
  </>;

  return <>
    <PanelHeading index="02" kicker="FIXED COMPARISON">双企业固定对比</PanelHeading>
    <div className="backend-company-tabs">{run.companies.map((company) => <button className={company.company_id === selected.company_id ? 'active' : ''} key={company.company_id} onClick={() => onSelectedCompany(company.company_id)}><b>{company.display_name}</b><span>{company.archetype}</span></button>)}</div>
    <FramedCard as="section" className="enterprise-profile"><div className="profile-title"><span>{selected.company_id === 'company_a' ? 'A' : 'B'}</span><div><small>ANONYMOUS PROJECT</small><h3>{profile.alias}</h3></div><em>资金请求 {selected.capital_request} 点</em></div>
      <dl><div><dt>它想做什么</dt><dd>{profile.background}</dd></div><div><dt>为什么可能成功</dt><dd>{profile.technology}</dd></div><div><dt>需要政府提供什么</dt><dd>{profile.negotiation.bottomLine}</dd></div><div><dt>最大不确定性</dt><dd>{profile.dataGap}</dd></div></dl>
    </FramedCard>
    <FramedCard className="notice amber" tone="amber"><b>本轮财政约束</b><span>两家企业固定同时进入比较，本轮可调配 {run.available_budget} 点。玩家先选一家进入一对一制度研判。</span></FramedCard>
    {error && <p className="validation-note">{error}</p>}
    <ActionButton disabled={Boolean(busy)} onClick={() => void startReview()}>{busy || `选择 ${profile.alias} 进入四部门研判`}</ActionButton>
  </>;
}
