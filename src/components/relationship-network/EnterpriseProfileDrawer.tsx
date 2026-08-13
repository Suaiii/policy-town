import { useEffect, useState } from 'react';
import type { EnterpriseProfile } from './enterpriseProfileAdapter';
import './enterprise-profile-drawer.css';

const stanceLabel = { support: '支持', oppose: '反对', cautious: '谨慎', neutral: '记录' } as const;

export function EnterpriseProfileDrawer({ profile, onClose }: { profile: EnterpriseProfile; onClose: () => void }) {
  const [promptOpen, setPromptOpen] = useState(false);
  useEffect(() => setPromptOpen(false), [profile.id]);
  return <aside className="rn-profile-drawer" role="dialog" aria-label={`${profile.name} 企业档案`}>
    <header>
      <div className="rn-agent-card" aria-label={`${profile.name} 企业代表`}>
        <div className="rn-agent-card-avatar" aria-hidden="true"><i /><b>{profile.name.slice(0, 1)}</b></div>
        <div><small>ENTERPRISE AGENT · {profile.id.replace('enterprise-', '').toUpperCase()}</small><strong>{profile.industry}代表</strong><span>项目沟通与决策响应</span></div>
      </div>
      <div className="rn-profile-heading"><small>ENTERPRISE PROFILE</small><h2>{profile.name}</h2><p>{profile.role}</p></div>
      <button type="button" onClick={onClose} aria-label="关闭企业档案">×</button>
    </header>
    <div className="rn-profile-body">
      <section className="rn-profile-summary"><span>{profile.industry}</span><p>申请支持：{profile.requestedToolLabels.join('、')}</p></section>
      <section>
        <button className="rn-profile-toggle" type="button" onClick={() => setPromptOpen((open) => !open)} aria-expanded={promptOpen}>
          <b>系统提示词</b><span>{promptOpen ? '收起 ▴' : '查看企业设定 ▾'}</span>
        </button>
        {promptOpen && <dl className="rn-system-prompt">
          <div><dt>身份</dt><dd>{profile.systemPrompt.identity}</dd></div>
          <div><dt>动机</dt><dd>{profile.systemPrompt.motivation}</dd></div>
          <div><dt>策略</dt><dd><ol>{profile.systemPrompt.strategy.map((item) => <li key={item}>{item}</li>)}</ol></dd></div>
          <div><dt>行为边界</dt><dd><ul>{profile.systemPrompt.boundaries.map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
          <div><dt>语言风格</dt><dd>{profile.systemPrompt.speakingStyle}</dd></div>
        </dl>}
      </section>
      <section className="rn-memory-timeline"><h3>长期记忆 <small>来自桥接事件</small></h3>
        {profile.memories.length === 0 ? <p className="rn-empty-memory">暂无相关记忆，推演决策会在刷新后同步。</p> : <ol>{profile.memories.map((memory) => <li key={memory.sequence}>
          <div><b>#{memory.sequence} · {memory.at}</b><span className={`rn-stance-${memory.stance}`}>{stanceLabel[memory.stance]}</span></div><p>{memory.summary}</p>
        </li>)}</ol>}
      </section>
    </div>
  </aside>;
}
