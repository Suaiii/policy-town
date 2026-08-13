import { getEnterprise, stages } from './scenario';
import type { SimulationState } from './types';

export type MockEventTone = 'policy' | 'enterprise' | 'city' | 'audit' | 'media';
export type MockEventType = 'policy' | 'enterprise_action' | 'city_update' | 'audit' | 'media';

export type MockEventItem = {
  id: string;
  logicalTime: string;
  availableAt: string;
  cutoffDate: string;
  category: string;
  tone: MockEventTone;
  type: MockEventType;
  priority: 'normal' | 'important';
  visibility: 'player_visible';
  headline: string;
  brief: string;
  source: string;
  impact: string;
  evidenceIds: string[];
};

/**
 * Structured layout mock. Dates are game dates and every item is explicitly
 * scenario data; this feed must never be presented as a live real-world source.
 */
export function createMockEventFeed(state: SimulationState): MockEventItem[] {
  const stage = stages[state.stageIndex];
  const common = {
    logicalTime: stage.cutoff,
    availableAt: stage.cutoff,
    cutoffDate: stage.cutoff,
    visibility: 'player_visible' as const,
  };

  const enterpriseEvents: MockEventItem[] = state.phase === 'applications'
    ? state.enterprises.map((enterprise) => {
      const profile = getEnterprise(enterprise.id);
      return {
        ...common,
        id: `${stage.code}-P03-${enterprise.code}`,
        category: '企业动态',
        tone: 'enterprise',
        type: 'enterprise_action',
        priority: profile.evidenceStatus === '未验证' ? 'important' : 'normal',
        headline: `企业 ${enterprise.code} 已提交匿名项目申请`,
        brief: `${profile.industry}项目申请 ${profile.request} 点；当前证据状态为“${profile.evidenceStatus}”。`,
        source: 'P03 申请登记 · 演示情景数据',
        impact: `${profile.request} 点申请`,
        evidenceIds: [`${stage.code}-P03-${enterprise.code}-APPLICATION`],
      };
    })
    : [];

  const feed: MockEventItem[] = [
    ...enterpriseEvents,
    {
      ...common,
      id: `${stage.code}-policy-window`,
      category: '政策通告',
      tone: 'policy',
      type: 'policy',
      priority: 'normal',
      headline: stage.event,
      brief: `当前阶段任务为“${stage.action}”，仅使用 ${stage.cutoff} 及以前可知的情景材料。`,
      source: '阶段 Context Builder · 演示索引',
      impact: '阶段约束',
      evidenceIds: [`${stage.code}-CONTEXT-01`],
    },
    {
      ...common,
      id: `${stage.code}-city-capacity`,
      category: '城市播报',
      tone: 'city',
      type: 'city_update',
      priority: 'important',
      headline: `城市基础设施余度为 ${state.resources.infrastructure} 点`,
      brief: `当前人才供给 ${state.resources.talent} 点、产业链完备度 ${state.resources.supplyChain} 点；这些城市状态会约束项目承载能力。`,
      source: '规则引擎初始快照 · 演示数据',
      impact: '城市承载力',
      evidenceIds: [`${stage.code}-CITY-CAPACITY`],
    },
    {
      ...common,
      id: `${stage.code}-audit-boundary`,
      category: '证据审计',
      tone: 'audit',
      type: 'audit',
      priority: 'important',
      headline: '截止日后材料已从玩家视图过滤',
      brief: '未来标题、摘要、结果与具体公开日期均不进入当前播报和企业申请材料。',
      source: '信息边界审计 · 系统规则',
      impact: '未来封存',
      evidenceIds: [`${stage.code}-VISIBILITY-AUDIT`],
    },
    {
      ...common,
      id: `${stage.code}-fiscal-exposure`,
      category: '财政提示',
      tone: 'city',
      type: 'city_update',
      priority: state.resources.fiscal < 35 ? 'important' : 'normal',
      headline: `财政余度 ${state.resources.fiscal} 点，已承诺资本 ${state.resources.committed} 点`,
      brief: '财政余度与存量承诺共同决定本轮可用空间；支持当前项目会压缩其他项目及后续阶段的选择。',
      source: '财政资源账 · 演示数据',
      impact: '组合机会成本',
      evidenceIds: [`${stage.code}-FISCAL-EXPOSURE`],
    },
    {
      ...common,
      id: `${stage.code}-portfolio-reminder`,
      category: '组合观察',
      tone: 'media',
      type: 'media',
      priority: 'normal',
      headline: `${state.enterprises.length} 家匿名项目仍在同一资源池中竞争`,
      brief: '本条为推演状态提示，不提供项目成败结论；未获支持的企业仍会融资、等待、收缩或迁移。',
      source: '推演编排器 · 情景状态提示',
      impact: '项目组合',
      evidenceIds: [`${stage.code}-PORTFOLIO-REMINDER`],
    },
  ];

  return feed.slice(0, 6);
}
