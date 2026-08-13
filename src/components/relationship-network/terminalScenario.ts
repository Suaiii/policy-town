import type { EnterpriseMemory, EnterpriseProfile } from './enterpriseProfileAdapter';
import type { RelationshipViewModel } from './graphAdapter';

type StageNote = [summary: string, stance: EnterpriseMemory['stance'], relatedId: string];
const stageNames = ['S1 · 起步核验', 'S2 · 组合配置', 'S3 · 压力传导', 'S4 · 终局结算'] as const;

function memories(notes: StageNote[], agentKind: 'government' | 'company', outcome: '统筹' | '成功' | '失败'): EnterpriseMemory[] {
  const governmentMeasures = ['建立核验问题、财政红线与证据清单。', '提交分期条件单，明确触发条件与责任主体。', '复核风险阈值，更新暂停、退出或保供安排。', '冻结阶段快照，归档承诺账并输出复盘口径。'];
  const companyMeasures = ['提交可核验材料，并将不确定项写入披露清单。', '回应政府条件，确认反提案边界与下一步行动。', '披露外部冲击，调整建设、研发、融资或收缩策略。', '确认履约、暂停或退出状态，并归档终局材料。'];
  const results = outcome === '成功'
    ? ['进入条件化观察。', '形成可执行协同。', '在压力下保持关键节点。', '形成正向产业贡献。']
    : outcome === '失败'
      ? ['风险被记录并进入观察。', '未满足追加前提。', '触发暂停或退出安排。', '失败机制被完整保留。']
      : ['形成跨部门核验口径。', '形成组合配置与条件约束。', '完成风险隔离和资源重配。', '终局结论可全链路追溯。'];
  return notes.map(([summary, stance, relatedId], index) => ({
    sequence: index + 1, at: stageNames[index], summary, stance, relatedId,
    preview: summary.split('，')[0],
    detail: `Mock 推演依据：${summary} 系统将该事实、判断与未穿透项写入阶段记忆，供下一阶段的条件配置和关系更新读取。`,
    measures: (agentKind === 'government' ? governmentMeasures : companyMeasures)[index],
    interaction: `与 ${relatedId} 完成结构化互动：交换可见事实、说明条件边界，并将回应结果写入双方关系记录。`,
    result: results[index],
  }));
}

function agent(
  id: string, name: string, industry: string, role: string, agentKind: 'government' | 'company', outcome: '统筹' | '成功' | '失败',
  prompt: EnterpriseProfile['systemPrompt'], notes: StageNote[],
): EnterpriseProfile {
  return { id, name, industry, role, agentKind, outcome, requestedToolLabels: [], systemPrompt: prompt, memories: memories(notes, agentKind, outcome) };
}

const prompt = (identity: string, motivation: string, strategy: string[], boundaries: string[], speakingStyle: string) => ({ identity, motivation, strategy, boundaries, speakingStyle });

