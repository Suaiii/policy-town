export type Phase =
  | 'setup'
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
  conditions: string[];
  negotiationFinalized: boolean;
  action?: EnterpriseAction;
  actionReason?: string;
  metrics: EnterpriseMetrics;
  builtProgress: number;
  lifecycle: 'active' | 'stalled' | 'exited';
  physicalAssets: PhysicalAssetLedger;
  lastSettlementDelta: {
    progress: number;
    employment: number;
    logistics: number;
  };
  previousMetrics?: EnterpriseMetrics;
};

export type PhysicalAssetStatus = 'planned' | 'building' | 'complete' | 'paused' | 'abandoned';

export type PhysicalAssetRole = 'main' | 'support' | 'warehouse' | 'utility';

export type PhysicalAssetState = {
  id: string;
  role: PhysicalAssetRole;
  slotIndex: number;
  currentLevel: number;
  targetLevel: number;
  workProgress: number;
  status: PhysicalAssetStatus;
  createdStage: string;
  decisionId: string;
};

export type PhysicalAssetLedger = {
  developmentUnitCost: number;
  qualifiedCapital: number;
  capitalRemainder: number;
  overflowUnits: number;
  constructionDelta: number;
  processedDecisionIds: string[];
  assets: PhysicalAssetState[];
};

export type FactCard = {
  id: string;
  title: string;
  value: string;
  source: string;
  observedAt: string;
  availableAt: string;
  visibility: 'visible' | 'unavailable';
  quality: 'A' | 'B' | 'scenario';
};

export type JudgmentCard = {
  id: string;
  enterpriseId: EnterpriseId;
  belief: string;
  confidence: number;
  changedBecause: string;
};

export type CommitmentCard = {
  id: string;
  enterpriseId: EnterpriseId;
  stageCode: string;
  promise: string;
  status: 'pending' | 'fulfilled' | 'delayed' | 'breached' | 'insufficient-evidence';
  trigger: string;
};

export type StageSnapshot = {
  stageCode: string;
  decisionId: string;
  contextHash: string;
  resources: CityResources;
  enterprises: EnterpriseState[];
  facts: FactCard[];
  judgments: JudgmentCard[];
  commitments: CommitmentCard[];
};

export type DepartmentMemo = {
  department: 'fiscal' | 'industry' | 'technology' | 'market';
  initialStance: string;
  finalStance: string;
  claims: string[];
  evidenceIds: string[];
  changedBecause?: string;
};

export type DirectedChallenge = {
  from: DepartmentMemo['department'];
  to: DepartmentMemo['department'];
  claim: string;
  response: string;
  changedStance: boolean;
};

export type JointReviewOption = {
  id: string;
  title: string;
  allocationPolicy: string;
  conditions: string[];
  minorityOpinion?: string;
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
  schemaVersion: 2;
  runId: string;
  setupRandomSeed: number;
  setupStartStage: number;
  setupEnterpriseIds: EnterpriseId[];
  phase: Phase;
  cameraMode: CameraMode;
  stageIndex: number;
  selectedEnterpriseId: EnterpriseId;
  enterprises: EnterpriseState[];
  resources: CityResources;
  event?: RoundEvent;
  roundFiscalStart: number;
  settlementRevision: number;
  facts: FactCard[];
  judgments: JudgmentCard[];
  commitments: CommitmentCard[];
  stageSnapshots: StageSnapshot[];
};
