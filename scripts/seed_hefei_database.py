from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "database" / "hefei_simulation_schema.sql"
DEFAULT_DB = ROOT / "data" / "hefei_industry_simulation.sqlite3"


def j(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def insert_many(conn: sqlite3.Connection, table: str, columns: list[str], rows: list[tuple]) -> None:
    marks = ",".join("?" for _ in columns)
    conn.executemany(
        f"INSERT OR REPLACE INTO {table} ({','.join(columns)}) VALUES ({marks})", rows
    )


def build_database(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))

    sources = [
        ("src_hefei_bulletins", "合肥市2007—2016年国民经济和社会发展统计公报", "合肥市统计部门", "official", None, None, "A", "附录A汇总来源；逐年来源由本轮抓取记录补充"),
        ("src_nbs_2008", "2008年国民经济和社会发展统计公报", "国家统计局", "official", None, None, "A", None),
        ("src_nbs_2009", "2009年国民经济和社会发展统计公报", "国家统计局", "official", None, None, "A", None),
        ("src_nbs_2020", "中华人民共和国2020年国民经济和社会发展统计公报", "国家统计局", "official", None, None, "A", None),
        ("src_boe_2008", "京东方科技集团股份有限公司2008年年度报告摘要", "京东方科技集团", "company", "https://static.cninfo.com.cn/finalpage/2009-04-21/51493003.PDF", "2009-04-21", "A", "巨潮资讯原始公告；公告编号2009-017"),
        ("src_boe_hefei_6g_framework_2008", "京东方关于签署合肥6代线投资框架协议的公告", "京东方科技集团", "company", "https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=362396", "2008-09-13", "A", "公告转载；协议给出175亿元总投资、90亿元项目资本金及政府方资本金责任"),
        ("src_boe_hefei_6g_progress_2008", "京东方关于合肥6代线项目进展的公告", "京东方科技集团", "company", "https://static.cninfo.com.cn/finalpage/2008-10-17/44280437.PDF", "2008-10-16", "A", "巨潮资讯原始公告；项目公司初始注册资本与各方出资"),
        ("src_boe_hefei_85g_capital_2012", "京东方关于合肥8.5代线项目国资平台增资的公告", "京东方科技集团", "company", "https://static.cninfo.com.cn/finalpage/2012-10-30/61732389.PDF", "2012-10-29", "A", "巨潮资讯原始公告；国资平台拟向鑫晟增资43.55亿元"),
        ("src_boe_hefei_85g_investment_2013", "京东方关于投资建设合肥8.5代线项目的公告", "京东方科技集团", "company", "https://static.cninfo.com.cn/finalpage/2013-04-03/62320672.PDF", "2013-04-03", "A", "巨潮资讯原始公告；项目总投资285亿元、注册资本170亿元及资本金安排"),
        ("src_boe_hefei_105g_investment_2015", "京东方关于投资建设合肥10.5代线项目的公告", "京东方科技集团", "company", "https://static.cninfo.com.cn/finalpage/2015-04-21/1200875921.PDF", "2015-04-21", "A", "巨潮资讯原始公告；政府方拟筹集180亿元项目注册资本金"),
        ("src_tongwei_ldk_legal_2016", "通威股份重大资产重组补充法律意见书", "通威股份/北京市金杜律师事务所", "company", "https://static.cninfo.com.cn/finalpage/2016-08-09/1202545941.PDF", "2016-08-09", "A", "巨潮资讯原始披露；回溯披露合肥高新区国资平台2010年向安徽赛维提供的10亿元委托贷款及后续债务重组"),
        ("src_cxmt_history", "关于我们/发展历程", "长鑫存储", "company", "https://www.cxmt.com/about.html", None, "A", "官网当前页，历史事实按页面公开时间进入withheld，不自动前移"),
        ("src_ldk_2011", "赛维LDK 2011年度第一期中期票据募集说明书", "赛维LDK太阳能高科技有限公司", "company", None, None, "A", "合肥赛维LDK 2010年末财务数据来源；原始文件URL与本地归档待补"),
        ("src_ldk_wiki", "LDK Solar (Wikipedia entry)", "Wikipedia (secondary)", "secondary", "https://en.wikipedia.org/wiki/LDK_Solar", "2026-06-16", "C", "二手来源，仅用于破产时间线（引Bloomberg 2014-10-21、PV-Tech 2015-11-18）与行业周期事件；关键财务已改用20-F一手数据"),
        ("src_ldk_20f_2008", "LDK Solar Co., Ltd. 2008 Annual Report (Form 20-F)", "赛维LDK太阳能高科技有限公司 / SEC EDGAR", "company", "https://www.sec.gov/Archives/edgar/data/1385424/000114554909000892/h03236e20vf.htm", "2009-05-22", "A", "SEC EDGAR原始20-F；2008财年合并报表口径，单位千美元"),
        ("src_ldk_20f_2009", "LDK Solar Co., Ltd. 2009 Annual Report (Form 20-F)", "赛维LDK太阳能高科技有限公司 / SEC EDGAR", "company", "https://www.sec.gov/Archives/edgar/data/1385424/000095012310062804/h04297e20vf.htm", "2010-06-30", "A", "SEC EDGAR原始20-F；2009财年合并报表口径，单位千美元，披露2009年净亏损与经营现金流骤降"),
        ("src_hefei_industry_public", "合肥产业公开统计资料", "合肥相关公开资料", "secondary", None, None, "B", "家电与部分产业数据待统计年鉴复核"),
        ("src_xinhao_history", "合肥鑫昊等离子项目历史资料", "中国新闻网/上海证券报", "media", None, None, "C", None),
        ("src_gov_policy", "国家产业政策文件汇编", "中国政府网/国务院/工信部/财政部", "official", None, None, "A", "需拆分并回填逐项URL与发布日期"),
        ("src_hefei_2007", "2007年合肥市国民经济和社会发展统计公报", "合肥市统计局", "official", "https://www.055110.com/law/2/4499.html", "2008-03-10", "B", "官方公报转载页"),
        ("src_hefei_2008", "2008年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://web.xiaze.org/tjgb/201001/18299.html", "2009-03-18", "B", "官方公报转载页"),
        ("src_hefei_2009", "2009年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://www.055110.com/law/2/3493.html", "2010-03-20", "B", "官方公报转载页"),
        ("src_hefei_2010", "2010年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://web.xiaze.org/tjgb/201103/30546.html", "2011-03-18", "B", "官方公报转载页"),
        ("src_hefei_2011", "2011年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://web.xiaze.org/tjgb/201204/28284.html", "2012-04-01", "B", "官方公报转载页；2011行政区划调整导致跨年前后口径变化"),
        ("src_hefei_2012", "2012年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://web.xiaze.org/tjgb/201304/27405.html", "2013-04-02", "B", "官方公报转载页"),
        ("src_hefei_2013", "2013年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://www.piffle365.com/html/baogao/zhengfutongjigongbao/201703/37605.html", None, "B", "官方公报转载页；准确发布日期待核"),
        ("src_hefei_2014", "2014年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://www.tjcn.org/tjgb/12ah/28238.html", None, "B", "官方公报转载页；准确发布日期待核"),
        ("src_hefei_2015", "2015年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://www.tjcn.org/tjgb/12ah/32676.html", "2016-03-22", "B", "官方公报转载页"),
        ("src_hefei_2016", "2016年合肥市国民经济和社会发展统计公报", "合肥市统计局/国家统计局合肥调查队", "official", "https://web.xiaze.org/tjgb/201704/25661.html", "2017-04-02", "B", "官方公报转载页"),
        ("src_policy_home_appliance_2008", "关于全国推广家电下乡工作的通知（财建〔2008〕862号）", "财政部/商务部/工业和信息化部", "official", "https://www.mof.gov.cn/gkml/caizhengwengao/caizhengbuwengao2008/wengao200812qi/200903/t20090305_119008.htm", "2008-11-28", "A", "安徽自2008-12-01实施，四类产品按售价13%补贴"),
        ("src_policy_solar_2009", "太阳能光电建筑应用财政补助资金管理暂行办法（财建〔2009〕129号）", "财政部", "official", "https://www.mof.gov.cn/gkml/caizhengwengao/2009niancaizhengbuwengao/caizhengwengao200904/200906/t20090630_173347.htm", "2009-03-23", "A", "2009年补助标准原则上20元/Wp"),
        ("src_policy_electronics_2009", "电子信息产业调整和振兴规划", "国务院办公厅", "official", "https://policy.mofcom.gov.cn/claw/clawContent.shtml?id=45728", "2009-04-15", "A", "规划期2009—2011"),
        ("src_policy_ic_2014", "国家集成电路产业发展推进纲要", "工业和信息化部", "official", "https://www.cac.gov.cn/2014-06/26/c_1111325916.htm", "2014-06-24", "A", "2014-06-26公开"),
        ("src_policy_emerging_2016", "十三五国家战略性新兴产业发展规划", "国务院", "official", "https://www.cac.gov.cn/2016-12/19/c_1120146605.htm", "2016-11-29", "A", "国发〔2016〕67号"),
    ]
    sources.extend([
        ("src_hefei_2012_pdf", "2012年合肥市国民经济和社会发展统计公报PDF", "合肥市统计局/国家统计局合肥调查队", "official", "https://yangtze.silkroadinfo.org.cn/2016/11/2/20161102135327.pdf", "2013-04-02", "B", "官方公报PDF镜像"),
        ("src_hefei_2013_pdf", "2013年合肥市国民经济和社会发展统计公报PDF", "合肥市统计局/国家统计局合肥调查队", "official", "https://yangtze.silkroadinfo.org.cn/2016/11/17/20161117160913.pdf", None, "B", "官方公报PDF镜像"),
        ("src_hefei_2016_audit", "关于合肥市2016年度市级预算执行和其他财政收支审计的工作报告", "合肥市审计局", "official", "https://zh.wikisource.org/zh-hans/关于合肥市2016年度市级预算执行和其他财政收支审计的工作报告", "2017-07-21", "B", "政府审计报告转载；口径为市级含市本级和四大开发区"),
        ("src_mof_hefei_2008_fiscal", "安徽省部分市县60年财政发展巡礼：合肥市", "财政部", "official", "https://www.mof.gov.cn/zhengwuxinxi/xinwenlianbo/anhuicaizhengxinxilianbo/200911/t20091112_231283.htm", "2009-11-12", "A", "确认2008年财政支出206.78亿元"),
        ("src_mof_hefei_budget_reform_2012", "合肥市财政局全面提升预算编制水平", "财政部", "official", "https://www.mof.gov.cn/zhengwuxinxi/xinwenlianbo/anhuicaizhengxinxilianbo/201211/t20121119_698559.htm", "2012-11-19", "A", "确认2012年起编制四本预算"),
        ("src_mof_hefei_debt_management_2014", "合肥市着力构建政府性债务风险管理长效机制", "财政部", "official", "https://www.mof.gov.cn/zhengwuxinxi/xinwenlianbo/anhuicaizhengxinxilianbo/201408/t20140822_1130077.htm", "2014-08-22", "A", "债务管理机制与偿债风险准备金规则"),
        ("src_hefei_construction_rating_2016", "合肥市建设投资控股（集团）有限公司主体与相关债项2016年度跟踪评级报告", "大公国际资信评估有限公司", "institution", "https://static.sse.com.cn/disclosure/bond/announcement/corporate/c/2645294196290266.pdf", "2016-06-30", "B", "财政数据据报告注明由合肥市财政局提供；仅作为交叉验证来源"),
        ("src_hefei_construction_rating_2011", "合肥市建设投资控股（集团）有限公司公司债券跟踪评级报告", "评级机构", "institution", "https://pdf.dfcfw.com/pdf/H2_AN201612020147767466_1.pdf?1485106017000.pdf=", "2011-06-30", "B", "含2008—2010全口径财政三年表"),
        ("src_hefei_construction_rating_2013", "合肥市建设投资控股（集团）有限公司公司债券跟踪评级报告", "评级机构", "institution", "https://qxb-pdf-osscache.qixin.com/AnBaseinfo/6fd3b7c6c1cde6bc2f2da3da00f4b5ce.pdf", "2013-06-28", "B", "含2010—2012全口径财政三年表"),
        ("src_hefei_construction_rating_2015", "合肥市建设投资控股（集团）有限公司主体与相关债项2015年度跟踪评级报告", "大公国际资信评估有限公司", "institution", "https://static.cninfo.com.cn/finalpage/2015-06-30/1201222580.PDF", "2015-06-30", "B", "含2012—2014全口径财政三年表"),
    ])
    archive_manifest = ROOT / "data" / "source_archive" / "hefei_fiscal" / "manifest.json"
    archive_by_id = {}
    if archive_manifest.exists():
        archive_by_id = {item["source_id"]: item for item in json.loads(archive_manifest.read_text(encoding="utf-8"))}
    source_rows = []
    for row in sources:
        archived = archive_by_id.get(row[0], {})
        source_rows.append((*row[:7], archived.get("archived_path"), archived.get("retrieved_at"), archived.get("sha256"), row[7]))
    insert_many(conn, "source", ["source_id","title","publisher","source_type","url","publication_date","confidence","archived_path","retrieved_at","sha256","notes"], source_rows)

    entities = [
        ("china", "country", "中国", None, j([])), ("anhui", "province", "安徽", "china", j([])),
        ("hefei", "city", "合肥", "anhui", j([])),
        ("ind_home_appliance", "industry", "家用电器", "hefei", j([])),
        ("ind_display", "industry", "平板显示及电子信息", "hefei", j(["LCD","显示面板"])),
        ("ind_pv", "industry", "光伏及新能源", "hefei", j(["光伏"])),
        ("ind_auto", "industry", "汽车及零部件", "hefei", j([])),
        ("ind_equipment", "industry", "装备制造", "hefei", j([])),
        ("ind_food", "industry", "食品及农副产品加工", "hefei", j([])),
        ("boe", "company", "京东方", "china", j(["BOE"])),
        ("xinhao", "company", "鑫昊等离子", "hefei", j([])),
        ("ldk", "company", "赛维LDK太阳能高科技有限公司", "china", j(["LDK Solar", "赛维LDK"])),
        ("ldk_hefei", "company", "合肥赛维LDK", "ldk", j(["赛维LDK", "合肥赛维"])),
        ("cxmt", "company", "长鑫存储", "hefei", j([])),
        ("hefei_construction_investment", "company", "合肥市建设投资控股（集团）有限公司", "hefei", j(["合肥建投"])),
    ]
    insert_many(conn, "entity", ["entity_id","entity_type","name","parent_entity_id","aliases_json"], entities)

    defs = [
        ("gdp","地区生产总值","world","number","亿元",None), ("gdp_growth","GDP增速","world","number","%",None),
        ("primary_value_added","第一产业增加值","world","number","亿元",None), ("secondary_value_added","第二产业增加值","world","number","亿元",None),
        ("tertiary_value_added","第三产业增加值","world","number","亿元",None), ("industrial_value_added","工业增加值","world","number","亿元",None),
        ("industry_value_added","产业增加值/相关规模","industry","number","亿元",None), ("industry_growth","产业增速","industry","number","%",None),
        ("industrial_output","工业总产值","industry","number","亿元",None), ("city_industry_share","占全市工业总量","industry","number","%",None),
        ("production_volume","产品产量","industry","number","万台",None), ("planned_capacity","规划产能","project","number",None,None),
        ("total_investment","总投资","project","number","亿元",None), ("registered_capital","注册资本","company","number","亿元",None),
        ("revenue","营业收入","company","number","亿元",None), ("net_profit","净利润","company","number","亿元",None),
        ("assets","总资产","company","number","亿元",None), ("liabilities","总负债","company","number","亿元",None),
        ("owners_equity","所有者权益","company","number","亿元",None),
        ("net_assets","净资产","company","number","亿元",None), ("operating_cash_flow","经营现金流","company","number","亿元",None),
        ("polysilicon_purchase_price","多晶硅加权平均采购价","company","number","美元/千克",None), ("wafer_asp","硅片平均售价","company","number","美元/瓦",None),
        ("wafer_sales_volume","硅片销量","company","number","MW",None),
        ("universities","高等院校数量","talent","number","所",None), ("students","在校学生","talent","number","万人",None),
        ("key_labs","省部级以上重点实验室和工程实验室","talent","number","个",None),
        ("fixed_asset_investment","全社会固定资产投资","world","number","亿元",None),
        ("fiscal_revenue_total","财政收入","government","number","亿元","历史公报口径，不等同一般公共预算收入"),
        ("fiscal_revenue_local","地方财政收入","government","number","亿元","历史公报口径"),
        ("tax_revenue","税收收入","government","number","亿元",None),
        ("fiscal_expenditure","财政支出","government","number","亿元","历史公报口径"),
        ("company_capital_contribution","企业累计增资","project","number","亿元",None),
        ("project_capital_commitment","项目资本金承诺","project","number","亿元","协议或公告中的项目资本金安排，不等同财政可用余额"),
        ("government_capital_commitment","政府方资本金承诺","project","number","亿元","政府方/国资平台协议承诺或拟筹集金额，不等同已支付现金"),
        ("government_capital_contribution","政府方项目增资","project","number","亿元","公告披露的政府方或国资平台增资安排，需区分拟增资与实缴"),
        ("government_actual_equity_contribution","政府方实际股权出资","project","number","亿元","国资平台已以现金或已形成注册资本的项目股权出资；不等同财政直接拨款"),
        ("government_registered_equity_capital","政府方已登记项目股本","project","number","亿元","由当期注册资本和股权比例复核的国资平台登记股本；如无验资材料，不写为现金实缴"),
        ("government_platform_entrusted_loan","政府平台委托贷款","project","number","亿元","政府或国资平台经银行向项目主体提供的债权融资，不得与股权出资合并"),
        ("state_owned_capital_increase","国资平台增资","company","number","亿元","国资监管部门对市属国资平台的实际增资；需在备注中区分现金、资产或其他形式"),
        ("company_ownership_share","企业持股比例","project","number","%",None),
        ("government_fund_revenue","政府性基金预算收入","government","number","亿元","不得与一般公共预算收入相加后冒充可支配收入"),
        ("government_fund_expenditure","政府性基金预算支出","government","number","亿元",None),
        ("direct_government_debt_balance","政府直接债务余额","government","number","亿元","历史评级报告口径，不等同于新预算法下地方政府债务余额"),
        ("guaranteed_government_debt_balance","政府担保债务余额","government","number","亿元","历史评级报告口径"),
        ("finance_platform_debt_with_fiscal_responsibility","财政承担偿还责任的融资平台债务","government","number","亿元","历史评级报告披露的直接债务组成部分"),
        ("fiscal_current_year_balance","财政本年收支净额","government","number","亿元","财政本年收入减本年支出；不等同年末结余、可结转余额或可自由支配资金"),
        ("state_owned_capital_budget_status","国有资本经营预算编制状态","government","text",None,"只记录是否建立/编制该预算，不代表已取得预算收支数值"),
        ("land_transfer_revenue_role","土地出让收入在基金预算中的作用","government","text",None,"定性口径；不得由‘为主’反推土地出让收入精确值"),
    ]
    insert_many(conn, "indicator_definition", ["indicator_id","indicator_name","domain","value_type","canonical_unit","description"], defs)

    obs = []
    def add(oid, indicator, entity, start, end, value, unit, source, confidence="A", status="verified", notes=None, available=None):
        obs.append((oid,indicator,entity,start,end,value,None,unit,source,None,start,available or end,confidence,status,notes,None))

    def add_text(oid, indicator, entity, start, end, value, source, confidence="A", status="verified", notes=None, available=None):
        obs.append((oid,indicator,entity,start,end,None,value,None,source,None,start,available or end,confidence,status,notes,None))

    hefei_gdp = [
        (2007,1334.20,18.1,80.02,651.20,602.98),(2008,1664.84,17.2,105.20,834.92,724.72),
        (2009,2102.12,17.3,108.69,1104.98,888.45),(2010,2702.50,17.5,132.60,1457.60,1112.30),
        (2011,3636.61,15.4,208.20,2002.20,1426.20),(2012,4164.34,13.6,229.05,2303.91,1631.38),
        (2013,4672.91,11.5,247.21,2583.75,1841.95),(2014,5157.97,10.0,255.34,2904.12,1998.51),
        (2015,5660.27,10.5,263.43,3097.91,2298.93),(2016,6274.30,9.8,270.20,3189.30,2814.80),
    ]
    for year,gdp,growth,p,s,t in hefei_gdp:
        for indicator,value in (("gdp",gdp),("gdp_growth",growth),("primary_value_added",p),("secondary_value_added",s),("tertiary_value_added",t)):
            add(f"hef_{year}_{indicator}",indicator,"hefei",f"{year}-01-01",f"{year}-12-31",value,"%" if indicator=="gdp_growth" else "亿元",f"src_hefei_{year}", "B", "verified", "2011年行政区划调整形成跨年口径断点" if year == 2011 else None, {2007:"2008-03-10",2008:"2009-03-18",2009:"2010-03-20",2010:"2011-03-18",2011:"2012-04-01",2012:"2013-04-02",2013:None,2014:None,2015:"2016-03-22",2016:"2017-04-02"}[year])

    # Values transcribed from the named annual statistical communiques. Historical
    # fiscal labels are preserved; they are not silently renamed to modern budget terms.
    city_series = {
        2007: {"fiscal_revenue_total": 215.19, "fiscal_expenditure": 132.32},
        2008: {"fixed_asset_investment": 1838.64, "fiscal_revenue_total": 301.21, "fiscal_revenue_local": 160.94, "fiscal_expenditure": 206.78},
        2009: {"fixed_asset_investment": 2468.42, "fiscal_revenue_total": 341.91, "fiscal_revenue_local": 180.90, "tax_revenue": 154.34, "fiscal_expenditure": 245.86},
        2010: {"fixed_asset_investment": 3066.97, "fiscal_revenue_total": 476.20, "fiscal_revenue_local": 259.43, "tax_revenue": 221.43, "fiscal_expenditure": 317.72},
        2011: {"fixed_asset_investment": 3377.00, "fiscal_revenue_total": 623.77, "fiscal_revenue_local": 338.51, "fiscal_expenditure": 474.89},
        2012: {"fixed_asset_investment": 4001.10, "fiscal_revenue_total": 694.36, "fiscal_revenue_local": 389.50, "fiscal_expenditure": 572.10},
        2013: {"fixed_asset_investment": 4707.99, "fiscal_revenue_total": 768.27, "fiscal_revenue_local": 438.60, "tax_revenue": 685.91, "fiscal_expenditure": 630.89},
        2014: {"fixed_asset_investment": 5385.17, "fiscal_revenue_total": 880.68, "fiscal_revenue_local": 500.34, "fiscal_expenditure": 698.79},
        2015: {"fixed_asset_investment": 6153.35, "fiscal_revenue_total": 1000.50, "fiscal_revenue_local": 571.54, "fiscal_expenditure": 772.66},
        2016: {"fixed_asset_investment": 6501.17, "fiscal_revenue_total": 1114.11, "fiscal_revenue_local": 614.85, "fiscal_expenditure": 859.85},
    }
    publication_dates = {2007:"2008-03-10",2008:"2009-03-18",2009:"2010-03-20",2010:"2011-03-18",2011:"2012-04-01",2012:"2013-04-02",2013:"2014-03-18",2014:"2015-03-18",2015:"2016-03-22",2016:"2017-04-02"}
    for year, values in city_series.items():
        for indicator, value in values.items():
            source = f"src_hefei_{year}"
            notes = "2011年区划调整，跨年比较需处理口径断点" if year == 2011 else None
            add(f"hef_{year}_{indicator}", indicator, "hefei", f"{year}-01-01", f"{year}-12-31", value, "亿元", source, "B", "verified", notes, publication_dates[year])

    for oid,indicator,value,unit,note in [
        ("home_2007_output","industrial_output",232,"亿元","规模以上家电企业"),
        ("home_2007_share","city_industry_share",15.6,"%",None),
        ("home_2007_fridge","production_volume",670,"万台","冰箱"),
        ("home_2007_washer","production_volume",552,"万台","洗衣机"),
        ("home_2007_tv","production_volume",258,"万台","彩电"),
        ("home_2007_ac","production_volume",168,"万台","空调"),
    ]: add(oid,indicator,"ind_home_appliance","2007-01-01","2007-12-31",value,unit,"src_hefei_industry_public","B","provisional",note)
    add("home_2012_four_products","production_volume","ind_home_appliance","2012-01-01","2012-12-31",5567.69,"万台","src_hefei_industry_public","B","provisional","冰箱、洗衣机、空调、彩电合计")

    industry_2016 = [("ind_auto",191.03,22.0),("ind_equipment",372.57,12.0),("ind_home_appliance",352.86,7.1),("ind_food",186.65,-2.1),("ind_display",275.47,11.0),("ind_pv",93.22,31.7)]
    for entity,size,growth in industry_2016:
        add(f"{entity}_2016_size","industry_value_added",entity,"2016-01-01","2016-12-31",size,"亿元","src_hefei_bulletins")
        add(f"{entity}_2016_growth","industry_growth",entity,"2016-01-01","2016-12-31",growth,"%","src_hefei_bulletins")

    for oid,indicator,value,unit,note in [
        ("ldk_registered_capital","registered_capital",10,"亿元",None),("ldk_capacity","planned_capacity",1600,"MW","在建产能"),
        ("ldk_assets_2010","assets",19.413,"亿元",None),("ldk_liabilities_2010","liabilities",9.4283,"亿元",None),
        ("ldk_net_assets_2010","net_assets",9.9846,"亿元",None),("ldk_ocf_2010","operating_cash_flow",-0.0326,"亿元",None),
    ]: add(oid,indicator,"ldk_hefei","2010-01-01","2010-12-31",value,unit,"src_ldk_2011","A","verified",note,"2011-01-01")

    # 赛维LDK集团（母公司）年报口径，用于决策日前揭示既有杠杆、规模与经营恶化。
    # 集团在美上市按美元披露，数值直接取自SEC EDGAR原始20-F（千美元换算为百万美元）。
    # 2008年报于2009-05-22申报，2009年报于2010-06-30申报，均早于合肥项目2010-08-30决策点。
    # 2009年集团已出现净亏损（-2.34亿美元）与经营现金流骤降，是“热门产业+大资本开支+杠杆”风险的关键证据。
    for oid,indicator,value,unit,note in [
        ("ldk_2008_revenue","revenue",1643.495,"百万美元","集团净销售额"),
        ("ldk_2008_net_income","net_profit",70.223,"百万美元","集团净利润"),
        ("ldk_2008_assets","assets",3373.728,"百万美元","集团总资产"),
        ("ldk_2008_liabilities","liabilities",2597.820,"百万美元","集团总负债"),
        ("ldk_2008_equity","owners_equity",775.908,"百万美元","集团所有者权益"),
        ("ldk_2008_ocf","operating_cash_flow",333.061,"百万美元","集团经营现金流"),
    ]: add(oid,indicator,"ldk","2008-01-01","2008-12-31",value,unit,"src_ldk_20f_2008","A","verified",note,"2009-05-22")
    for oid,indicator,value,unit,note in [
        ("ldk_2009_revenue","revenue",1098.038,"百万美元","集团净销售额"),
        ("ldk_2009_net_income","net_profit",-233.996,"百万美元","集团净亏损"),
        ("ldk_2009_assets","assets",4384.209,"百万美元","集团总资产"),
        ("ldk_2009_liabilities","liabilities",3507.273,"百万美元","集团总负债"),
        ("ldk_2009_equity","owners_equity",876.936,"百万美元","集团所有者权益"),
        ("ldk_2009_ocf","operating_cash_flow",18.614,"百万美元","集团经营现金流（较2008年骤降）"),
        ("ldk_2009_wafer_capacity","planned_capacity",1800.0,"MW","集团硅片年化产能（2009年末约1.8GW）"),
    ]: add(oid,indicator,"ldk","2009-01-01","2009-12-31",value,unit,"src_ldk_20f_2009","A","verified",note,"2010-06-30")

    # 光伏行业周期证据（取自20-F，A级一手）：多晶硅价格先涨后崩、硅片售价腰斩。
    # 20-F引Solarbuzz：多晶硅现货价2008年5月高点450-475美元/千克，2009年Q4跌至45-60美元/千克。
    # 2008年销量636.3MW、售价2.35美元/瓦；2009年销量+41.2%至898.1MW，但售价-55.3%至1.05美元/瓦，
    # 量增价跌导致营收不升反降——这是“热门产业+行业周期”风险的核心机制证据。
    for oid,indicator,value,unit,note in [
        ("ldk_2007_polysilicon_price","polysilicon_purchase_price",185.8,"美元/千克","集团加权平均采购价"),
        ("ldk_2008_polysilicon_price","polysilicon_purchase_price",261.8,"美元/千克","集团加权平均采购价（2009年20-F重述为270美元/千克）"),
        ("ldk_2008_wafer_asp","wafer_asp",2.35,"美元/瓦","硅片平均售价"),
        ("ldk_2008_wafer_sales","wafer_sales_volume",636.3,"MW","硅片销量"),
    ]: add(oid,indicator,"ldk","2008-01-01","2008-12-31",value,unit,"src_ldk_20f_2008","A","verified",note,"2009-05-22")
    for oid,indicator,value,unit,note in [
        ("ldk_2009_polysilicon_price","polysilicon_purchase_price",86.0,"美元/千克","集团加权平均采购价（较2008年骤降）"),
        ("ldk_2009_wafer_asp","wafer_asp",1.05,"美元/瓦","硅片平均售价（较2008年-55.3%）"),
        ("ldk_2009_wafer_sales","wafer_sales_volume",898.1,"MW","硅片销量（较2008年+41.2%，量增价跌致营收下降）"),
    ]: add(oid,indicator,"ldk","2009-01-01","2009-12-31",value,unit,"src_ldk_20f_2009","A","verified",note,"2010-06-30")

    for oid,indicator,value,unit,note in [
        ("talent_2014_universities","universities",60,"所","各类高等院校"),("talent_2014_students","students",60.37,"万人","各类在校学生"),
        ("talent_2014_key_labs","key_labs",136,"个",None),
    ]: add(oid,indicator,"hefei","2014-01-01","2014-12-31",value,unit,"src_hefei_bulletins")

    # Project observations use project entities created here.
    project_entities = [("proj_boe_6g","project","京东方合肥第六代TFT-LCD项目","hefei",j([])),("proj_boe_85g","project","京东方合肥第八代半TFT-LCD项目","hefei",j([])),("proj_boe_105g","project","京东方合肥第十代半TFT-LCD项目","hefei",j([])),("proj_xinhao_pdp","project","鑫昊等离子项目","hefei",j([])),("proj_ldk_hefei","project","合肥赛维LDK光伏项目","hefei",j(["安徽赛维","合肥赛维"]))]
    insert_many(conn,"entity",["entity_id","entity_type","name","parent_entity_id","aliases_json"],project_entities)
    add("boe_total_investment","total_investment","proj_boe_6g","2008-09-12","2008-09-12",175,"亿元","src_boe_2008")
    add("boe_planned_capacity","planned_capacity","proj_boe_6g","2008-09-12","2008-09-12",90000,"片/月","src_boe_2008")
    add("boe_6g_project_capital","project_capital_commitment","proj_boe_6g","2008-09-12","2008-09-12",90,"亿元","src_boe_hefei_6g_framework_2008","A","verified","协议项目资本金；其中政府方承担60亿元注册资本及其余30亿元资本金的筹集责任","2008-09-13")
    add("boe_6g_government_capital_commitment","government_capital_commitment","proj_boe_6g","2008-09-12","2008-09-12",60,"亿元","src_boe_hefei_6g_framework_2008","A","verified","政府方注册资本金责任，不等同已支付现金","2008-09-13")
    add("boe_6g_initial_registered_capital","registered_capital","proj_boe_6g","2008-10-16","2008-10-16",0.5,"亿元","src_boe_hefei_6g_progress_2008","A","verified","项目公司初始注册资本5000万元；政府平台4050万元、京东方950万元","2008-10-17")
    add("boe_6g_government_actual_equity_contribution","government_actual_equity_contribution","proj_boe_6g","2008-10-16","2008-10-16",0.405,"亿元","src_boe_hefei_6g_progress_2008","A","verified","合肥建投现金出资2550万元，合肥鑫城现金出资1500万元；已出资口径，不是60亿元后续承诺","2008-10-17")
    add("boe_85g_total_investment","total_investment","proj_boe_85g","2012-08-14","2012-08-14",285,"亿元","src_boe_hefei_85g_investment_2013","A","verified","公告回溯披露的项目总投资；信息可用日按公告日期","2013-04-03")
    add("boe_85g_registered_capital","registered_capital","proj_boe_85g","2012-08-14","2012-08-14",170,"亿元","src_boe_hefei_85g_investment_2013","A","verified","项目公司注册资本/项目资本金口径","2013-04-03")
    add("boe_85g_government_capital_increase","government_capital_commitment","proj_boe_85g","2012-10-29","2012-10-29",43.55,"亿元","src_boe_hefei_85g_capital_2012","A","verified","国资平台拟在2012年末前完成的单方增资安排；公告为拟增资，故归入承诺而非实际出资","2012-10-30")
    obs.append(("boe_85g_government_registered_equity_capital","government_registered_equity_capital","proj_boe_85g","2013-04-03","2013-04-03",40.0,None,"亿元","src_boe_hefei_85g_investment_2013",None,"2013-04-03","2013-04-03","A","verified","公告披露当前注册资本40.05亿元；京东方后续单方增资60亿元后，三家国资平台持股对应登记股本合计40亿元，另有0.05亿元由合肥京东方光电持有；未取得验资流水，不写为现金实缴","100.05 * (24.99% + 13.52% + 1.47%) = 40.00（公告股比四舍五入后与注册资本表交叉复核）"))
    add("boe_105g_total_investment","total_investment","proj_boe_105g","2015-04-19","2015-04-19",400,"亿元","src_boe_hefei_105g_investment_2015","A","verified","项目总投资","2015-04-21")
    add("boe_105g_registered_capital","registered_capital","proj_boe_105g","2015-04-19","2015-04-19",220,"亿元","src_boe_hefei_105g_investment_2015","A","verified","项目公司注册资本；政府方拟筹集180亿元、公司自筹40亿元","2015-04-21")
    add("boe_105g_government_capital_commitment","government_capital_commitment","proj_boe_105g","2015-04-19","2015-04-19",180,"亿元","src_boe_hefei_105g_investment_2015","A","verified","政府方拟筹集的注册资本金承诺，不等同已支付现金","2015-04-21")
    add("xinhao_total_investment","total_investment","proj_xinhao_pdp","2009-01-01","2009-12-31",20,"亿元","src_xinhao_history","C","provisional")
    add("xinhao_planned_capacity","planned_capacity","proj_xinhao_pdp","2009-01-01","2009-12-31",150,"万片/年","src_xinhao_history","C","provisional")
    add("ldk_hefei_government_platform_entrusted_loan","government_platform_entrusted_loan","proj_ldk_hefei","2010-08-01","2010-12-31",10.0,"亿元","src_tongwei_ldk_legal_2016","A","verified","合肥高新创业园管理有限公司委托浦发银行向安徽赛维相继提供贷款；为债权融资，不是政府股权出资；后续披露材料不得反向进入2010年决策Context","2016-08-09")

    # BOE 2008 audited annual-report facts. They are available only from the
    # report publication date and therefore do not enter the 2008-09 decision context.
    for oid,indicator,value,note in [
        ("boe_2008_revenue","revenue",83.34015771,None),
        ("boe_2008_net_profit","net_profit",-9.96771096,"合并净利润"),
        ("boe_2008_ocf","operating_cash_flow",11.27969877,None),
        ("boe_2008_assets","assets",139.41120322,None),
        ("boe_2008_equity","owners_equity",67.18801623,None),
        ("boe_2008_liabilities","liabilities",72.22318699,"由总资产减所有者权益派生"),
    ]: add(oid,indicator,"boe","2008-01-01","2008-12-31",value,"亿元","src_boe_2008","A","verified",note,"2009-04-21")
    add("boe_2009_project_contribution","company_capital_contribution","proj_boe_6g","2009-01-01","2009-04-21",6,"亿元","src_boe_2008","A","verified","截至年报出具日累计两次单方增资","2009-04-21")
    add("boe_2009_project_share","company_ownership_share","proj_boe_6g","2009-01-01","2009-04-21",93.769,"%","src_boe_2008","A","verified","增资完成后京东方持股比例","2009-04-21")

    # Additional same-year but different-scope fiscal observations from the audit report.
    for oid,indicator,value,note in [
        ("hef_2016_municipal_fiscal_revenue_total","fiscal_revenue_total",754.06,"市级：市本级+市属四大开发区"),
        ("hef_2016_municipal_fiscal_revenue_local","fiscal_revenue_local",386.92,"市级：市本级+市属四大开发区"),
        ("hef_2016_municipal_tax_revenue","tax_revenue",313.24,"市级地方财政收入中的税收收入"),
        ("hef_2016_municipal_general_budget_expenditure","fiscal_expenditure",462.42,"市级一般公共预算支出；不得与全市财政支出859.85亿元拼接"),
    ]: add(oid,indicator,"hefei","2016-01-01","2016-12-31",value,"亿元","src_hefei_2016_audit","B","verified",note,"2017-07-21")
    # Rolling institutional reports expose three-year tables. Overlap years are
    # used as consistency checks, while each stored observation keeps one source.
    fund_series = {
        2008:(98.91,102.42,"src_hefei_construction_rating_2011","2011-06-30"),
        2009:(150.29,133.92,"src_hefei_construction_rating_2011","2011-06-30"),
        2010:(316.05,313.37,"src_hefei_construction_rating_2011","2011-06-30"),
        2011:(261.06,267.27,"src_hefei_construction_rating_2013","2013-06-28"),
        2012:(249.85,232.25,"src_hefei_construction_rating_2013","2013-06-28"),
        2013:(385.10,400.86,"src_hefei_construction_rating_2015","2015-06-30"),
        2014:(573.89,598.37,"src_hefei_construction_rating_2015","2015-06-30"),
        2015:(475.95,485.27,"src_hefei_construction_rating_2016","2016-06-30"),
    }
    for year, (fund_revenue, fund_expenditure, source, available) in fund_series.items():
        add(f"hef_{year}_fund_revenue", "government_fund_revenue", "hefei", f"{year}-01-01", f"{year}-12-31", fund_revenue, "亿元", source, "B", "provisional", "全市口径；滚动评级报告财政表格", available)
        add(f"hef_{year}_fund_expenditure", "government_fund_expenditure", "hefei", f"{year}-01-01", f"{year}-12-31", fund_expenditure, "亿元", source, "B", "provisional", "全市口径；滚动评级报告财政表格", available)
    fiscal_balance_series = {
        2008:(7.66,"src_hefei_construction_rating_2011","2011-06-30"),
        2009:(21.94,"src_hefei_construction_rating_2011","2011-06-30"),
        2010:(21.35,"src_hefei_construction_rating_2011","2011-06-30"),
        2011:(-0.37,"src_hefei_construction_rating_2013","2013-06-28"),
        2012:(17.90,"src_hefei_construction_rating_2013","2013-06-28"),
        2013:(-30.38,"src_hefei_construction_rating_2015","2015-06-30"),
        2014:(-54.27,"src_hefei_construction_rating_2015","2015-06-30"),
        2015:(-17.91,"src_hefei_construction_rating_2016","2016-06-30"),
    }
    for year, (value, source, available) in fiscal_balance_series.items():
        add(f"hef_{year}_fiscal_current_year_balance", "fiscal_current_year_balance", "hefei", f"{year}-01-01", f"{year}-12-31", value, "亿元", source, "B", "provisional", "全市口径；评级报告表中的‘本年收支净额’，不等同年末结余或可投资余额", available)
    debt_series = {
        2012:(585.08,17.78,"src_hefei_construction_rating_2013","2013-06-28"),
        2014:(816.75,116.47,"src_hefei_construction_rating_2015","2015-06-30"),
        2015:(857.16,111.69,"src_hefei_construction_rating_2016","2016-06-30"),
    }
    for year, (direct, guaranteed, source, available) in debt_series.items():
        add(f"hef_{year}_direct_government_debt_balance", "direct_government_debt_balance", "hefei", f"{year}-12-31", f"{year}-12-31", direct, "亿元", source, "B", "provisional", "全市口径；历史直接债务分类，不与新预算法后债务余额静默拼接", available)
        add(f"hef_{year}_guaranteed_government_debt_balance", "guaranteed_government_debt_balance", "hefei", f"{year}-12-31", f"{year}-12-31", guaranteed, "亿元", source, "B", "provisional", "全市口径；历史政府担保债务分类", available)
    add("hef_2014_finance_platform_debt_with_fiscal_responsibility", "finance_platform_debt_with_fiscal_responsibility", "hefei", "2014-12-31", "2014-12-31", 487.42, "亿元", "src_hefei_construction_rating_2015", "B", "provisional", "全市口径；直接债务中由财政承担偿还责任的融资平台借款和债券融资", "2015-06-30")
    add("hefei_construction_investment_2011_state_owned_capital_increase", "state_owned_capital_increase", "hefei_construction_investment", "2011-01-01", "2011-04-30", 40.0, "亿元", "src_hefei_construction_rating_2011", "B", "provisional", "合肥市国资委于2011年4月30日前现金增资；变更后合肥建投注册资本96.03亿元", "2011-06-30")
    add("hefei_construction_investment_2015_state_owned_capital_increase", "state_owned_capital_increase", "hefei_construction_investment", "2015-01-01", "2015-12-31", 0.44, "亿元", "src_hefei_construction_rating_2016", "B", "provisional", "依《关于增资合肥市建设投资控股（集团）有限公司的函》（合国资预算函〔2015〕68号）增资；证明国资预算执行中的一笔平台增资，不代表全市国有资本经营预算总额", "2016-06-30")
    add_text("hef_2012_state_owned_capital_budget_status", "state_owned_capital_budget_status", "hefei", "2012-01-01", "2012-12-31", "市本级自2012年起全面编制国有资本经营预算", "src_mof_hefei_budget_reform_2012", "A", "verified", "只确认预算体系已建立；未披露收入、支出或结余数值", "2012-11-19")
    add_text("hef_2012_land_transfer_revenue_role", "land_transfer_revenue_role", "hefei", "2012-01-01", "2012-12-31", "全口径政府性基金预算收入主要是土地出让收入", "src_hefei_construction_rating_2013", "B", "provisional", "定性披露；不将基金收入全额等同于土地出让收入", "2013-06-28")
    add_text("hef_2015_land_transfer_revenue_role", "land_transfer_revenue_role", "hefei", "2015-01-01", "2015-12-31", "全口径基金预算收入以土地出让收入为主", "src_hefei_construction_rating_2016", "B", "provisional", "定性披露；仍缺土地出让收入精确拆分", "2016-06-30")
    insert_many(conn,"observation",["observation_id","indicator_id","entity_id","period_start","period_end","value_number","value_text","unit","source_id","publication_date","effective_date","information_available_date","confidence","verification_status","notes","derivation_formula"],obs)

    cases = [
        ("CASE-01","熔盛重工/熔安动力","heavy_manufacturing","2007-01-01","failure","partially_verified",0,"区域产业匹配、重资产与全球周期",None,"结果仅供后台Replay"),
        ("CASE-02","京东方合肥项目","display_lcd","2008-09-12","success","verified",0,"逆周期投资与本地产业链培育","src_boe_2008",None),
        ("CASE-03","鑫昊等离子","display_pdp","2009-01-01","failure","partially_verified",0,"在当时信息集下判断LCD与PDP技术路线","src_xinhao_history",None),
        ("CASE-04","赛维LDK","photovoltaic","2010-08-30","failure","verified",0,"热门产业、资本开支、杠杆与行业周期","src_ldk_2011",None),
        ("CASE-05","北大未名","biomedicine","2013-01-01","unknown","needs_verification",0,"识别商业计划与真实执行能力的差异",None,"未核验前不得进入正式随机场景池"),
        ("CASE-06","长鑫存储","semiconductor_dram","2016-01-01","success","verified",0,"长期资本、高技术风险与产业链构建","src_cxmt_history",None),
    ]
    insert_many(conn,"case_library",["case_id","name","archetype","decision_date","outcome","case_status","player_visible_outcome","research_question","source_id","notes"],cases)

    milestones = [
        ("boe_agreement","CASE-02","2008-09-12","decision","签署投资框架协议","src_boe_2008","2008-09-12","A",0),
        ("boe_company","CASE-02","2008-10-16","company_setup","项目公司成立","src_boe_2008","2008-10-16","A",0),
        ("boe_construction","CASE-02","2009-04-13","construction","项目开工","src_boe_2008","2009-04-13","A",1),
        ("ldk_company","CASE-04","2010-08-30","company_setup","合肥公司成立","src_ldk_2011","2010-08-30","A",0),
        ("ldk_trial","CASE-04","2011-03-01","trial_production","开始试生产","src_ldk_2011","2011-03-01","A",1),
        ("ldk_poly_price_collapse","CASE-04","2011-06-30","industry_downturn","多晶硅价格下跌与光伏产能过剩显现，行业周期转弱","src_ldk_wiki","2011-12-31","C",1),
        ("ldk_chapter11_us","CASE-04","2014-10-21","bankruptcy_filing","母公司于美国申请Chapter 11破产保护","src_ldk_wiki","2014-10-21","C",1),
        ("ldk_bankruptcy_china","CASE-04","2015-11-18","bankruptcy","中国子公司进入破产程序","src_ldk_wiki","2015-11-18","C",1),
        ("cxmt_birth","CASE-06","2016-01-01","project_setup","合肥DRAM基地一期项目诞生","src_cxmt_history","2016-12-31","A",0),
        ("cxmt_build","CASE-06","2017-03-01","construction","一期开工","src_cxmt_history","2017-03-01","A",1),
        ("cxmt_fab","CASE-06","2018-01-01","equipment_move_in","厂房完成并开始设备搬入","src_cxmt_history","2018-01-01","A",1),
        ("cxmt_tapeout","CASE-06","2018-07-01","validation","8Gb DDR4验证投片","src_cxmt_history","2018-07-01","A",1),
        ("cxmt_product","CASE-06","2019-09-01","product","8Gb DDR4产品亮相","src_cxmt_history","2019-09-01","A",1),
        ("cxmt_order","CASE-06","2019-11-01","first_order","获得首笔订单","src_cxmt_history","2019-11-01","A",1),
    ]
    insert_many(conn,"case_milestone",["milestone_id","case_id","milestone_date","stage","description","source_id","information_available_date","confidence","is_withheld_outcome"],milestones)

    events = [
        ("E2008_FIN_CRISIS","2008-01-01","2008-09-15","2008-09-15","2009-12-31","macro","国际金融危机冲击",j(["all"]),j(["global_demand","financing","asset_price"]),"high","约15个月","2008-09-15","src_nbs_2008","A"),
        ("E2011_PV_OVERCAPACITY","2011-01-01","2011-06-30","2011-06-30","2012-12-31","industry_cycle","光伏产能过剩与多晶硅价格下跌",j(["photovoltaic"]),j(["product_price","supply_pressure","project_cash_flow"]),"high","约两年","2011-12-31","src_ldk_wiki","C"),
        ("E2014_IC_POLICY","2014-06-24","2014-06-26","2014-06-24",None,"policy","国家集成电路产业发展推进纲要",j(["semiconductor"]),j(["policy_support","financing_environment"]),"high",None,"2014-06-26","src_policy_ic_2014","A"),
        ("E2014_IC_FUND","2014-09-01","2014-09-01","2014-09-01",None,"policy_capital","国家集成电路产业投资基金设立",j(["semiconductor"]),j(["capital_supply"]),"high",None,"2014-09-30","src_gov_policy","A"),
        ("E2015_MADE_IN_CHINA","2015-05-01","2015-05-01","2015-05-01",None,"industry_policy","中国制造2025",j(["manufacturing"]),j(["policy_support"]),"medium",None,"2015-05-31","src_gov_policy","A"),
        ("E2016_STRATEGIC_EMERGING","2016-11-29","2016-12-19","2016-11-29",None,"industry_policy","十三五国家战略性新兴产业发展规划",j(["emerging_industries"]),j(["policy_support"]),"high",None,"2016-12-19","src_policy_emerging_2016","A"),
        ("E2020_COVID","2020-01-01","2020-01-01","2020-01-01","2020-12-31","external_shock","COVID冲击",j(["all"]),j(["supply_chain","consumption","production","capacity_utilization"]),"high","全年","2020-12-31","src_nbs_2020","A"),
    ]
    insert_many(conn,"historical_event",["event_id","event_date","announced_at","effective_from","effective_to","event_type","description","affected_industries_json","affected_variables_json","magnitude","duration","information_available_date","source_id","confidence"],events)

    policies = [
        ("P2008_HOME_APPLIANCE","2008-11-28","national","关于全国推广家电下乡工作的通知","财政部/商务部/工业和信息化部","2008-12-01","2012-11-30",j(["home_appliance"]),j(["rural_consumers"]),"demand_subsidy","销售价格13%","安徽自2008-12-01实施",j(["downstream_demand","orders"]),"2008-11-28","src_policy_home_appliance_2008","A"),
        ("P2009_SOLAR_BUILDING","2009-03-23","national","太阳能光电建筑应用财政补助资金管理暂行办法","财政部","2009-03-23",None,j(["photovoltaic"]),j(["eligible_demonstration_projects"]),"demand_subsidy","2009年原则上20元/Wp","装机不小于50kWp并满足效率等条件",j(["downstream_demand","project_cash_flow"]),"2009-03-23","src_policy_solar_2009","A"),
        ("P2009_ELECTRONICS_REVITALIZATION","2009-04-15","national","电子信息产业调整和振兴规划","国务院办公厅","2009-04-15","2011-12-31",j(["electronic_information","display"]),j(["industry_projects"]),"industry_plan","high","实施集成电路升级、新型显示和彩电工业转型等工程",j(["policy_support","capital_access","technology_rd"]),"2009-04-15","src_policy_electronics_2009","A"),
        ("P2014_IC_GUIDELINE","2014-06-24","national","国家集成电路产业发展推进纲要","工业和信息化部","2014-06-24",None,j(["semiconductor"]),j(["integrated_circuit_enterprises"]),"industry_plan","high","推动制造、设计、封测、装备材料并设立产业基金",j(["capital_supply","technology_rd","industry_chain"]),"2014-06-26","src_policy_ic_2014","A"),
        ("P2014_IC_FUND","2014-09-01","national","国家集成电路产业投资基金",None,"2014-09-01",None,j(["semiconductor"]),j(["integrated_circuit_enterprises"]),"industry_fund","high",None,j(["capital_supply"]),"2014-09-30","src_gov_policy","A"),
        ("P2015_MIC2025","2015-05-01","national","中国制造2025",None,"2015-05-01",None,j(["manufacturing"]),j(["manufacturing_enterprises"]),"industry_plan","high",None,j(["innovation","technology_rd"]),"2015-05-31","src_gov_policy","A"),
        ("P2016_EMERGING","2016-11-29","national","十三五国家战略性新兴产业发展规划","国务院","2016-11-29","2020-12-31",j(["emerging_industries","semiconductor"]),j(["emerging_industry_enterprises"]),"industry_plan","high",None,j(["policy_support","capital_supply","technology_rd"]),"2016-12-19","src_policy_emerging_2016","A"),
    ]
    insert_many(conn,"policy_library",["policy_id","policy_date","jurisdiction","title","issuer","effective_date","expiry_date","target_industries_json","eligible_entities_json","tool_type","tool_value_or_strength","conditions","policy_effects_json","information_available_date","source_id","confidence"],policies)

    gaps = [
        ("GAP-P0-FISCAL",0,"government","合肥","2007—2016",j(["2007政府性基金收支","土地出让收入逐年精确拆分","国有资本经营预算逐年收支数值","年末可结转财政结余","其余年度和新口径政府债务","长鑫等其余项目的实缴/提款流水"]),"合肥财政决算、人大预算报告、审计报告、债券募集及上市公司公告",1,"in_progress","已补2008—2015基金收支、2008—2015财政本年收支净额、2012/2014/2015历史债务；已区分京东方实际股权出资、承诺与赛维委托贷款；二次披露保持provisional"),
        ("GAP-P1-INDUSTRY",1,"industry","六类产业","2007—2016",j(["市场规模","产量","产能","产能利用率","产品价格","企业数量","CAPEX","利润率","竞争集中度"]),"统计年鉴、行业协会、企业年报",1,"open",None),
        ("GAP-P2-COMPANY",2,"company","六个案例","T0—Outcome",j(["营收","利润","经营现金流","现金","资产","负债","有息负债","研发","员工","订单","产能","利用率","融资"]),"企业年报、募集说明书、交易所公告",1,"open",None),
        ("GAP-P2-CASE01",2,"case","熔安/熔盛","2007—Outcome",j(["政府投入","土地","厂房","产能","订单","物流成本","实际产出","政府退出损失"]),"政府资料、法院资料、企业公告",1,"open",None),
        ("GAP-P2-CASE05",2,"case","北大未名","2013—Outcome",j(["项目名称","项目公司","决策时间","政府参与","投资规模","建设进度","经营结果","失败节点与原因"]),"政府文件、企业工商/公告、法院资料",1,"open","当前案例仅能作为待验证假设"),
        ("GAP-P3-EVENTS",3,"event","历史事件库","2007—2016",j(["逐年宏观事件","行业价格周期","技术替代","政策冲击","持续时间","幅度"]),"官方统计、行业协会、政策原文",1,"open",None),
        ("GAP-SOURCE-METADATA",0,"source","全部Seed来源","2007—2026",j(["其余原始URL","页码/表号","抓取日期","内容哈希"]),"原始发布页面或归档件",1,"in_progress","已补年度公报、京东方、长鑫和四项政策URL；部分统计公报仅找到转载页"),
        ("GAP-CUTOFF",0,"governance","全部Observation","2007—2026",j(["2013/2014公报准确发布日期","其余来源准确information_available_date","valid_until","修订版本关系"]),"来源发布日期与历史版本",1,"in_progress","已按年度公报发布日期修正城市序列；仍有历史来源发布日期待核"),
    ]
    insert_many(conn,"data_gap",["gap_id","priority","domain","entity_or_case","period","missing_fields_json","required_source","blocks_replay","status","notes"],gaps)

    conn.commit()
    result = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if result != "ok":
        raise RuntimeError(result)
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Hefei industry simulation seed database")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    build_database(args.db.resolve())
    print(args.db.resolve())


if __name__ == "__main__":
    main()
