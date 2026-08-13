import { useEffect, useMemo, useRef, useState } from 'react';
import { getJointReview } from '../game/jointReview';
import type { DepartmentKey } from '../game/jointReview';
import { agentLabels, getEnterprise, supportToolLabels } from '../game/scenario';
import type { EnterpriseState, Phase, SupportTool } from '../game/types';
import { compilePlayerDecisionPackages } from '../game/verificationOutcome';
import { enterpriseThemeStyle } from '../theme/enterpriseTheme';
import { ActionButton, DirectionalButton, FramedPanel, PanelHeading } from './ui/ParlorUI';

export type NegotiationResponse = 'accept' | 'counter' | 'delay' | 'walk_away';

export type NegotiationRecord = {
  verificationQuestion?: string;
  verificationLocked?: boolean;
  fiscalOffer: number;
  tools: SupportTool[];
  conditions: string[];
  submitted: boolean;
  response?: NegotiationResponse;
  counterFiscal?: number;
  counterTool?: SupportTool;
  finalized?: boolean;
};

export const emptyNegotiationRecord: NegotiationRecord = {
  fiscalOffer: 0,
  tools: [],
  conditions: [],
  submitted: false,
};

const departmentMarks: Record<DepartmentKey, string> = {
  fiscal: '财',
  industry: '经',
  technology: '科',
  market: '发',
};

const departmentOrder: DepartmentKey[] = ['fiscal', 'industry', 'technology', 'market'];

type VerificationMessage = {
  id: string;
  kind: 'system' | 'enterprise' | 'department' | 'challenge';
  speaker: string;
  mark: string;
  meta: string;
  text: string;
  detail?: string;
  department?: DepartmentKey;
};

