from __future__ import annotations

import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data" / "source_archive" / "hefei_fiscal"
SNAPSHOT = ARCHIVE / "转载网页摘录与数据快照.md"

SOURCES = [
    ("src_hefei_2007", "2007_hefei_statistical_communique.html", "https://www.055110.com/law/2/4499.html"),
    ("src_hefei_2008", "2008_hefei_statistical_communique.html", "https://web.xiaze.org/tjgb/201001/18299.html"),
    ("src_hefei_2009", "2009_hefei_statistical_communique.html", "https://www.055110.com/law/2/3493.html"),
    ("src_hefei_2010", "2010_hefei_statistical_communique.html", "https://web.xiaze.org/tjgb/201103/30546.html"),
    ("src_hefei_2011", "2011_hefei_statistical_communique.html", "https://www.tjcn.org/tjgb/12ah/24159.html"),
    ("src_hefei_2012_pdf", "2012_hefei_statistical_communique.pdf", "https://yangtze.silkroadinfo.org.cn/2016/11/2/20161102135327.pdf"),
    ("src_hefei_2013_pdf", "2013_hefei_statistical_communique.pdf", "https://yangtze.silkroadinfo.org.cn/2016/11/17/20161117160913.pdf"),
    ("src_hefei_2014", "2014_hefei_statistical_communique.html", "https://www.tjcn.org/tjgb/12ah/28238.html"),
    ("src_hefei_2015", "2015_hefei_statistical_communique.html", "https://www.tjcn.org/tjgb/12ah/32676.html"),
    ("src_hefei_2016", "2016_hefei_statistical_communique.html", "https://web.xiaze.org/tjgb/201704/25661.html"),
    ("src_hefei_2016_audit", "2016_hefei_budget_execution_audit.html", "https://zh.wikisource.org/zh-hans/%E5%85%B3%E4%BA%8E%E5%90%88%E8%82%A5%E5%B8%822016%E5%B9%B4%E5%BA%A6%E5%B8%82%E7%BA%A7%E9%A2%84%E7%AE%97%E6%89%A7%E8%A1%8C%E5%92%8C%E5%85%B6%E4%BB%96%E8%B4%A2%E6%94%BF%E6%94%B6%E6%94%AF%E5%AE%A1%E8%AE%A1%E7%9A%84%E5%B7%A5%E4%BD%9C%E6%8A%A5%E5%91%8A"),
    ("src_mof_hefei_2008_fiscal", "2008_mof_hefei_fiscal_history.html", "https://www.mof.gov.cn/zhengwuxinxi/xinwenlianbo/anhuicaizhengxinxilianbo/200911/t20091112_231283.htm"),
    ("src_mof_hefei_budget_reform_2012", "2012_mof_hefei_budget_reform.html", "https://www.mof.gov.cn/zhengwuxinxi/xinwenlianbo/anhuicaizhengxinxilianbo/201211/t20121119_698559.htm"),
    ("src_mof_hefei_debt_management_2014", "2014_mof_hefei_debt_risk_management.html", "https://www.mof.gov.cn/zhengwuxinxi/xinwenlianbo/anhuicaizhengxinxilianbo/201408/t20140822_1130077.htm"),
    ("src_hefei_construction_rating_2016", "2016_hefei_construction_investment_rating_report.pdf", "https://static.sse.com.cn/disclosure/bond/announcement/corporate/c/2645294196290266.pdf"),
    ("src_hefei_construction_rating_2011", "2011_hefei_construction_investment_rating_report.pdf", "https://pdf.dfcfw.com/pdf/H2_AN201612020147767466_1.pdf?1485106017000.pdf="),
    ("src_hefei_construction_rating_2013", "2013_hefei_construction_investment_rating_report.pdf", "https://qxb-pdf-osscache.qixin.com/AnBaseinfo/6fd3b7c6c1cde6bc2f2da3da00f4b5ce.pdf"),
    ("src_hefei_construction_rating_2015", "2015_hefei_construction_investment_rating_report.pdf", "https://static.cninfo.com.cn/finalpage/2015-06-30/1201222580.PDF"),
    ("src_boe_2008", "2008_boe_annual_report.pdf", "https://static.cninfo.com.cn/finalpage/2009-04-21/51493003.PDF"),
    ("src_boe_hefei_6g_framework_2008", "2008_boe_hefei_6g_framework_agreement.html", "https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=362396"),
    ("src_boe_hefei_6g_progress_2008", "2008_boe_hefei_6g_progress_announcement.pdf", "https://static.cninfo.com.cn/finalpage/2008-10-17/44280437.PDF"),
    ("src_boe_hefei_85g_capital_2012", "2012_boe_hefei_85g_capital_increase.pdf", "https://static.cninfo.com.cn/finalpage/2012-10-30/61732389.PDF"),
    ("src_boe_hefei_85g_investment_2013", "2013_boe_hefei_85g_investment.pdf", "https://static.cninfo.com.cn/finalpage/2013-04-03/62320672.PDF"),
    ("src_boe_hefei_105g_investment_2015", "2015_boe_hefei_105g_investment.pdf", "https://static.cninfo.com.cn/finalpage/2015-04-21/1200875921.PDF"),
    ("src_tongwei_ldk_legal_2016", "2016_tongwei_ldk_supplemental_legal_opinion.pdf", "https://static.cninfo.com.cn/finalpage/2016-08-09/1202545941.PDF"),
]


def main() -> None:
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    retrieved = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    records = []
    for source_id, filename, url in SOURCES:
        target = ARCHIVE / filename
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 PolicyTownResearch/1.0"})
        status = "downloaded"
        error = None
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
            # Reject gateway error bodies and HTML masquerading as PDF.
            valid = (filename.endswith('.pdf') and data.startswith(b'%PDF')) or (filename.endswith('.html') and len(data) >= 1024 and b'<html' in data.lower())
            if not valid:
                raise ValueError(f'invalid archive payload ({len(data)} bytes)')
            target.write_bytes(data)
            digest = hashlib.sha256(data).hexdigest()
        except Exception as exc:  # keep a machine-readable failed record
            existing = target.read_bytes() if target.exists() else b""
            existing_valid = (filename.endswith('.pdf') and existing.startswith(b'%PDF')) or (filename.endswith('.html') and len(existing) >= 1024 and b'<html' in existing.lower())
            if existing_valid:
                status, error, digest = "preserved", str(exc), hashlib.sha256(existing).hexdigest()
            else:
                if source_id.startswith("src_hefei_") and SNAPSHOT.exists():
                    target = SNAPSHOT
                    status, error, digest = "snapshot", str(exc), hashlib.sha256(SNAPSHOT.read_bytes()).hexdigest()
                else:
                    status, error, digest = "failed", str(exc), None
        records.append({
            "source_id": source_id, "url": url,
            "archived_path": str(target.relative_to(ROOT)) if status in {"downloaded", "preserved", "snapshot"} else None,
            "retrieved_at": retrieved, "sha256": digest, "bytes": target.stat().st_size if target.exists() else 0,
            "status": status, "error": error,
        })
    (ARCHIVE / "manifest.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"downloaded": sum(x["status"] == "downloaded" for x in records), "failed": sum(x["status"] == "failed" for x in records), "manifest": str(ARCHIVE / "manifest.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