export const terminalAgentProfiles: Record<string, EnterpriseProfile> = {
  gov: agent('gov', '合肥市政府', '城市产业投资', '政府统筹 Agent · 终局组合配置者', 'government', '统筹', prompt('统筹全市产业投资、财政纪律与公共价值的决策主体。', '在有限财政池内形成可履约、可退出、可带动产业协同的组合。', ['要求四部门独立研判', '采用里程碑分期拨付', '以承诺账约束政企双方'], ['不以未来信息倒推', '不替代企业市场融资', '不清空失败项目的退出记录'], '以结构化条件和可追溯理由表达决策。'), [
    ['冻结信息截止日，六家企业分批进入核验；设定财政上限与一次反提案规则。', 'cautious', 'gov-finance'],
    ['采纳 A/B 的链式支持方案，C/D/E/F 转入条件化观察与风险隔离。', 'support', 'gov-miit'],
    ['对未达里程碑项目执行暂停、土地回收或退出，资源重新回流至可履约组合。', 'cautious', 'gov-drc'],
    ['A/B 履约形成产业牵引，四项失败已按规则止损；终局快照冻结。', 'support', 'enterprise-a'],
  ]),
  'gov-finance': agent('gov-finance', '财政部门', '财政纪律', '财政 Agent · 资金与承诺账负责人', 'government', '统筹', prompt('负责财政池、分期拨付、资金证明与退出条款的财政 Agent。', '控制承诺暴露，确保公共资金不替代市场融资。', ['核验首期资金证明', '设置拨付上限', '触发暂停与退出条款'], ['不突破财政池', '不对未达条件项目追加', '所有例外均写入承诺账'], '以余额、敞口、条件与机会成本陈述。'), [
    ['六家企业总诉求超过本轮财政池，要求所有项目提交资金证明与首期上限。', 'cautious', 'gov'],
    ['C 的融资承诺延期，否决其追加申请；A/B 仅在节点完成后拨付。', 'oppose', 'enterprise-c'],
    ['D/E/F 触发预警，冻结未触发资金并核算退出机会成本。', 'cautious', 'enterprise-d'],
    ['A/B 承诺履约，C/D/E/F 未形成新增敞口；财政守恒审计完成。', 'support', 'enterprise-b'],
  ]),
  'gov-miit': agent('gov-miit', '经济和信息化部门', '产业协同', '经信 Agent · 订单与供应链协调者', 'government', '统筹', prompt('负责产业链匹配、订单导入、园区协同与供应压力识别的经信 Agent。', '以真实协同替代孤立扩产，提升链主项目的本地带动。', ['核验订单约束', '促成 A/B 应用协同', '识别低效配套并退出'], ['不将意向订单视为履约', '不为无需求项目扩张背书'], '围绕订单、产线、供给缺口和协同效益发言。'), [
    ['发现显示链上游材料与制造装备存在断点，要求以供应协同作为支持前提。', 'cautious', 'enterprise-a'],
    ['A/B 提交可验证采购与验证计划，建议政府采用链主—补链组合配置。', 'support', 'enterprise-b'],
    ['E 客户导入滞后、F 时效未兑现，建议停止以配套名义继续扩张。', 'oppose', 'enterprise-f'],
    ['A/B 的链式采购稳定，形成两条本地补缺关系与下一轮筛选口径。', 'support', 'gov'],
  ]),
  'gov-science': agent('gov-science', '科学技术部门', '技术核验', '科技 Agent · 技术里程碑审查者', 'government', '统筹', prompt('负责技术可行性、样品验证、良率、研发协同与人才约束的科技 Agent。', '把技术主张转换为可验证里程碑，避免概念性补贴。', ['发起一次性技术核验', '锁定样品与良率门槛', '沉淀联合研发记录'], ['缺少证据时明确标注', '不降低关键技术红线'], '区分已证实事实、技术判断和需验证假设。'), [
    ['D/E 的关键参数缺少第三方验证，设定样品、良率与稳定性门槛。', 'cautious', 'enterprise-d'],
    ['B 通过 A 的应用验证，D 仅部分披露；支持 B、维持 D 的技术红线。', 'support', 'enterprise-b'],
    ['D 稳定性与 E 良率均未达标，终止后续技术补贴并保留缺失声明。', 'oppose', 'enterprise-e'],
    ['B 的联合验证转化为稳定材料供应，技术核验链归档用于终局复盘。', 'support', 'enterprise-b'],
  ]),
  'gov-drc': agent('gov-drc', '发展和改革部门', '规划与承载', '发改 Agent · 土地能耗与公共价值审查者', 'government', '统筹', prompt('负责长期规划、土地能耗、基础设施承载与公共价值的发改 Agent。', '使项目规模、建设节奏与园区承载能力保持一致。', ['执行土地分期', '核验建设节点', '回收低效资源'], ['不一次性锁定土地能耗', '不让沉没资源挤出有效项目'], '用承载、触发条件、回收与公共价值口径说明。'), [
    ['园区土地、能耗和基础设施有限，要求每个项目提交阶段建设节奏。', 'cautious', 'gov'],
    ['A/B 排期与承载匹配，按里程碑配置地块、人才公寓与基础设施。', 'support', 'enterprise-a'],
    ['C 未开工、F 未达到时效承诺，回收预留地块并同步退出资源。', 'oppose', 'enterprise-f'],
    ['A/B 与园区承载保持匹配，释放资源纳入下一轮规划储备。', 'support', 'gov'],
  ]),
  'enterprise-a': agent('enterprise-a', 'A · 远景显示', '新型显示', '企业 Agent · 显示面板链主', 'company', '成功', prompt('新型显示链主企业，负责重资产产线建设与订单履约。', '在分期条件下完成投产，以本地材料配套降低断供风险。', ['披露资金与采购计划', '锁定 B 的材料验证', '优先保障核心工序'], ['接受审计与首期上限', '不得在未触发节点前要求追加'], '以建设、订单、供应和履约状态汇报。'), [
    ['提交资金证明、采购意向和分期建设计划，接受财政审计条款。', 'support', 'gov-finance'],
    ['B 材料验证通过，启动首期建设并签订本地采购框架。', 'support', 'enterprise-b'],
    ['市场波动造成供应压力，调整产线节奏并锁定核心材料保供。', 'cautious', 'gov-miit'],
    ['达成投产与订单节点，扩大采购并完成政府承诺履约确认。', 'support', 'gov'],
  ]),
  'enterprise-b': agent('enterprise-b', 'B · 显示材料', '新型显示材料', '企业 Agent · 上游补链项目', 'company', '成功', prompt('新型显示关键材料企业，负责应用验证、良率提升与稳定供货。', '将技术验证转化为 A 的长期采购与可控扩产。', ['完成样品验证', '按订单扩产', '稳定关键材料交付'], ['不在未通过验证前扩张', '原料压力时优先保证交付'], '以样品、良率、交付和研发节点汇报。'), [
    ['同意以样品、良率和客户验证作为支持条件，向 A 提供首批材料。', 'cautious', 'gov-science'],
    ['应用测试通过，签署供应框架并启动小规模扩产。', 'support', 'enterprise-a'],
    ['原料成本上升，优化工艺并暂缓非核心扩张以守住交付。', 'cautious', 'gov-finance'],
    ['稳定供货并完成扩产节点，新增本地研发与人才岗位。', 'support', 'gov'],
  ]),
  'enterprise-c': agent('enterprise-c', 'C · 精微装备', '智能制造装备', '企业 Agent · 融资失败项目', 'company', '失败', prompt('智能制造装备项目，需完成融资闭环与开工节点。', '争取条件支持以撬动市场融资和首批设备订单。', ['披露融资进度', '补充订单约束', '按条件开工'], ['不可伪造资金证明', '融资未到位时必须进入退出安排'], '明确披露融资、订单和建设的不确定性。'), [
    ['提交装备方案但融资未落地，请求提高首期投入并承诺资金到位日。', 'cautious', 'gov-finance'],
    ['融资延期且订单不具约束力，提出延后里程碑反提案。', 'cautious', 'gov-miit'],
    ['资金证明未补齐、建设未开工，确认释放预留地块并触发退出。', 'oppose', 'gov-drc'],
    ['融资闭环未完成，解除承诺且未形成新增财政敞口。', 'neutral', 'gov'],
  ]),
  'enterprise-d': agent('enterprise-d', 'D · 曙光储能', '新能源储能', '企业 Agent · 技术失败项目', 'company', '失败', prompt('储能系统项目，需以稳定样品和第三方测试证明可规模化能力。', '争取研发观察资格并完成关键技术验证。', ['披露样品数据', '完成循环稳定性测试', '通过里程碑后再扩张'], ['不得以概念替代验证', '关键参数缺失时不得触发资金'], '清楚区分已测数据与研发假设。'), [
    ['展示样机但稳定性数据不足，承诺第三方测试与关键参数披露。', 'cautious', 'gov-science'],
    ['仅完成部分披露，申请降低技术条件；政府未接受反提案。', 'oppose', 'gov'],
    ['样品循环稳定性未达阈值，停止中试扩张并确认研发支持终止。', 'oppose', 'gov-science'],
    ['未形成可规模化验证结果，技术资料归档且不再占用本局资源。', 'neutral', 'gov'],
  ]),
  'enterprise-e': agent('enterprise-e', 'E · 功率芯片', '功率半导体', '企业 Agent · 市场失败项目', 'company', '失败', prompt('功率半导体项目，需以客户导入和产能利用率验证扩产合理性。', '在需求窗口内完成客户转化并控制现金压力。', ['核验约束性订单', '按需求释放产能', '市场回落时主动收缩'], ['意向订单不可替代合同', '利用率不足时不得扩产'], '如实说明订单转化、需求和产能使用情况。'), [
    ['提交扩产计划与客户名单，接受经信部门对订单约束的核验。', 'cautious', 'gov-miit'],
    ['核心客户未转化为约束性订单，提前释放建设指标的请求被拒绝。', 'oppose', 'gov-finance'],
    ['下游需求回落，主动缩减采购与建设节奏以避免现金压力。', 'cautious', 'gov-miit'],
    ['订单未恢复至里程碑水平，终止扩产承诺并退出财政与园区资源。', 'neutral', 'gov'],
  ]),
  'enterprise-f': agent('enterprise-f', 'F · 产业物流', '产业物流服务', '企业 Agent · 履约失败项目', 'company', '失败', prompt('园区产业物流项目，需兑现物流时效与服务覆盖承诺。', '以设施建设和服务能力获得园区配套。', ['提交服务时效方案', '按节点建设物流设施', '未达标时配合退出'], ['不得在未履约时要求追加配套', '违约后必须接受资源回收'], '以服务覆盖、时效和设施进度汇报。'), [
    ['承诺建设园区物流节点，申请基础设施与土地配套。', 'cautious', 'gov-drc'],
    ['设施建设慢于承诺，提出延后服务节点；未获得后续配套。', 'oppose', 'gov-miit'],
    ['核心时效指标未达成，停止扩张并与政府核算违约条款。', 'oppose', 'gov-finance'],
    ['未兑现关键服务承诺，园区资源回收，承诺状态标记为 breached。', 'neutral', 'gov'],
  ]),
};

