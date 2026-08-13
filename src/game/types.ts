export type Phase =
  | 'briefing'
  | 'applications'
  | 'analysis'
  | 'allocation'
  | 'response'
  | 'settlement'
  | 'feedback'
  | 'result';

export type CameraMode = 'table' | 'meeting' | 'panorama';

export type EnterpriseId = 'enterprise-a' | 'enterprise-b' | 'enterprise-c';

export type SupportTool =
  | 'investment'
  | 'infrastructure'
  | 'talent'
  | 'supplyChain'
  | 'financing';

export type EnterpriseAction =
  | '扩建并研发'
  | '延迟建设并融资'
  | '小步研发并等待'
  | '收缩项目'
  | '迁往外地';

export type EnterpriseMetrics = {
  cash: number;
  debt: number;
  progress: number;
  technology: number;
  capacity: number;
  orders: number;
  risk: number;
  employment: number;
};

export type EnterpriseState = {
  id: EnterpriseId;
  code: string;
  allocation: number;
  supportTools: SupportTool[];
  action?: EnterpriseAction;
  actionReason?: string;
  metrics: EnterpriseMetrics;
  builtProgress: number;
  lifecycle: 'active' | 'stalled' | 'exited';
  lastSettlementDelta: {
    progress: number;
    employment: number;
    logistics: number;
  };
  previousMetrics?: EnterpriseMetrics;
};

export type CityResources = {
  fiscal: number;
  committed: number;
  industry: number;
  supplyChain: number;
  talent: number;
  infrastructure: number;
  credibility: number;
};

export type RoundEvent = {
  title: string;
  description: string;
  effects: string[];
};

export type SimulationState = {
  phase: Phase;
  cameraMode: CameraMode;
  stageIndex: number;
  selectedEnterpriseId: EnterpriseId;
  enterprises: EnterpriseState[];
  resources: CityResources;
  event?: RoundEvent;
  roundFiscalStart: number;
  settlementRevision: number;
};
