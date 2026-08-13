import type { EnterpriseId, SupportTool } from './types';

export const stages = [
  { code: 'S1', date: '2007—2008', cutoff: '2008-09-30', label: '产业底座 · 逆周期项目出现', event: '全球信贷快速收紧', action: '首投与基础设施配套' },
  { code: 'S2', date: '2009—2011', cutoff: '2011-12-31', label: '扩产抉择 · 追加压力出现', event: '产业振兴政策与需求回暖', action: '追加、引链或拒绝' },
  { code: 'S3', date: '2012—2014', cutoff: '2014-12-31', label: '周期分化 · 重资产项目承压', event: '行业周期分化与资本收紧', action: '止损、重组或继续投入' },
  { code: 'S4', date: '2015—2016', cutoff: '2016-12-31', label: '长期下注 · 技术窗口形成', event: '战略性新兴产业政策窗口开启', action: '组合再平衡与长期投资' },
] as const;

export const enterprises = [
  {
    id: 'enterprise-a',
    code: 'A',
    alias: '远景显示',
    industry: '新型显示',
    background: '国内大型显示企业，拟建设新世代面板生产线。',
    product: '大尺寸 TFT-LCD 面板，面向家电与商用显示客户。',
    technology: '具备量产基础，新世代产线仍有良率爬坡风险。',
    finance: '金融危机下外部融资窗口快速收窄，资本金缺口较大。',
    execution: '跨区域项目经验较强，但建设周期和设备交付承压。',
    evidenceStatus: '部分验证',
    dataGap: '持续融资能力与新世代产线量产兑现仍缺少直接证据。',
    investment: '总投资约 175 亿元',
    cycle: '建设与爬坡约 24–30 个月',
    request: 42,
    requestedTools: ['investment', 'infrastructure', 'financing'] as SupportTool[],
    districtId: 'xinzhan',
    position: { x: 0.57, y: 0.34 },
    negotiation: {
      representative: '华东区域项目负责人',
      opening: '我们愿意把新世代产线放在合肥，但设备订金窗口正在收紧，需要政府尽快明确资本金与厂务配套。',
      ask: { equity: 35, subsidy: 8, land: 20, financing: 25, infrastructure: 15 },
      bottomLine: '资本覆盖不能低于申请额的 75%，且股权投资、基础设施配套至少落实一项。',
      criticalProposition: '企业是否具备经过验证的建线、融资和持续扩代能力？',
      verificationStatus: '部分验证',
      verificationQuestions: [
        { question: '请说明既有产线从建设到量产的兑现记录。', responseType: '部分披露', response: '企业提供了既有项目节点，但新世代产线的良率爬坡仍没有同口径证据。' },
        { question: '设备订金、企业自筹与后续融资分别如何落实？', responseType: '给出区间', response: '企业给出资本金覆盖区间，但要求政府先明确首期投入与融资协调方式。' },
        { question: '若量产延期，企业愿意接受哪些追加与退出约束？', responseType: '交换条件', response: '企业接受分期拨付，但要求基础设施配套不因量产延期而中止。' },
      ],
    },
    reveal: '合肥第 6 代显示面板项目（演示映射）',
  },
  {
    id: 'enterprise-b',
    code: 'B',
    alias: '曙光能源',
    industry: '新能源',
    background: '成长型新能源企业，希望在合肥建设电池材料与组件基地。',
    product: '薄膜电池及配套组件，市场增速高但路线竞争激烈。',
    technology: '中试指标领先，规模化良率与设备稳定性尚未验证。',
    finance: '现金储备一般，估值较高，对地方补贴依赖明显。',
    execution: '核心团队技术强，重资产项目交付履历偏少。',
    evidenceStatus: '未验证',
    dataGap: '母公司现金、再融资能力与持续运营资金来源尚未穿透。',
    investment: '总投资约 96 亿元',
    cycle: '建设与验证约 18–24 个月',
    request: 34,
    requestedTools: ['investment', 'talent', 'supplyChain'] as SupportTool[],
    districtId: 'gaoxin',
    position: { x: 0.42, y: 0.57 },
    negotiation: {
      representative: '创始团队融资负责人',
      opening: '技术团队可以整体迁入，但我们需要地方资金承担首条量产线的验证风险，并协助锁定本地供应商。',
      ask: { equity: 26, subsidy: 10, land: 12, financing: 18, infrastructure: 8 },
      bottomLine: '首期支持需覆盖申请额的 70%，并提供人才或产业链协同。',
      criticalProposition: '母公司能否在价格下降和高负债下持续提供运营资金、采购信用与技术人员？',
      verificationStatus: '未验证',
      verificationQuestions: [
        { question: '请披露母公司未来四个季度的运营资金来源。', responseType: '给出区间', response: '企业只提供可用资金区间，未披露已落实授信与受限资金的完整口径。' },
        { question: '若产品价格继续下跌，谁承担现金缺口？', responseType: '拒绝披露', response: '企业以融资安排尚未完成为由拒绝给出明确兜底主体。' },
        { question: '核心技术和采购团队能否持续驻场？', responseType: '交换条件', response: '企业承诺核心团队驻场，但要求先落实人才支持和本地供应商导入。' },
      ],
    },
    reveal: '新能源成长企业（合成原型）',
  },
  {
    id: 'enterprise-c',
    code: 'C',
    alias: '精微装备',
    industry: '集成电路装备',
    background: '小型硬科技企业，申请建设关键工艺装备研发与试制中心。',
    product: '面向晶圆制造环节的国产工艺装备与验证服务。',
    technology: '技术壁垒高，样机可用，但客户验证周期长。',
    finance: '资金需求相对小，订单确认慢，现金跑道有限。',
    execution: '团队研发能力强，量产和供应链组织能力仍需补齐。',
    evidenceStatus: '部分验证',
    dataGap: '客户验证、知识产权路径和长期资本尚未形成闭环。',
    investment: '总投资约 38 亿元',
    cycle: '研发验证约 30–36 个月',
    request: 26,
    requestedTools: ['talent', 'supplyChain', 'financing'] as SupportTool[],
    districtId: 'jingkai',
    position: { x: 0.68, y: 0.64 },
    negotiation: {
      representative: '首席技术官兼项目负责人',
      opening: '我们不需要一次性建设大工厂，最关键的是维持研发团队，并获得本地客户共同验证的机会。',
      ask: { equity: 18, subsidy: 4, land: 6, financing: 12, infrastructure: 5 },
      bottomLine: '资金可分期，但必须落实人才支持或产业链验证资源。',
      criticalProposition: '技术团队、知识产权路径和长期资本能否按阶段形成闭环？',
      verificationStatus: '部分验证',
      verificationQuestions: [
        { question: '样机验证由哪些客户和里程碑共同确认？', responseType: '部分披露', response: '企业确认已有客户参与验证，但商业保密限制了客户名称与完整测试结果的披露。' },
        { question: '核心知识产权是否具备清晰、可持续的实施路径？', responseType: '给出区间', response: '企业提供了专利与授权数量区间，部分关键工艺仍处于共同开发状态。' },
        { question: '长期研发资金不足时，企业将优先保留什么？', responseType: '完整披露', response: '企业明确将优先保留核心研发团队与样机验证，延后重资产量产投入。' },
      ],
    },
    reveal: '集成电路装备企业（合成原型）',
  },
] as const;

