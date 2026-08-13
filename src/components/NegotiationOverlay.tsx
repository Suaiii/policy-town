import { useMemo, type CSSProperties } from 'react';
import { PROJECT_VISUAL_PALETTES } from '../../packages/map-visuals/src/MapProjectLayer';
import { getEnterprise, supportToolLabels } from '../game/scenario';
import type { EnterpriseState, Phase, SupportTool } from '../game/types';
import { ENTERPRISE_ARCHETYPES } from '../integration/mapAdapter';
import { ActionButton, FramedCard, FramedPanel, PanelHeading, SectionLabel } from './ui/ParlorUI';

export type NegotiationResponse = 'accept' | 'counter' | 'delay' | 'walk_away';

export type NegotiationRecord = {
  verificationQuestion?: string;
  fiscalOffer: number;
  tools: SupportTool[];
  conditions: string[];
  submitted: boolean;
  response?: NegotiationResponse;
  counterFiscal?: number;
  counterTool?: SupportTool;
};

export const emptyNegotiationRecord: NegotiationRecord = {
  fiscalOffer: 0,
  tools: [],
  conditions: [],
  submitted: false,
};

const conditionOptions = [
  '企业提交自有资金证明',
  '按技术或建设里程碑分期拨付',
  '双方按约定比例同步出资',
  '引入专项审计与进度核验',
  '未达里程碑时暂停追加',
  '触发减持、重组或退出安排',
] as const;

const askLabels = {
  equity: '股权资本',
  subsidy: '补贴 / 贴息',
  land: '土地与公用容量',
  financing: '贷款协调 / 担保',
  infrastructure: '基础设施配套',
} as const;

function evaluateOffer(enterprise: EnterpriseState, record: NegotiationRecord) {
  const profile = getEnterprise(enterprise.id);
  const coverage = record.fiscalOffer / profile.request;
  const preferredMatches = record.tools.filter((tool) => profile.requestedTools.includes(tool)).length;
  const missingPreferredTool = profile.requestedTools.find((tool) => !record.tools.includes(tool));

  if (coverage >= 0.8 && preferredMatches >= 2) {
    return { response: 'accept' as const };
  }
  if (coverage >= 0.45 && preferredMatches >= 1) {
    return {
      response: 'counter' as const,
      counterFiscal: Math.max(record.fiscalOffer + 5, Math.ceil(profile.request * 0.75)),
      counterTool: missingPreferredTool,
    };
  }
  if (coverage > 0) return { response: 'delay' as const };
  return { response: 'walk_away' as const };
}

function responseCopy(response: NegotiationResponse, alias: string) {
  if (response === 'accept') return `${alias}接受政府条件单，双方承诺将按约定条件进入项目准备。`;
  if (response === 'counter') return `${alias}提出一次性反提案，要求调整投入上限或补足关键城市支持。`;
  if (response === 'delay') return `${alias}认为当前条件不足以启动项目，将等待总部决策或外部融资结果。`;
  return `${alias}拒绝本轮条件单，并开始比较其他城市的支持条件。`;
}