const node = (uuid: string, name: string, kind: 'Government' | 'Project', x: number, y: number, icon: string, code?: string) => ({ uuid, name, kind, x, y, summary: terminalAgentProfiles[uuid].role, icon, code });
const edge = (uuid: string, source_node_uuid: string, target_node_uuid: string, fact: string, color: string, lineStyle: 'solid' | 'dashed' | 'dotted' = 'solid') => ({ uuid, source_node_uuid, target_node_uuid, name: fact, fact_type: fact, fact, color, lineStyle });

export const terminalRelationshipModel: RelationshipViewModel = {
  revision: 44,
  nodes: [
    node('gov', '合肥市政府', 'Government', 410, 450, '▦'), node('gov-finance', '财政部门', 'Government', 610, 160, '▦'), node('gov-miit', '经信部门', 'Government', 760, 320, '▦'), node('gov-science', '科技部门', 'Government', 760, 580, '▦'), node('gov-drc', '发改部门', 'Government', 610, 740, '▦'),
    node('enterprise-a', '远景显示', 'Project', 1130, 105, '◇', 'A'), node('enterprise-b', '显示材料', 'Project', 1320, 245, '◇', 'B'), node('enterprise-c', '精微装备', 'Project', 1170, 410, '◇', 'C'), node('enterprise-d', '曙光储能', 'Project', 1320, 535, '◇', 'D'), node('enterprise-e', '功率芯片', 'Project', 1140, 675, '◇', 'E'), node('enterprise-f', '产业物流', 'Project', 1300, 810, '◇', 'F'),
  ],
  edges: [
    edge('g1', 'gov', 'gov-finance', '财政纪律授权', '#5b6cff'), edge('g2', 'gov', 'gov-miit', '产业协同委托', '#34d399'), edge('g3', 'gov', 'gov-science', '技术核验委托', '#60a5fa'), edge('g4', 'gov', 'gov-drc', '规划承载委托', '#fbbf24'),
    edge('f1', 'gov-finance', 'enterprise-a', '分期拨付', '#34d399'), edge('f2', 'gov-finance', 'enterprise-b', '资金上限', '#fbbf24'), edge('f3', 'gov-finance', 'enterprise-c', '融资核验', '#fbbf24', 'dashed'), edge('f4', 'gov-finance', 'enterprise-d', '暂停追加', '#f87171', 'dashed'), edge('f5', 'gov-finance', 'enterprise-e', '订单触发', '#fbbf24', 'dashed'), edge('f6', 'gov-finance', 'enterprise-f', '违约核算', '#f87171', 'dashed'),
    edge('m1', 'gov-miit', 'enterprise-a', '链主订单导入', '#34d399'), edge('m2', 'gov-miit', 'enterprise-b', '补链协同', '#34d399'), edge('m3', 'gov-miit', 'enterprise-c', '订单质询', '#fbbf24', 'dashed'), edge('m4', 'gov-miit', 'enterprise-e', '需求预警', '#fbbf24', 'dashed'), edge('m5', 'gov-miit', 'enterprise-f', '时效评估', '#fbbf24', 'dashed'),
    edge('s1', 'gov-science', 'enterprise-b', '应用验证', '#60a5fa'), edge('s2', 'gov-science', 'enterprise-d', '技术里程碑', '#f87171', 'dashed'), edge('s3', 'gov-science', 'enterprise-e', '良率核验', '#f87171', 'dashed'),
    edge('r1', 'gov-drc', 'enterprise-a', '土地分期', '#fbbf24'), edge('r2', 'gov-drc', 'enterprise-b', '人才配套', '#34d399'), edge('r3', 'gov-drc', 'enterprise-c', '地块回收', '#f87171', 'dashed'), edge('r4', 'gov-drc', 'enterprise-f', '园区退出', '#f87171', 'dashed'),
    edge('c1', 'enterprise-a', 'enterprise-b', '材料采购与验证', '#34d399'), edge('c2', 'enterprise-b', 'enterprise-a', '稳定材料供应', '#34d399'), edge('c3', 'enterprise-a', 'enterprise-f', '物流时效压力', '#fbbf24', 'dotted'), edge('c4', 'enterprise-c', 'enterprise-a', '装备方案意向', '#60a5fa', 'dotted'), edge('c5', 'enterprise-d', 'enterprise-e', '储能元件需求', '#fbbf24', 'dotted'), edge('c6', 'enterprise-e', 'enterprise-d', '订单落空传导', '#f87171', 'dashed'),
    edge('o1', 'enterprise-a', 'gov', '承诺履约', '#34d399'), edge('o2', 'enterprise-b', 'gov', '扩产履约', '#34d399'), edge('o3', 'enterprise-c', 'gov', '融资承诺失效', '#f87171', 'dashed'), edge('o4', 'enterprise-d', 'gov', '技术承诺未达', '#f87171', 'dashed'), edge('o5', 'enterprise-e', 'gov', '订单承诺失效', '#f87171', 'dashed'), edge('o6', 'enterprise-f', 'gov', '服务承诺违约', '#f87171', 'dashed'),
  ],
};