export const supportToolLabels: Record<SupportTool, string> = {
  investment: '股权投资',
  infrastructure: '基础设施配套',
  talent: '人才支持',
  supplyChain: '产业链招商',
  financing: '融资协调',
};

export const agentLabels = {
  fiscal: '财政部门',
  industry: '经信部门',
  technology: '科技部门',
  market: '发改部门',
} as const;

export const jointReviewSummaries = {
  'enterprise-a': {
    consensus: '项目与合肥家电制造基础具有较强协同，具备逆周期进入价值。',
    disagreement: '财政追加暴露与新世代产线的量产兑现风险。',
    unresolved: '企业是否具备经过验证的建线、融资和持续扩代能力？',
    recommendation: '有条件支持：分期投入，并绑定融资与量产里程碑。',
  },
  'enterprise-b': {
    consensus: '行业仍有增长空间，但项目对地方资金与外部融资依赖较强。',
    disagreement: '高景气扩产机会能否覆盖技术路线和母公司现金风险。',
    unresolved: '母公司能否持续提供运营资金、采购信用与技术人员？',
    recommendation: '暂缓承诺：先核验母公司现金与再融资能力。',
  },
  'enterprise-c': {
    consensus: '项目具备战略补位价值，单次财政投入相对可控。',
    disagreement: '长期技术价值与客户验证、商业化周期之间的张力。',
    unresolved: '技术团队、知识产权路径和长期资本能否按阶段形成闭环？',
    recommendation: '分期支持：以客户验证和技术里程碑触发后续投入。',
  },
} as const;

export const agentReports: Record<EnterpriseId, Record<keyof typeof agentLabels, { stance: string; text: string }>> = {
  'enterprise-a': {
    fiscal: { stance: '有条件支持', text: '首期投入可承受，但设备到厂后存在较大的追加资本压力。' },
    industry: { stance: '强协同', text: '与合肥家电制造基础高度匹配，可带动玻璃、模组和物流环节。' },
    technology: { stance: '中等把握', text: '量产经验成立，但新世代产线的良率爬坡不可跳过。' },
    market: { stance: '逆周期窗口', text: '需求下行压低短期回报，也可能降低设备与产能进入成本。' },
  },
  'enterprise-b': {
    fiscal: { stance: '谨慎', text: '补贴诉求偏高，若技术路线切换，沉没成本难以回收。' },
    industry: { stance: '中等协同', text: '本地制造能力可承接组件，但上游材料基础仍弱。' },
    technology: { stance: '分歧较大', text: '中试指标不错，规模化设备稳定性缺少连续证据。' },
    market: { stance: '高波动', text: '行业增长快，但路线、补贴与价格都处在快速变化期。' },
  },
  'enterprise-c': {
    fiscal: { stance: '可承受', text: '单次投入较小，但回报周期长，需要设置客户验证里程碑。' },
    industry: { stance: '战略补位', text: '短期本地客户少，长期可补足半导体产业链关键环节。' },
    technology: { stance: '技术可取', text: '研发团队较强，主要缺口是量产工程与客户共同验证。' },
    market: { stance: '耐心资本', text: '进口替代空间存在，但订单释放慢，不适合用短周期 KPI 衡量。' },
  },
};

export function getEnterprise(id: EnterpriseId) {
  return enterprises.find((enterprise) => enterprise.id === id)!;
}