export function NegotiationOverlay({
  enterprise,
  phase,
  stageLabel,
  record,
  onChange,
  onClose,
  onApply,
  onPrevious,
  onNext,
}: {
  enterprise: EnterpriseState;
  phase: Phase;
  stageLabel: string;
  record: NegotiationRecord;
  onChange: (record: NegotiationRecord) => void;
  onClose: () => void;
  onApply: (record: NegotiationRecord) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const profile = getEnterprise(enterprise.id);
  const response = record.response;
  const totalCommitments = record.tools.length + record.conditions.length;
  const canSubmit = Boolean(record.verificationQuestion) && record.fiscalOffer > 0 && record.tools.length > 0;
  const selectedVerification = profile.negotiation.verificationQuestions.find(
    (item) => item.question === record.verificationQuestion,
  );
  const responseText = useMemo(
    () => response ? responseCopy(response, profile.alias) : '',
    [profile.alias, response],
  );
  const visualPalette = PROJECT_VISUAL_PALETTES[ENTERPRISE_ARCHETYPES[enterprise.id]];
  const identityStyle = {
    '--enterprise-accent': visualPalette.accent,
    '--enterprise-primary': visualPalette.primary,
  } as CSSProperties;

  const updateOffer = (partial: Partial<NegotiationRecord>) => {
    onChange({ ...record, ...partial, submitted: false, response: undefined, counterFiscal: undefined, counterTool: undefined });
  };

  const toggleTool = (tool: SupportTool) => {
    updateOffer({
      tools: record.tools.includes(tool)
        ? record.tools.filter((item) => item !== tool)
        : [...record.tools, tool],
    });
  };

  const toggleCondition = (condition: string) => {
    const exists = record.conditions.includes(condition);
    if (!exists && record.conditions.length >= 3) return;
    updateOffer({
      conditions: exists
        ? record.conditions.filter((item) => item !== condition)
        : [...record.conditions, condition],
    });
  };

  const submitOffer = () => {
    const result = evaluateOffer(enterprise, record);
    onChange({ ...record, ...result, submitted: true });
  };

  const acceptCounter = () => {
    const tools = record.counterTool && !record.tools.includes(record.counterTool)
      ? [...record.tools, record.counterTool]
      : record.tools;
    onChange({
      ...record,
      fiscalOffer: record.counterFiscal ?? record.fiscalOffer,
      tools,
      submitted: true,
      response: 'accept',
      counterFiscal: undefined,
      counterTool: undefined,
    });
  };

  const canApply = phase === 'allocation' && response === 'accept';

  return <>
    <div className="meeting-focus-shade enterprise-ui-theme" style={identityStyle} aria-hidden="true" />
    <section className="meeting-enterprise-stage enterprise-ui-theme" style={identityStyle} aria-label={`${profile.alias}企业代表`}>
      <div className="meeting-identity">
        <span>{enterprise.code}</span>
        <div><small>{profile.industry} · {profile.negotiation.representative}</small><strong>{profile.alias}</strong></div>
      </div>
      <blockquote>“{profile.negotiation.opening}”</blockquote>
    </section>

    <nav className="meeting-enterprise-nav enterprise-ui-theme" style={identityStyle} aria-label="切换核验企业">
      <button className="meeting-return meeting-nav-return" onClick={onClose}>← 返回沙盘</button>
      <button className="meeting-nav-previous" onClick={onPrevious} aria-label="查看左边企业"><span>←</span><small>上一家企业</small></button>
      <button className="meeting-nav-next" onClick={onNext} aria-label="查看右边企业"><small>下一家企业</small><span>→</span></button>
    </nav>

    <FramedPanel as="aside" className="negotiation-panel enterprise-ui-theme" style={identityStyle}>
      <div className="negotiation-toolbar">
        <span>{stageLabel} · 政企条件协商</span>
        <b>一次核验 · 一次反提案</b>
        <button aria-label="关闭政企协商" onClick={onClose}>×</button>
      </div>

      <PanelHeading index="1V1" kicker="KEY CLAIM VERIFICATION">与企业 {enterprise.code} 核验关键命题</PanelHeading>

      <FramedCard className="critical-proposition" tone="amber">
        <div><small>本项目关键未穿透项</small><b>{profile.negotiation.verificationStatus}</b></div>
        <p>{profile.negotiation.criticalProposition}</p>
      </FramedCard>

      <SectionLabel>选择一个关键核验问题</SectionLabel>
      <div className="verification-questions" role="radiogroup" aria-label="关键核验问题">
        {profile.negotiation.verificationQuestions.map((item, index) => (
          <button
            key={item.question}
            role="radio"
            aria-checked={record.verificationQuestion === item.question}
            className={record.verificationQuestion === item.question ? 'selected' : ''}
            onClick={() => updateOffer({ verificationQuestion: item.question })}
          >
            <span>0{index + 1}</span><b>{item.question}</b>
          </button>
        ))}
      </div>
      {selectedVerification && <FramedCard className="verification-response">
        <div><small>企业核验回应</small><b>{selectedVerification.responseType}</b></div>
        <p>{selectedVerification.response}</p>
      </FramedCard>}

      <SectionLabel>企业资源诉求</SectionLabel>
      <div className="negotiation-ask-grid">
        {(Object.keys(askLabels) as Array<keyof typeof askLabels>).map((key) => (
          <FramedCard key={key}><span>{askLabels[key]}</span><b>{profile.negotiation.ask[key]}</b></FramedCard>
        ))}
      </div>
      <FramedCard className="negotiation-bottom-line" tone="amber">
        <small>企业可谈边界</small><p>{profile.negotiation.bottomLine}</p>
      </FramedCard>

      <SectionLabel>政府条件单</SectionLabel>
      <label className="negotiation-fiscal-slider">
        <div><span>政府投入 · 首期上限</span><b>{record.fiscalOffer} 点</b></div>
        <input
          aria-label="政府投入"
          type="range"
          min="0"
          max={Math.min(60, Math.max(profile.request + 10, 40))}
          value={record.fiscalOffer}
          onChange={(event) => updateOffer({ fiscalOffer: Number(event.target.value) })}
        />
        <small>企业资金请求 {profile.request} 点 · 当前覆盖 {Math.round(record.fiscalOffer / profile.request * 100)}%</small>
      </label>
      <div className="negotiation-fiscal-actions" aria-label="政府投入快捷调整">
        <button onClick={() => updateOffer({ fiscalOffer: Math.max(0, record.fiscalOffer - 5) })}>− 5</button>
        <button onClick={() => updateOffer({ fiscalOffer: Math.min(60, record.fiscalOffer + 5) })}>＋ 5</button>
        <button onClick={() => updateOffer({ fiscalOffer: profile.request })}>按资金请求</button>
      </div>

      <SectionLabel>城市支持</SectionLabel>
      <div className="negotiation-tools" aria-label="城市支持工具">
        {(Object.keys(supportToolLabels) as SupportTool[]).map((tool) => (
          <button key={tool} className={record.tools.includes(tool) ? 'selected' : ''} onClick={() => toggleTool(tool)}>
            {record.tools.includes(tool) ? '✓ ' : '+ '}{supportToolLabels[tool]}
          </button>
        ))}
      </div>

      <SectionLabel>风险条件 · 最多三项</SectionLabel>
      <div className="negotiation-conditions">
        {conditionOptions.map((condition) => (
          <label key={condition} className={record.conditions.includes(condition) ? 'selected' : ''}>
            <input
              type="checkbox"
              checked={record.conditions.includes(condition)}
              disabled={!record.conditions.includes(condition) && record.conditions.length >= 3}
              onChange={() => toggleCondition(condition)}
            />
            <span>{condition}</span>
          </label>
        ))}
      </div>

      {response && <FramedCard className={`negotiation-response response-${response}`} tone={response === 'walk_away' ? 'alert' : 'amber'}>
        <div><small>企业回应</small><b>{response === 'accept' ? '接受条件单' : response === 'counter' ? '提出一次性反提案' : response === 'delay' ? '等待 / 延期' : '拒绝并退出'}</b></div>
        <p>{responseText}</p>
        {response === 'counter' && <dl>
          <div><dt>要求财政支持</dt><dd>{record.counterFiscal} 点</dd></div>
          {record.counterTool && <div><dt>要求补充</dt><dd>{supportToolLabels[record.counterTool]}</dd></div>}
        </dl>}
      </FramedCard>}

      <div className="negotiation-summary">
        <span>当前条件单</span><b>{record.fiscalOffer} 点 · {totalCommitments} 项支持与条件</b>
      </div>

      {response === 'counter' ? (
        <ActionButton onClick={acceptCounter}>确认企业反提案</ActionButton>
      ) : response === 'accept' ? (
        <ActionButton onClick={() => canApply ? onApply(record) : onClose()}>
          {canApply ? '采用条件单并返回决策' : '保存协商纪要并返回'}
        </ActionButton>
      ) : (
        <ActionButton disabled={!canSubmit} onClick={submitOffer}>提交政府条件单</ActionButton>
      )}
      {record.submitted && response !== 'accept' && response !== 'counter' && <button className="negotiation-secondary" onClick={onClose}>保留协商结果并返回决策</button>}
    </FramedPanel>
  </>;
}
