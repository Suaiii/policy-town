export type RunId = 'A' | 'B';
export type BuildingId = 'GOV' | 'A' | 'B' | 'C' | 'D';
export type SkillType = 'traditional' | 'ai';

type FlowNode = BuildingId | 'entrants' | 'market' | 'unemployed' | 'exited';
type FirmSnapshot = {
  firm_id: Exclude<BuildingId, 'GOV'>; layoff_batches: number[]; layoff_formal: number;
  channel_outsource: number; channel_transfer: number; hiring_campus: number;
  hiring_social: number; reasoning: string;
};
type WorkerSnapshot = {
  worker_id: string; firm_id?: Exclude<BuildingId, 'GOV'>; action?: string; target?: FlowNode;
  reasoning: string; hesitation: string; cohort_weight: number; cohort_share: number; cohort_label: string;
};
type FlowSnapshot = { from: FlowNode; to: FlowNode; count: number; skill: SkillType };
export type Snapshot = {
  run_id: RunId; round: number; policy: { active: boolean; policy_text: string; compromise_log: unknown[] };
  firms: FirmSnapshot[]; workers: WorkerSnapshot[]; flows: FlowSnapshot[];
  metrics: { employment_total: number; unemployment_rate: number; hidden_unemployment: number };
};

export type BuildingState = { id: BuildingId; hiringLightOn: boolean; headcount: number; stress: 0 | 1 | 2; banner?: string };
export type CrowdFlow = { from: string; to: string; people: number; sprites: number; skill: SkillType; blocked: boolean };
export type ActorState = { id: string; kind: 'gov' | 'firm' | 'worker'; routeTo: string; bubble?: string; cohortWeight?: number; cohortShare?: number; cohortLabel?: string };
export type TownEvent = { type: 'policy' | 'queue19' | 'lightOff' | 'blocked' | 'exit' | 'compromise'; text: string; focus?: BuildingId | 'market' | 'exit' };
export type RoundFeed = { runId: RunId; round: number; buildings: BuildingState[]; crowdFlows: CrowdFlow[]; actors: ActorState[]; events: TownEvent[]; headline: { employment: number; unemploymentRate: number; hidden: number } };

const modules = import.meta.glob('../../../../data/run_*/round_*.json', { eager: true }) as Record<string, { default?: Snapshot } & Snapshot>;
const snapshotIndex = new Map<string, Snapshot>();
Object.entries(modules).forEach(([path, module]) => {
  const match = path.match(/run_([AB])\/round_(\d+)\.json$/);
  if (match) snapshotIndex.set(`${match[1]}-${match[2]}`, module.default ?? module);
});

const firstSentence = (text = '') => (text.trim() || '本轮无事发生。').split(/[。！？]/)[0].slice(0, 40);
const firm = (snapshot: Snapshot, id: Exclude<BuildingId, 'GOV'>) => snapshot.firms.find((item) => item.firm_id === id)!;
const hiring = (snapshot: Snapshot, id: Exclude<BuildingId, 'GOV'>) => { const item = firm(snapshot, id); return item.hiring_campus + item.hiring_social; };
const INITIAL_HEADCOUNT: Record<Exclude<BuildingId, 'GOV'>, number> = { A: 4000, B: 1500, C: 2200, D: 800 };
function headcountAt(run: RunId, round: number, id: Exclude<BuildingId, 'GOV'>) {
  let count = INITIAL_HEADCOUNT[id];
  for (let current = 1; current <= round; current += 1) {
    const item = getSnapshot(run, current);
    count += item.flows.filter((flow) => flow.to === id).reduce((sum, flow) => sum + flow.count, 0);
    count -= item.flows.filter((flow) => flow.from === id).reduce((sum, flow) => sum + flow.count, 0);
  }
  return count;
}

