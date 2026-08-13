export type MockEventTone = 'policy' | 'market' | 'city' | 'nature' | 'media';

export type MockEventItem = {
  id: string;
  time: string;
  category: string;
  tone: MockEventTone;
  headline: string;
  brief: string;
  source: string;
  impact: string;
};

export const MOCK_EVENT_FEED: MockEventItem[] = [
  {
    id: 'mock-policy-001',
    time: '16:20',
    category: '政策快讯',
    tone: 'policy',
    headline: '扩大内需议题进入密集研判',
    brief: '基建、产业承接与就业稳定被同时纳入地方逆周期政策讨论。',
    source: '政策观察台 · MOCK',
    impact: '财政窗口',
  },
  {
    id: 'mock-market-002',
    time: '14:10',
    category: '市场监测',
    tone: 'market',
    headline: '面板价格继续下探',
    brief: '终端需求转弱，设备采购议价空间扩大，但项目现金流压力同步上升。',
    source: '产业行情台 · MOCK',
    impact: '需求下行',
  },
  {
    id: 'mock-city-003',
    time: '11:45',
    category: '城市现场',
    tone: 'city',
    headline: '重点项目联审节奏加快',
    brief: '用地、供电与施工组织开始并联核验，城市配套能力成为共同约束。',
    source: '城市运行台 · MOCK',
    impact: '配套承压',
  },
  {
    id: 'mock-nature-004',
    time: '09:30',
    category: '自然事件',
    tone: 'nature',
    headline: '连续降雨扰动短途物流',
    brief: '部分施工与运输窗口缩短，项目交付节奏可能出现短期波动。',
    source: '区域事件台 · MOCK',
    impact: '短期扰动',
  },
  {
    id: 'mock-media-005',
    time: '08:15',
    category: '媒体观察',
    tone: 'media',
    headline: '逆周期产业投资引发讨论',
    brief: '舆论关注公共资金是否应在需求低谷期提前锁定产业机会。',
    source: '城市媒体席 · MOCK',
    impact: '公众预期',
  },
];
