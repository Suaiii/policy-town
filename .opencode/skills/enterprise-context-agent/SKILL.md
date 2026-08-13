---
name: enterprise-context-agent
description: 企业 Context Agent。当用户需要为某家企业组建推演所需的企业 Context（技术/财务/执行/人/证据），或说"组建 XX 企业 Agent"、"查一下 XX 企业的背景"、"为 XX 企业配置 RAG 库"时使用。支持上市公司（巨潮资讯自动拉取年报/公告）与非上市企业（用户提供基本信息+公开信息检索）。流程：获取企业信息 → 下载数据 → 抽离简化为五维企业档案 → 生成关键未穿透命题 → 写入政企 RAG 库。
---

# 企业 Context Agent

为「政府产业投资决策沙盘」组建某企业的 Context。输出进入政企 RAG 库，供企业 Agent 与关系网使用。

## 输入

- 企业名称（必填）
- 可选：股票代码（上市公司）、行业、所在地、总投资额、官网/产品描述等基本信息
- 可选：目标年份（默认最近完整年；推演场景可指定，如 2008）

## 输出（RAG 库）

写入 `data/context/<enterprise>/`：

| 文件 | 内容 |
|---|---|
| `enterprise-context.json` | 五维结构化档案（schema 见下） |
| `enterprise-context.md` | 人读摘要（供企业 Agent prompt 拼接） |
| `sources/` | 下载的年报/公告 PDF |
| `manifest.json` | 来源登记（source_id/url/sha256/confidence） |

## 数据通道（已验证，按企业类型选择）

### 通道 1：上市公司 → 巨潮资讯（已验证可用）

公告查询接口（POST，返回公告 PDF 直链）：

```bash
curl -s -A "Mozilla/5.0" -X POST "http://www.cninfo.com.cn/new/hisAnnouncement/query" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "pageNum=1&pageSize=20&column=szse&tabName=fulltext&stock=<代码>,<orgId>"
```

- 需要先解析企业 → 证券代码/orgId（`search` 接口：`http://www.cninfo.com.cn/new/information/topSearch/query?keyWord=<企业名>`，⚠️ 2026-08 实测该接口 500，备选：直接询问用户股票代码，或用公告查询接口的 searchkey 参数）
- 筛选 `年度报告` / `招股说明书` / `重大事项` 公告，PDF 直链：`http://static.cninfo.com.cn/finalpage/<日期>/<id>.PDF`
- 下载命令：`curl -s -A "Mozilla/5.0" -o sources/<企业>_<年份>年报.pdf "<PDF直链>"`

**PDF 内容提取**（二选一）：
1. 直接用 read 工具读取 PDF（opencode/LLM 可直接理解），从中抽取财务与经营数据
2. `pip3 install pdfplumber` 后用脚本提取指定页

### 通道 2：非上市公司 → 用户提供 + 公开检索

1. 让用户提供：行业、规模、产品、技术、融资情况、负责人、已知风险（有多少给多少，缺的明确标记）
2. 公开检索补充：搜索引擎（浏览器）、政府招投标公示、专利检索（`https://pss-system.cponline.cnipa.gov.cn/` 需交互）
3. 查不到的真实数据一律写 `evidence_gaps`，不编造

### 通道 3（可选）：央行金融报告/区域产业背景

从 `data/source_archive/local_context/fiscal/pbc_regional_finance/` 取该企业所在省的金融报告作行业环境背景。

## 抽离简化规则（原始数据 → 五维档案）

每维输出 `summary` + `evidence`（陈述+来源+可知时间）+ `verified` 状态：

| 维度 | 抽取内容 | verified 判定 |
|---|---|---|
| technology 技术 | 技术成熟度、产线/良率、专利、研发投入 | 有公告/年报证据=verified；区间披露=partial |
| finance 财务 | 营收、利润、现金、负债、融资能力 | 年报=verified；估算=partial |
| execution 执行 | 建设周期、项目节点、交付记录 | 公告里程碑=verified |
| people 人 | 负责人/实控人背景、管理层、关键人物风险 | 公开报道=partial |
| evidence 证据 | 披露了什么、拒绝披露什么、数据缺口 | 系统自产 |

关键产出：**关键未穿透命题**（critical_proposition）——基于数据缺口生成"最可能改变决策的那个问题"（呼应产品文档关键命题穿透），并给出验证状态。

## 输出 schema（enterprise-context.json）

```json
{
  "schema": "enterprise-context-v1",
  "enterprise": { "name": "", "stock_code": "", "listed": true, "industry": "", "region": "" },
  "generated_at": "ISO8601",
  "dimensions": {
    "technology": { "summary": "…", "verified": "verified|partial|unverified|conflicting", "evidence": [ { "statement": "…", "source_id": "", "available_at": "" } ] },
    "finance":    { "summary": "…", "verified": "…", "evidence": [] },
    "execution":  { "summary": "…", "verified": "…", "evidence": [] },
    "people":     { "summary": "…", "verified": "…", "evidence": [] },
    "evidence":   { "gaps": [], "disclosures": [] }
  },
  "critical_proposition": { "question": "…", "status": "unverified" },
  "sources": [ { "source_id": "", "title": "", "publisher": "", "url": "", "archived_path": "", "sha256": "", "confidence": "A|B|C" } ]
}
```

## 校验（交付前必须过）

1. 每维有 summary + verified；无证据维度写 `evidence.gaps` 并标 unverified
2. 每个 evidence.statement 有 source_id 且登记在 sources
3. critical_proposition 必须来自真实数据缺口（不是泛泛问题）
4. 上市公司：至少下载 1 份年报/公告 PDF 存档；下载失败必须报告（不静默跳过）
5. 完成后向用户报告：企业是否查到、下载了什么、抽离结果、数据缺口清单