export function buildFeed(snapshot: Snapshot, prev?: Snapshot): RoundFeed {
  const baseline = getSnapshot(snapshot.run_id, 2);
  const ids: Exclude<BuildingId, 'GOV'>[] = ['A', 'B', 'C', 'D'];
  const buildings: BuildingState[] = [{ id: 'GOV', hiringLightOn: true, headcount: 0, stress: 0 }];
  ids.forEach((id) => {
    const item = firm(snapshot, id);
    const churn = item.layoff_formal + item.channel_outsource + item.channel_transfer;
    let banner: string | undefined;
    if (id === 'C') {
      const marketToC = snapshot.flows.filter((flow) => flow.from === 'market' && flow.to === 'C').reduce((sum, flow) => sum + flow.count, 0);
      if (marketToC < item.hiring_social / 2) banner = '急聘';
    }
    const threshold = snapshot.policy.active ? 20 : 999;
    if (id === 'A' && item.layoff_batches.filter((n) => n >= threshold - 2 && n < threshold).length >= 2) banner = '分批调整';
    buildings.push({ id, hiringLightOn: hiring(snapshot, id) >= hiring(baseline, id) * 0.65, headcount: headcountAt(snapshot.run_id, snapshot.round, id), stress: churn > 60 ? 2 : churn > 20 ? 1 : 0, banner });
  });

  const crowdFlows: CrowdFlow[] = snapshot.flows.map((flow) => ({ from: flow.from, to: flow.to, people: flow.count, sprites: Math.max(1, Math.round(flow.count / 20)), skill: flow.skill, blocked: false }));
  const cFirm = firm(snapshot, 'C');
  const cFilled = snapshot.flows.filter((flow) => flow.from === 'market' && flow.to === 'C').reduce((sum, flow) => sum + flow.count, 0);
  const tradSurplus = snapshot.flows.filter((flow) => flow.from === 'market' && flow.to === 'unemployed' && flow.skill === 'traditional').reduce((sum, flow) => sum + flow.count, 0);
  if (cFirm.hiring_social > cFilled && tradSurplus > 0) crowdFlows.push({ from: 'market', to: 'C', people: Math.min(cFirm.hiring_social - cFilled, tradSurplus), sprites: Math.max(1, Math.round(Math.min(cFirm.hiring_social - cFilled, tradSurplus) / 20)), skill: 'traditional', blocked: true });

  const deptNames = ['人社', '财政', '产业', '监管'];
  const actors: ActorState[] = deptNames.map((name) => ({ id: `GOV_${name}`, kind: 'gov', routeTo: 'GOV', bubble: snapshot.policy.active ? firstSentence(snapshot.policy.policy_text) : undefined }));
  actors.push(...ids.map((id) => ({ id: `FIRM_${id}`, kind: 'firm' as const, routeTo: id, bubble: firstSentence(firm(snapshot, id).reasoning) })));
  actors.push(...snapshot.workers.map((worker) => ({ id: worker.worker_id, kind: 'worker' as const, routeTo: worker.action === 'exit_labor_force' ? 'exit' : (worker.target ?? worker.firm_id ?? 'market'), bubble: firstSentence(worker.hesitation || worker.reasoning), cohortWeight: worker.cohort_weight, cohortShare: worker.cohort_share, cohortLabel: worker.cohort_label })));

  const events: TownEvent[] = [];
  if (snapshot.policy.active && !prev?.policy.active) events.push({ type: 'policy', text: firstSentence(snapshot.policy.policy_text), focus: 'GOV' });
  if (snapshot.policy.compromise_log.length) events.push({ type: 'compromise', text: '人社要 N+3，财政说预算不够，最后 N+2。', focus: 'GOV' });
  if (snapshot.firms.some((item) => item.layoff_batches.filter((n) => n === 19).length >= 4)) events.push({ type: 'queue19', text: 'A 厂门口排成四队，每队 19 人。', focus: 'A' });
  const bNow = buildings.find((item) => item.id === 'B')!;
  const bPrev = prev ? buildFeed(prev).buildings.find((item) => item.id === 'B') : undefined;
  if (!bNow.hiringLightOn && bPrev?.hiringLightOn) events.push({ type: 'lightOff', text: 'B 厂停止扩招。', focus: 'B' });
  if (crowdFlows.some((flow) => flow.blocked)) events.push({ type: 'blocked', text: '一群人走到 C 厂门口，被挡了回来。', focus: 'C' });
  if (snapshot.workers.some((worker) => worker.action === 'exit_labor_force')) events.push({ type: 'exit', text: '有人离开了这座城市。', focus: 'exit' });
  return { runId: snapshot.run_id, round: snapshot.round, buildings, crowdFlows, actors, events, headline: { employment: snapshot.metrics.employment_total, unemploymentRate: snapshot.metrics.unemployment_rate, hidden: snapshot.metrics.hidden_unemployment } };
}

export function getSnapshot(run: RunId, round: number): Snapshot {
  const snapshot = snapshotIndex.get(`${run}-${round}`);
  if (!snapshot) throw new Error(`Missing snapshot ${run}-${round}`);
  return snapshot;
}

export function getFeed(run: RunId, round: number) { return buildFeed(getSnapshot(run, round), round > 1 ? getSnapshot(run, round - 1) : undefined); }
export const allSnapshots = snapshotIndex;
