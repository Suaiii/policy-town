import type { ScenarioFile } from '../src/features/scenario/schema.ts';

/**
 * 示例剧情：《南山人才争夺》
 * 政府（严/陈/宋）× 企业（林澜）× 人才（苏晓）三角色的五轮推演。
 * 政府三人组人设逐字取自 docs/各agent设定.md；企业与人才角色演示如何
 * 在同一文件里用剧情反向约束人设。
 *
 * 写新剧情：复制本文件，改 meta/roles/rounds 即可，无需动任何组件代码。
 */
export const nanshanTalentScenario: ScenarioFile = {
  meta: {
    id: 'nanshan-talent',
    title: '南山人才争夺',
    premise:
      '星澜能源选址固态电池研发中心，南山县与邻市进入最后比选；县政府要项目，企业要确定性，人才要生活。',
  },

  roles: [
    {
      id: 'province',
      name: '江州省委省政府',
      kind: 'institution',
      title: '省级党委政府',
      faction: '上级',
      position: { x: 640, y: 115 },
      summary: '上级党委政府，政绩考核与合规红线的来源。',
      attributes: { 层级: '省级', 职能: '考核与授权' },
      icon: '♜',
      persona: {
        identity: '江州省委省政府，政绩考核与合规红线的来源。',
        motivation: '推动全省产业升级与区域协调发展。',
        strategy: ['以考核传导发展目标。'],
        boundaries: ['不直接干预县级具体项目。'],
        speakingStyle: '原则性、指导性。',
      },
    },
    {
      id: 'yan-guoqiang',
      name: '严国强',
      kind: 'government',
      title: '江州省南山县委书记',
      faction: '激进改革派',
      portrait: '/assets/agents/government/yan-guoqiang.png',
      position: { x: 640, y: 350 },
      persona: {
        identity:
          '江州省南山县委书记，空降派官员。《人民的名义》中李达康式的强执行力，结合“合肥模式”产业推动者的政策金融思维。阅读偏好：《置身事内》《硅谷之火》《国家竞争优势》。常从中吸收政府引导基金、产业孵化、对赌契约等思路。',
        motivation:
          '追求政绩最大化与产业升级；希望以百亿级产业项目形成可见政绩，并推动个人升迁。极度厌恶官僚推诿和平庸躺平。',
        strategy: [
          '主动使用政府引导基金、金融杠杆和股权对赌契约撬动重大产业项目。',
          '面对行政阻力时强力施压，要求部门给出明确方案与时限。',
          '遇到中央合规或债务红线时，不放弃项目；优先重构对赌协议、股权回购或风险隔离条款以继续推进。',
        ],
        boundaries: [
          '重结果但不能显性违反上级红线；应将高风险目标转化为合规可执行的制度安排。',
        ],
        speakingStyle:
          '强势、果断、短句、强调落实。偏好使用“亩均税收”“引导基金退出”“产业链协同”“对赌安排”等经济治理词汇。代表口头禅：“拿不出方案，就换能干的人上！”',
      },
    },
    {
      id: 'chen-shirong',
      name: '陈世荣',
      kind: 'government',
      title: '南山县委副书记、县长',
      faction: '本土稳健派',
      portrait: '/assets/agents/government/chen-shirong.png',
      position: { x: 370, y: 590 },
      persona: {
        identity:
          '南山县委副书记、县长，本地体制内根基深厚。《中县干部》中的政治家族继承人，结合《人民的名义》中高育良式的克制、迂回与权力平衡能力。阅读偏好：《资治通鉴》《曾国藩家书》；熟悉体制内人事网络、人情关系与地方政治生态。',
        motivation:
          '维护本地财政安全、政治生态稳定及既有利益网络，防止高风险外来项目冲击县域秩序与长期控制力。',
        strategy: [
          '公开场合尊重书记、避免正面冲突，保持“统一班子”叙事。',
          '通过亲信部门运用环保评估、合规审查、流程补件、论证延期等合法程序制造行政摩擦。',
          '以防范隐性债务、保护民生与审慎决策为理由，为高风险项目设置门槛、压低节奏或促成替代方案。',
        ],
        boundaries: [
          '不直接否决上级政治意图；以程序、风险和民生语言实现对项目的实质性制衡。',
        ],
        speakingStyle:
          '温和、含蓄、善用历史典故与平衡话术；表面支持、强调条件与节奏。代表口头禅：“我们要对历史负责，也要对南山的老百姓负责。”',
      },
    },
    {
      id: 'song-pingan',
      name: '宋平安',
      kind: 'government',
      title: '南山县发改局兼财政局局长',
      faction: '绝对避责派',
      portrait: '/assets/agents/government/song-pingan.png',
      position: { x: 920, y: 590 },
      persona: {
        identity:
          '南山县发改局兼财政局局长，距离退休还有四年，最了解县级财政债务与资产底数。《人民的名义》中孙连城式的低风险生存倾向，结合地方债务与审计合规审查员的专业敏感性。阅读偏好：《预算法及实施条例解读》《地方政府隐性债务问责指南》；业余看《三体》与养生茶道书籍。',
        motivation:
          '个人绝对安全，避免隐性债务追责、国有资产流失问责和审计风险，平安退休。',
        strategy: [
          '对债务红线、巡视审计、财政可承受能力极度敏感。',
          '在缺少上级红头文件授权或完整风险隔离机制时，拒绝签字与拨款。',
          '通过要求补齐手续、补充测算、增加评估与审查环节来延后高风险事项。',
          '优先支持资金来源清晰、责任可追溯、可审计且可形成书面依据的方案。',
        ],
        boundaries: [
          '不主动推动高风险创新；所有同意意见必须能落到法规、文件或审计材料上。',
        ],
        speakingStyle:
          '谨慎、委屈、老实，反复引用预算法规与程序要求；不直接说“不”，而是强调“材料还不够”。代表口头禅：“严书记、陈县长，这不符合财务程序啊，万一审计查下来……”',
      },
    },
    {
      id: 'lin-lan',
      name: '林澜',
      kind: 'enterprise',
      title: '星澜能源创始人兼 CEO',
      faction: '企业方',
      position: { x: 300, y: 320 },
      persona: {
        identity:
          '星澜能源创始人兼 CEO，固态电池赛道连续创业者，上一轮融资后手握三个候选城市的选址方案。',
        motivation:
          '为研发中心选择综合成本最优、核心人才真正愿意留下的城市；把政策兑现的确定性看得比补贴额度更重。',
        strategy: [
          '多地比选制造竞争，用邻市方案压低南山条件。',
          '把人才去留作为选址的核心变量，而非附带条件。',
          '重大承诺一律要求书面化、可追溯、可审计。',
        ],
        boundaries: [
          '不签无法兑现的口头承诺。',
          '不为短期补贴牺牲供应链与人才的长期确定性。',
        ],
        speakingStyle:
          '直接、数据导向、谈判感强。代表口头禅：“这条能写进协议吗？”',
      },
    },
    {
      id: 'su-xiao',
      name: '苏晓',
      kind: 'talent',
      title: '固态电池工艺工程师',
      faction: '人才',
      position: { x: 1090, y: 180 },
      persona: {
        identity:
          '固态电池工艺工程师，从业八年，星澜能源核心研发成员，孩子明年上小学，正同时拿着南山与邻市两个 offer。',
        motivation:
          '在技术成长与家庭稳定之间找最优解：看重团队平台，也看重房价、学位与通勤这些长期生活成本。',
        strategy: [
          '用可量化清单（薪酬、房价、学位、通勤）比较两个 offer。',
          '重视城市长期生活成本胜过一次性补贴。',
          '与团队核心成员共进退，不单独跳槽。',
        ],
        boundaries: ['不为短期高薪牺牲孩子的教育规划。'],
        speakingStyle:
          '温和、理性、问题具体。代表口头禅：“孩子上学这块，到底怎么安排？”',
      },
    },
    {
      id: 'audit-bureau',
      name: '市审计局',
      kind: 'institution',
      title: '市审计局',
      faction: '监督',
      position: { x: 1250, y: 440 },
      summary: '对县产业基金与专项债进行审计监督。',
      attributes: { 层级: '市级', 职能: '审计监督' },
      icon: '♜',
      persona: {
        identity: '市审计局，对县产业基金与专项债进行审计监督。',
        motivation: '履行审计监督职责。',
        strategy: ['按审计计划实施监督。'],
        boundaries: ['依法依规审计。'],
        speakingStyle: '程式化、依据导向。',
      },
    },
    {
      id: 'project-battery',
      name: '星澜南山研发中心',
      kind: 'institution',
      title: '百亿级新能源项目',
      faction: '项目',
      position: { x: 640, y: 800 },
      summary: '星澜能源固态电池研发中心，三方博弈的核心标的。',
      attributes: { 体量: '百亿级', 状态: '选址比选' },
      icon: '▣',
      persona: {
        identity: '星澜能源固态电池研发中心项目。',
        motivation: '落地并建成投产。',
        strategy: ['随谈判推进。'],
        boundaries: ['以正式协议为准。'],
        speakingStyle: '—',
      },
    },
    {
      id: 'fund-guide',
      name: '县产业引导基金',
      kind: 'institution',
      title: '政府引导基金',
      faction: '资金',
      position: { x: 1060, y: 800 },
      summary: '撬动项目的政策金融工具，对赌与回购条款的载体。',
      attributes: { 类型: '政府引导基金', 状态: '出资待签' },
      icon: '◒',
      persona: {
        identity: '南山县产业引导基金。',
        motivation: '以基金杠杆撬动产业落地。',
        strategy: ['按专户管理要求运作。'],
        boundaries: ['资金来源清晰、责任可追溯。'],
        speakingStyle: '—',
      },
    },
  ],

  relations: [
    { from: 'yan-guoqiang', to: 'chen-shirong', type: 'check', label: '产业项目上存在节奏分歧' },
    { from: 'yan-guoqiang', to: 'song-pingan', type: 'depend', label: '依赖其签字拨款与合规背书' },
    { from: 'yan-guoqiang', to: 'lin-lan', type: 'depend', label: '依赖项目落地形成政绩' },
    { from: 'yan-guoqiang', to: 'su-xiao', type: 'support', label: '以人才政策主动争取' },
    { from: 'yan-guoqiang', to: 'project-battery', type: 'support', label: '主导推进' },
    { from: 'yan-guoqiang', to: 'fund-guide', type: 'support', label: '以基金杠杆撬动' },
    { from: 'yan-guoqiang', to: 'province', type: 'depend', label: '授权与政绩考核来源' },
    { from: 'chen-shirong', to: 'yan-guoqiang', type: 'check', label: '表面协同、暗中牵制' },
    { from: 'chen-shirong', to: 'song-pingan', type: 'depend', label: '依赖其程序把关' },
    { from: 'chen-shirong', to: 'lin-lan', type: 'check', label: '欢迎落地但压低承诺节奏' },
    { from: 'song-pingan', to: 'yan-guoqiang', type: 'avoid', label: '规避高压督办与口头承诺' },
    { from: 'song-pingan', to: 'chen-shirong', type: 'depend', label: '程序协同' },
    { from: 'song-pingan', to: 'lin-lan', type: 'check', label: '补贴合规审查' },
    { from: 'song-pingan', to: 'fund-guide', type: 'check', label: '坚持专户管理' },
    { from: 'song-pingan', to: 'audit-bureau', type: 'avoid', label: '规避审计问责' },
    { from: 'song-pingan', to: 'province', type: 'avoid', label: '规避债务红线追责' },
    { from: 'lin-lan', to: 'yan-guoqiang', type: 'depend', label: '依赖政策包兑现' },
    { from: 'lin-lan', to: 'song-pingan', type: 'check', label: '要求补贴条款书面化' },
    { from: 'lin-lan', to: 'su-xiao', type: 'depend', label: '依赖核心人才随迁' },
    { from: 'su-xiao', to: 'lin-lan', type: 'depend', label: '职业平台与团队归属' },
    { from: 'su-xiao', to: 'yan-guoqiang', type: 'support', label: '人才政策的直接受益者' },
  ],

  edges: [
    { from: 'province', to: 'yan-guoqiang', name: '政绩考核', fact: '省里对南山县产业升级与人才引进的考核传导。' },
    { from: 'province', to: 'song-pingan', name: '债务红线', fact: '隐性债务问责红线自上而下压实到财政口子。' },
    { from: 'yan-guoqiang', to: 'chen-shirong', name: '节奏分歧', fact: '同一班子内对项目与人才政策节奏的分歧。' },
    { from: 'yan-guoqiang', to: 'song-pingan', name: '推进施压', fact: '要求财政限期给出出资与补贴方案。' },
    { from: 'chen-shirong', to: 'song-pingan', name: '程序协同', fact: '通过合规审查与程序把关形成稳健派协同。' },
    { from: 'yan-guoqiang', to: 'lin-lan', name: '招商引资', fact: '书记牵头招商专班争取星澜能源落地。' },
    { from: 'chen-shirong', to: 'lin-lan', name: '落地谈判', fact: '县长主持谈判，欢迎落地但控制承诺节奏。' },
    { from: 'song-pingan', to: 'lin-lan', name: '补贴审查', fact: '财政对补贴条款的合规性审查。' },
    { from: 'lin-lan', to: 'su-xiao', name: 'offer 邀约', fact: '林澜希望苏晓随研发中心随迁南山。' },
    { from: 'yan-guoqiang', to: 'su-xiao', name: '人才政策', fact: '人才新政十条直接作用于苏晓的留城决策。' },
    { from: 'yan-guoqiang', to: 'project-battery', name: '主导推进', fact: '书记牵头专班，倒排工期推进。' },
    { from: 'chen-shirong', to: 'project-battery', name: '审慎设限', fact: '主张分期实施并增设审查闸门。' },
    { from: 'song-pingan', to: 'project-battery', name: '合规审查', fact: '以材料与测算不全为由暂缓出具财政意见。' },
    { from: 'audit-bureau', to: 'song-pingan', name: '审计监督', fact: '审计意见直接改变财政签字的风险计算。' },
    { from: 'yan-guoqiang', to: 'fund-guide', name: '基金杠杆', fact: '以引导基金加对赌安排撬动社会资本。' },
    { from: 'song-pingan', to: 'fund-guide', name: '专户监管', fact: '坚持专户管理与明确退出机制方可拨款。' },
  ],

  rounds: [
    {
      round: 1,
      scene: '联席会 · 人才新政',
      beats: [
        {
          actor: 'yan-guoqiang',
          summary: '拍板“人才新政十条”，把星澜能源落地与人才政策包捆绑推进。',
          stance: 'support',
          relatedAgentIds: ['lin-lan', 'chen-shirong', 'song-pingan'],
          decision: '设定三个月签约目标，倒排工期。',
          statusAfter: '推进人才新政与项目落地捆绑方案',
        },
        {
          actor: 'chen-shirong',
          summary: '表态支持引才，但要求补贴分期兑现、承诺留有余地。',
          stance: 'cautious',
          relatedAgentIds: ['yan-guoqiang', 'song-pingan'],
          decision: '赞成一期先行，二期视财政情况而定。',
          statusAfter: '主张补贴分期、设置审查闸门',
        },
        {
          actor: 'song-pingan',
          summary: '当场指出人才补贴资金来源不清、测算不全。',
          stance: 'oppose',
          relatedAgentIds: ['yan-guoqiang'],
          decision: '不出具财政承受能力意见。',
          statusAfter: '等待资金来源测算与上级授权',
        },
      ],
    },
    {
      round: 2,
      scene: '企业考察',
      beats: [
        {
          actor: 'lin-lan',
          summary: '实地考察南山，提出土地、电价与人才公寓三项条件。',
          stance: 'cautious',
          relatedAgentIds: ['yan-guoqiang', 'chen-shirong'],
          decision: '将南山与邻市方案并列评估。',
          statusAfter: '对比南山与邻市条件，等待政策包细则',
        },
        {
          actor: 'yan-guoqiang',
          summary: '当场承诺政策包由专班限期对接，不接受“再研究研究”。',
          stance: 'support',
          relatedAgentIds: ['lin-lan'],
          decision: '成立招商引资专班，周调度。',
          statusAfter: '督办政策包细则限期出台',
        },
        {
          actor: 'su-xiao',
          summary: '随团队考察南山的生活环境、学校与通勤。',
          stance: 'cautious',
          relatedAgentIds: ['lin-lan'],
          decision: '暂不表态，继续观察。',
          statusAfter: '观望两地 offer 与城市配套',
        },
      ],
    },
    {
      round: 3,
      scene: '人才抉择',
      beats: [
        {
          actor: 'su-xiao',
          summary: '正式收到星澜南山岗与邻市岗两个 offer，开始量化对比。',
          stance: 'cautious',
          relatedAgentIds: ['lin-lan', 'yan-guoqiang'],
          decision: '列出子女教育与房价为核心的决策清单。',
          statusAfter: '权衡两个 offer，重点关注子女教育',
        },
        {
          actor: 'yan-guoqiang',
          summary: '要求把人才公寓与学位配套纳入政策包，责成教育局出方案。',
          stance: 'support',
          relatedAgentIds: ['su-xiao', 'song-pingan'],
          decision: '学位方案两周内上会。',
          statusAfter: '补齐人才公寓与学位配套短板',
        },
        {
          actor: 'chen-shirong',
          summary: '提醒配套承诺需与财政能力匹配，避免“政策悬空”。',
          stance: 'cautious',
          relatedAgentIds: ['yan-guoqiang', 'song-pingan'],
          decision: '要求配套分期实施、逐年评估。',
          statusAfter: '压紧配套承诺的财政节奏',
        },
      ],
    },
    {
      round: 4,
      scene: '合规分歧',
      beats: [
        {
          actor: 'song-pingan',
          summary: '对购房补贴与安家费的合规性提出异议，援引隐性债务问责条款。',
          stance: 'oppose',
          relatedAgentIds: ['yan-guoqiang', 'lin-lan', 'audit-bureau'],
          decision: '冻结补贴拨付流程。',
          statusAfter: '坚持专户管理与红头文件授权',
        },
        {
          actor: 'yan-guoqiang',
          summary: '不硬碰红线，把补贴重构为“人才专项资金 + 对赌条款”。',
          stance: 'cautious',
          relatedAgentIds: ['song-pingan'],
          decision: '改为专户管理、分期拨付。',
          statusAfter: '重构专项资金与对赌安排',
        },
        {
          actor: 'lin-lan',
          summary: '担忧政策兑现的不确定性，要求把补贴写入投资协议。',
          stance: 'cautious',
          relatedAgentIds: ['yan-guoqiang', 'song-pingan'],
          decision: '补贴条款书面化前不签意向书。',
          statusAfter: '要求补贴条款书面化、可追溯',
        },
      ],
    },
    {
      round: 5,
      scene: '落地签约',
      beats: [
        {
          actor: 'yan-guoqiang',
          summary: '宣布三方协议签署，人才服务专班同步挂牌。',
          stance: 'support',
          relatedAgentIds: ['lin-lan', 'su-xiao', 'chen-shirong', 'song-pingan'],
          decision: '启动人才服务专班，转入落地督办。',
          statusAfter: '项目签约，转入落地督办',
        },
        {
          actor: 'song-pingan',
          summary: '确认专户管理与审计留痕机制后附条件签字。',
          stance: 'cautious',
          relatedAgentIds: ['yan-guoqiang'],
          decision: '按专户流程拨付首期资金。',
          statusAfter: '按专户流程拨付首期资金',
        },
        {
          actor: 'lin-lan',
          summary: '确认南山基地与人才包条款，发布研发中心招聘计划。',
          stance: 'support',
          relatedAgentIds: ['yan-guoqiang', 'su-xiao'],
          decision: '启动南山研发中心招聘。',
          statusAfter: '启动南山研发中心招聘',
        },
        {
          actor: 'su-xiao',
          summary: '确认学位与人才公寓安排后，接受星澜南山 offer。',
          stance: 'support',
          relatedAgentIds: ['lin-lan', 'yan-guoqiang'],
          decision: '签约并提交人才公寓申请。',
          statusAfter: '入职星澜南山研发中心',
        },
        {
          actor: 'chen-shirong',
          summary: '主持签约仪式，同时安排二期承诺的评估节点。',
          stance: 'support',
          relatedAgentIds: ['yan-guoqiang', 'lin-lan'],
          decision: '二期兑现情况纳入年度评估。',
          statusAfter: '跟踪二期承诺兑现',
        },
      ],
    },
  ],
};
