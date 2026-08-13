---
name: gov-context-agent
description: 政府 Context 获取 Agent。当用户需要为某省/某市政府组建推演所需的本地 Context（财政/产业/要素/金融等维度），或说"组建 XX 政府 Agent"、"获取 XX 市政府的 Context"、"政府本地条件数据"时使用。流程：下载该地统计公报与金融报告 → 抽离简化为六维政府 Context → 写入政企 RAG 库。下载通道均已验证可用，失败时按 fallback 处理。
---

# 政府 Context 获取 Agent

为「通用政府产业投资决策沙盘」组建某省/市的政府 Context。输出进入政企 RAG 库，供政府 Agent 与关系网使用。

## 输入

- 必填：省份或城市（如"安徽省""合肥市"）
- 可选：关注维度（默认全部）、目标年份范围（默认近 3 年，推演场景按 S1-S4 时间线可指定 2007-2016）

## 输出（RAG 库）

写入 `data/context/<city>/`：

| 文件 | 内容 |
|---|---|
| `government-context.json` | 六维结构化 Context（schema 见下） |
| `government-context.md` | 人读摘要（供 Agent prompt 拼接） |
| `sources/` | 下载的原始文件（按 source_archive 规范归档） |
| `manifest.json` | 来源登记（source_id/url/sha256/confidence） |

## 数据通道（已验证，按顺序尝试）

### 通道 1：省/市统计公报（HTML 正文，可靠）

各省统计局官网 → 统计公报栏目 → 详情页正文。已验证两省模式：

- 安徽：`https://tjj.ah.gov.cn/ssah/qwfbjd/tjgb/sjtjgb/index.html`（历史年份分页：`tjj.ah.gov.cn/public/column/6981?type=4&action=list`）
- 江苏：`https://tj.jiangsu.gov.cn/col/col85764/index.html`

未知省份先探测：`curl -sL "https://<省统计局域名>/"` 找"统计公报"链接，或浏览器（ego-browser）搜索 `site:<省统计局域名> 统计公报`。

抓取命令：
```bash
curl -s -A "Mozilla/5.0 ..." "https://<公报详情页URL>" -o data/context/<city>/sources/<省>2023年统计公报.html
```

### 通道 2：央行区域金融报告（PDF，已批量归档）

本地归档：`data/source_archive/local_context/fiscal/pbc_regional_finance/`（2007-2022 主报告 + 31 省 2023 摘要，含 manifest+SHA-256）。直接读取该省摘要 PDF（或整本报告对应章节）即可，无需重新下载。缺失年份可补下：

```bash
curl -s -A "Mozilla/5.0" -e "https://www.pbc.gov.cn/" -o <目标>.pdf "https://www.pbc.gov.cn/zhengcehuobisi/125207/125227/125960/126049/<年份ID>/<hash>/<时间戳>.pdf"
```

### 通道 3：七普数据（已归档）

`data/source_archive/local_context/factor/census2020/`（分省人口/年龄/教育/城乡）。

### 通道 4（可选，需人工）：财政预决算、土地、评级

财政部预决算平台（需交互）、中国土地市场网（需登录）、城投评级报告（需账号）。用户确认后可用浏览器自动化。

## 抽离简化规则（原始数据 → 六维 Context）

每维输出 `summary`（一句话量级判断）+ `metrics`（关键数字，带年份与来源）+ `level`（high/medium/low）：

| 维度 | 抽取内容 | 判断口径 |
|---|---|---|
| fiscal 财政 | 一般公共预算收支、债务、财政池量级 | 全国比较：>1万亿=high，1千亿-1万亿=medium |
| industry 产业 | 主导产业、工业增加值、产业链定位 | 规上工业总量 + 规划文件 |
| factor 要素 | 人口、受教育程度、城镇化、高校 | 七普数据 |
| institution 制度 | 政策工具、审批、营商环境表述 | 政府工作报告/规划 |
| finance 金融 | 存贷款、融资环境、金融机构 | 央行金融报告 |
| risk 风险 | 债务率、依赖度、负面表述 | 评级报告/审计 |

禁止：补造数字；混合不同年份口径；把未来材料提前（推演场景遵守信息截止）。

## 输出 schema（government-context.json）

```json
{
  "schema": "government-context-v1",
  "city": { "province": "安徽省", "city": "合肥市", "level": "provincial" },
  "generated_at": "ISO8601",
  "dimensions": {
    "fiscal":    { "summary": "…", "level": "medium", "metrics": [ { "name": "一般公共预算收入", "value": "xxx亿元", "year": 2023, "source_id": "AH-STAT-BULLETIN-2023" } ] },
    "industry":  { "summary": "…", "level": "…", "metrics": [] },
    "factor":    { "summary": "…", "level": "…", "metrics": [] },
    "institution":{ "summary": "…", "level": "…", "metrics": [] },
    "finance":   { "summary": "…", "level": "…", "metrics": [] },
    "risk":      { "summary": "…", "level": "…", "metrics": [] }
  },
  "sources": [ { "source_id": "", "title": "", "publisher": "", "url": "", "archived_path": "", "sha256": "", "confidence": "A|B|C" } ],
  "evidence_gaps": [ "未获取的数据项" ]
}
```

## 校验（交付前必须过）

1. 六维均有 summary 与 level；无数据维度必须写入 evidence_gaps（不编造）
2. 每个 metric 有 year + source_id，且 source 登记在 sources
3. 关键数字与公报原文一致（抽查 3 个）
4. `manifest.json` 与源文件 sha256 匹配
5. 完成后向用户报告：下载了什么、抽离出什么、哪些维度缺失及原因