export function NegotiationOverlay({
  enterprise,
  phase,
  stageLabel,
  record,
  onClose,
  onApply,
}: {
  enterprise: EnterpriseState;
  phase: Phase;
  stageLabel: string;
  record: NegotiationRecord;
  onChange: (record: NegotiationRecord) => void;
  onClose: () => void;
  onApply: (record: NegotiationRecord) => void;
}) {
  const profile = getEnterprise(enterprise.id);
  const review = getJointReview(enterprise.id);
  const selectedVerification = profile.negotiation.verificationQuestions.find(
    (item) => item.question === record.verificationQuestion,
  ) ?? profile.negotiation.verificationQuestions[0];
  const selectedCandidate = review.verificationCandidates.find(
    (item) => item.question === selectedVerification.question,
  ) ?? review.verificationCandidates[0];
  const challenge = review.challenges[0];
  const challengeFrom = agentLabels[challenge.from];
  const challengeTo = agentLabels[challenge.to];
  const identityStyle = enterpriseThemeStyle(enterprise.id);
  const decisionPackages = useMemo(
    () => compilePlayerDecisionPackages(enterprise.id, selectedVerification.question),
    [enterprise.id, selectedVerification.question],
  );
  const [selectedPackageId, setSelectedPackageId] = useState<'prudent' | 'progressive'>('prudent');
  const selectedPackage = decisionPackages.find((item) => item.id === selectedPackageId) ?? decisionPackages[0];

  const compiledRecord = useMemo<NegotiationRecord>(() => {
    return {
      ...record,
      verificationQuestion: selectedVerification.question,
      verificationLocked: true,
      fiscalOffer: selectedPackage.fiscalOffer,
      tools: selectedPackage.tools,
      conditions: selectedPackage.conditions,
      submitted: true,
      response: 'accept',
      counterFiscal: undefined,
      counterTool: undefined,
    };
  }, [record, selectedPackage, selectedVerification.question]);

  const messages = useMemo<VerificationMessage[]>(() => {
    const departmentMessages = departmentOrder.map((key) => {
      const department = review.departments[key];
      return {
        id: `department-${key}`,
        kind: 'department' as const,
        speaker: agentLabels[key],
        mark: departmentMarks[key],
        meta: `核验后复议 · ${department.stance} · 置信度 ${department.confidence}%`,
        text: department.claim,
        detail: `更新约束：${department.acceptableCondition}`,
        department: key,
      };
    });

    return [
      {
        id: 'system-question',
        kind: 'system',
        speaker: '核验主持',
        mark: '问',
        meta: '来自前序四部门联判分歧 · 本轮仅核验一次',
        text: selectedVerification.question,
        detail: `决策影响：${selectedCandidate.decisionImpact}`,
      },
      {
        id: 'enterprise-response',
        kind: 'enterprise',
        speaker: `${profile.alias} · 企业代表`,
        mark: enterprise.code,
        meta: `企业回应 · ${selectedVerification.responseType}`,
        text: selectedVerification.response,
        detail: '该回应将改变部门支持强度与条件，不直接构成政府承诺。',
      },
      ...departmentMessages,
      {
        id: 'department-challenge',
        kind: 'challenge',
        speaker: `${challengeFrom} → ${challengeTo}`,
        mark: '质',
        meta: '部门定向质询 · 围绕核心分歧',
        text: challenge.question,
        detail: `争议：${review.disagreement}`,
        department: challenge.from,
      },
      {
        id: 'department-answer',
        kind: 'challenge',
        speaker: challengeTo,
        mark: departmentMarks[challenge.to],
        meta: challenge.changed ? '回应质询 · 立场已更新' : '回应质询 · 维持原判断',
        text: challenge.response,
        detail: challenge.changed
          ? `${challenge.stanceBefore} → ${challenge.stanceAfter}；新增条件：${challenge.addedCondition}`
          : challenge.changedBecause,
        department: challenge.to,
      },
    ];
  }, [challenge, challengeFrom, challengeTo, enterprise.code, profile.alias, review.departments, review.disagreement, selectedCandidate.decisionImpact, selectedVerification.question, selectedVerification.response, selectedVerification.responseType]);

  const [visibleCount, setVisibleCount] = useState(record.finalized ? messages.length : 0);
  const [running, setRunning] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const complete = visibleCount >= messages.length;

  useEffect(() => {
    if (!running || complete) return;
    const timer = window.setTimeout(() => setVisibleCount((current) => Math.min(messages.length, current + 1)), 360);
    return () => window.clearTimeout(timer);
  }, [complete, messages.length, running, visibleCount]);

  useEffect(() => {
    if (complete) setRunning(false);
  }, [complete]);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: visibleCount > 1 ? 'smooth' : 'auto' });
  }, [visibleCount]);

  const supportLevel = selectedPackage.supportLevel;

  const startSession = () => {
    setVisibleCount((current) => current || 1);
    setRunning(true);
  };

  const finishSession = () => {
    setVisibleCount(messages.length);
    setRunning(false);
  };

  return <>
    <div className="meeting-focus-shade enterprise-ui-theme" style={identityStyle} aria-hidden="true" />
    <section className="meeting-enterprise-stage enterprise-ui-theme" style={identityStyle} aria-label={`${profile.alias}企业代表`}>
      <div className="meeting-identity">
        <span>{enterprise.code}</span>
        <div><small>{profile.industry} · {profile.negotiation.representative}</small><strong>{profile.alias}</strong></div>
      </div>
      <blockquote>“{profile.negotiation.opening}”</blockquote>
    </section>

    <nav className="meeting-enterprise-nav enterprise-ui-theme" style={identityStyle} aria-label="核验导航">
      <DirectionalButton direction="back" className="meeting-nav-return" onClick={onClose}>返回沙盘</DirectionalButton>
    </nav>

    <FramedPanel as="aside" className="negotiation-panel verification-room-panel layout-operation-panel enterprise-ui-theme" style={identityStyle}>
      <div className="negotiation-toolbar">
        <span>{stageLabel} · 政企关键核验</span>
        <b>{record.finalized ? '核验纪要已归档' : '结构化 Agent 研判 · 演示数据'}</b>
        <button aria-label="关闭政企核验" onClick={onClose}>×</button>
      </div>

      <PanelHeading index="1V1" kicker="KEY CLAIM VERIFICATION">企业回应与部门复议</PanelHeading>

      <section className="verification-context" aria-label="企业核验背景数据">
        <div className="verification-context-lead">
          <small>本轮唯一核验问题</small>
          <strong>{selectedVerification.question}</strong>
          <span>承接前序四部门联判 · {selectedCandidate.status} · {selectedCandidate.decisionImpact}</span>
        </div>
        <dl className="verification-context-stats">
          <div><dt>项目规模</dt><dd>{profile.investment}</dd></div>
          <div><dt>财政申请</dt><dd>{profile.request} 点</dd></div>
          <div><dt>已知证据</dt><dd>{profile.evidenceStatus}</dd></div>
          <div><dt>企业底线</dt><dd>{profile.negotiation.bottomLine}</dd></div>
        </dl>
      </section>

      <section className="verification-dialogue" aria-label="企业回应与部门复议会话">
        <header>
          <div><span className={running ? 'live' : ''} /><b>企业回应与部门复议</b><small>{complete ? '已形成核验后更新结论' : running ? '部门 Agent 正在更新判断' : '等待企业回应'}</small></div>
          {!complete && visibleCount > 0 && <button onClick={finishSession}>直接形成结论</button>}
        </header>

        <div className="verification-message-feed" ref={feedRef} aria-live="polite">
          {visibleCount === 0 && <div className="verification-empty-state">
            <span>4</span>
            <div><b>前序 one-by-one 联判已完成</b><p>企业回应后，四位部门 Agent 只更新一次判断，并对仍未消除的核心分歧进行一次复议质询。</p></div>
          </div>}
          {messages.slice(0, visibleCount).map((message) => (
            <article key={message.id} className={`verification-message ${message.kind} ${message.department ? `department-${message.department}` : ''}`}>
              <span className="verification-speaker-mark">{message.mark}</span>
              <div>
                <header><b>{message.speaker}</b><small>{message.meta}</small></header>
                <p>{message.text}</p>
                {message.detail && <aside>{message.detail}</aside>}
              </div>
            </article>
          ))}
          {running && !complete && <div className="verification-typing"><i /><i /><i /><span>正在读取下一位部门 Agent 的复议更新</span></div>}
        </div>
      </section>

      {complete && <section className="verification-conclusion" aria-label="核验后联判更新结论">
        <header><span>结</span><div><small>POST-VERIFICATION UPDATE</small><h3>核验后联判更新结论</h3></div><b>{supportLevel}</b></header>
        <p>{review.recommendation}</p>
        <div className="verification-conclusion-grid">
          <dl><dt>当前方案投入</dt><dd>{compiledRecord.fiscalOffer} 点</dd><small>玩家不能修改参数</small></dl>
          <dl><dt>支持方向</dt><dd>{compiledRecord.tools.map((tool) => supportToolLabels[tool]).join(' · ')}</dd><small>随方案自动配置</small></dl>
          <dl><dt>硬约束</dt><dd>{compiledRecord.conditions.length} 项</dd><small>分期、里程碑与退出条件</small></dl>
        </div>
        <ul>{compiledRecord.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
        <div className="verification-player-decision">
          <header><div><small>PLAYER DECISION</small><b>玩家最终拍板</b></div><span>选择后立即结算本轮</span></header>
          <div className="verification-policy-options" role="radiogroup" aria-label="选择本轮政府方案">
            {decisionPackages.map((item) => <button
              type="button"
              role="radio"
              aria-checked={selectedPackageId === item.id}
              className={selectedPackageId === item.id ? 'selected' : ''}
              onClick={() => setSelectedPackageId(item.id)}
              key={item.id}
            >
              <span>{item.label}</span><b>{item.title}</b><p>{item.description}</p>
              <dl><div><dt>首期投入</dt><dd>{item.fiscalOffer} 点</dd></div><div><dt>支持工具</dt><dd>{item.tools.length} 项</dd></div></dl>
              <em>{selectedPackageId === item.id ? '已选择' : '选择此方案'}</em>
            </button>)}
          </div>
          <footer>
            <span>确认后自动执行企业行动、历史冲击与规则结算，沙盘建筑将按结果更新。</span>
            <ActionButton onClick={() => phase === 'allocation' && !record.finalized ? onApply(compiledRecord) : onClose()}>
              {record.finalized ? '本轮已完成 · 返回沙盘' : `执行${selectedPackage.label}并完成本轮`}
            </ActionButton>
          </footer>
        </div>
      </section>}

      {!complete && <div className="verification-session-action">
        <div><b>{visibleCount === 0 ? '本轮只进行一次关键核验' : `${visibleCount} / ${messages.length} 条研判已生成`}</b><small>不开放自由提问，不允许前端修改政策参数</small></div>
        <ActionButton disabled={running} onClick={startSession}>{running ? '企业回应处理中…' : visibleCount ? '继续部门复议' : '向企业核验'}</ActionButton>
      </div>}
    </FramedPanel>
  </>;
}
