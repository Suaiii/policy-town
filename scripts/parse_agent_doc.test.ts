import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parseAgentDoc, toDescriptions, generateTs } from './parse_agent_doc.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 标签式（docx 经 textutil 转换后的真实形态：编号与前文粘连、字段用 [Tag]）
const TAG_STYLE_DOC = `1. 严国强（县委书记·激进改革派）
[原型] 《人民的名义》李达康 + 《置身事内》合肥模式推手
[阅读偏好] 独爱《置身事内》、《硅谷之火》。
[Role] 你是江州省南山县委书记严国强。你是一位极具政治抱负的空降派官员。
[Motivation] 追求政绩最大化与产业升级，极度厌恶官僚推诿和平庸躺平。
[Strategy]
1. 主动运用金融杠杆与对赌契约撬动大项目。
2. 面对行政阻力时强力施压。
[Style] 语言强势、果断。口头禅：“拿不出方案，就换能干的人上！”常以"防范隐性债务"为由设卡 2. 陈世荣（县长·本土关系网掌门）
[原型] 《中县干部》政治家族继承人
[Role] 你是南山县委副书记、县长陈世荣。你在本地体制内根深蒂固。
[Motivation] 防范高风险外来项目破坏本地财政与家族利益。
[Strategy]
1. 表面对书记表达高度尊重，绝不正面冲突。
[Style] 语言温和、太极。口头禅 3. 宋平安（财政局长·绝对避责派）
[Role] 你是南山县发改局兼财政局局长宋平安。你还有4年退休。
[Motivation] 个人绝对安全，坚决防止"隐性债务追责"。
[Style] 语言谨慎、委屈、老实。
`;

describe('parseAgentDoc：bullet 式（docs/各agent设定.md）', () => {
  const doc = readFileSync(resolve(REPO_ROOT, 'docs/各agent设定.md'), 'utf-8');
  const parsed = parseAgentDoc(doc);
  const { descriptions, warnings, errors } = toDescriptions(parsed);

  test('解析出三位政府角色', () => {
    expect(errors).toEqual([]);
    expect(descriptions.map((d) => d.name)).toEqual(['严国强', '陈世荣', '宋平安']);
  });

  test('非角色小节（角色关系与联席会张力）被跳过', () => {
    expect(descriptions.some((d) => d.name.includes('关系'))).toBe(false);
    expect(warnings.length).toBeGreaterThanOrEqual(0);
  });

  test('identity 包含职务、原型、策略与语言风格，plan 为动机', () => {
    const yan = descriptions[0];
    expect(yan.identity).toContain('江州省南山县委书记');
    expect(yan.identity).toContain('原型气质');
    expect(yan.identity).toContain('决策策略');
    expect(yan.identity).toContain('拿不出方案，就换能干的人上');
    expect(yan.plan).toContain('政绩最大化');
  });

  test('皮肤按 f1-f8 轮询分配', () => {
    expect(descriptions.map((d) => d.character)).toEqual(['f1', 'f2', 'f3']);
  });
});

describe('parseAgentDoc：标签式（docx 转换文本）', () => {
  const parsed = parseAgentDoc(TAG_STYLE_DOC);
  const { descriptions, errors } = toDescriptions(parsed);

  test('解析出三位角色，含编号粘连/丢失的小节', () => {
    expect(errors).toEqual([]);
    expect(descriptions.map((d) => d.name)).toEqual(['严国强', '陈世荣', '宋平安']);
  });

  test('[Role]/[Motivation]/[Strategy]/[Style] 别名正确映射', () => {
    const yan = descriptions[0];
    expect(yan.identity).toContain('空降派官员');
    expect(yan.identity).toContain('决策策略');
    expect(yan.identity).toContain('金融杠杆');
    expect(yan.plan).toContain('政绩最大化');
    expect(descriptions[2].identity).toContain('语言风格');
  });
});

describe('校验与生成', () => {
  test('缺少动机时报错并指出角色', () => {
    const parsed = parseAgentDoc(`## 测试员｜测试\n- **职务**：测试\n- **语言风格**：无\n`);
    const { errors } = toDescriptions(parsed);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('测试员');
    expect(errors[0]).toContain('动机');
  });

  test('无字段小节跳过而非报错', () => {
    const parsed = parseAgentDoc(`## 角色关系总览\n| A | B |\n| --- | --- |\n\n## ok｜t\n- **动机**：活下去\n`);
    const { descriptions, warnings, errors } = toDescriptions(parsed);
    expect(errors).toEqual([]);
    expect(descriptions).toHaveLength(1);
    expect(warnings.some((w) => w.includes('角色关系总览'))).toBe(true);
  });

  test('生成的 TS 包含 CustomDescriptions 且字符串被正确转义', () => {
    const parsed = parseAgentDoc(TAG_STYLE_DOC);
    const { descriptions } = toDescriptions(parsed);
    const ts = generateTs(descriptions, 'fixture.md');
    expect(ts).toContain('export const CustomDescriptions');
    expect(ts).toContain('name: "严国强"');
    // JSON.stringify 转义了换行与引号，模板字面量不会被破坏
    expect(ts).not.toContain('`');
  });

  test('世界观小节注入所有角色的 identity', () => {
    const parsed = parseAgentDoc(
      `## 世界观\n江州省南山县，产业升级关键期。\n\n## a甲｜x\n- **动机**：mo\n- **身份**：id\n\n## b乙｜y\n- **动机**：mo\n`,
    );
    const { descriptions, errors } = toDescriptions(parsed);
    expect(errors).toEqual([]);
    expect(descriptions).toHaveLength(2);
    for (const d of descriptions) {
      expect(d.identity).toContain('世界观背景：江州省南山县');
    }
  });
});
