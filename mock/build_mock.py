"""
手写 mock 数据生成器（P0 · H0 交付物）

目的：让 P2 和 P3 在 LLM 一次都没跑通之前就能开工。
数据是手工编的，但**流向和指标是用规则算的** —— P2 后面把真引擎接上来，
数量级和口径不会打架。

跑法：
    cd policy-town && python mock/build_mock.py
输出：
    data/run_A/round_1..8.json   无管制基线
    data/run_B/round_1..8.json   直接管制（R3 出台）

埋进 run_B 的三个现象（Demo 全靠它们）：
    ① 裁员批次尖峰卡在 19 人（门槛 20）
    ② B 厂招聘从 95 掉到 41  ★监管悖论
    ③ A → 外包 D 的那一支变粗，传统技能进不去 C 厂
"""

import json
import os
import sys
from copy import deepcopy

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from contracts.schema import (  # noqa: E402
    CONTRACT_VERSION, CompromiseEntry, FirmAction, Flow, Metrics,
    Policy, Snapshot, WorkerAction,
)

ROUNDS = 8
INIT_HEADCOUNT = {"A": 4000, "B": 1500, "C": 2200, "D": 800}

# 技能匹配率（与 engine/market.py 的 MATCH 表保持一致，P2 改这里也要改那里）
MATCH = {
    ("traditional", "B"): 0.65,
    ("traditional", "C"): 0.10,   # ★ 传统技能几乎进不去 C 厂的 AI 岗
    ("ai", "B"): 0.55,
    ("ai", "C"): 0.90,
}
TRAD_SHARE = 0.90          # A/C 放出的人里传统技能占比（放的是运营、测试、支持岗）
EXIT_BASE = 0.12           # 基础退出劳动力市场比例

# ★ 每轮新进入劳动力市场的应届生。他们不在"被裁的池子"里，
#   只能靠 campus 名额吸收 —— 校招腰斩直接把他们推进失业。
#   这是监管悖论真正伤到的人群，不加这一环，run_B 的总就业反而会好于 run_A。
NEW_ENTRANTS = 60
ENTRANT_TRAD_SHARE = 0.60


# ============================================================ 政策

def policy_A(rnd: int) -> Policy:
    return Policy(round=rnd, active=False, policy_text="（无管制基线，本组不发布裁员相关政策）")


def policy_B(rnd: int) -> Policy:
    if rnd < 3:
        return Policy(round=rnd, active=False, policy_text="（政策尚未出台）")
    return Policy(
        round=rnd, active=True,
        layoff_threshold=20, compensation_multiple="N+2",
        enforcement=0.8, skill_subsidy=0.0, hiring_subsidy=0.5,
        policy_text=(
            "自本季度起，用人单位单次经济性裁员达到或超过 20 人的，"
            "须提前三十日向人力资源社会保障部门报备并提交安置方案；"
            "经济补偿标准不低于 N+2。对稳定岗位的企业给予每人 0.5 万元稳岗补贴。"
        ),
        compromise_log=[
            CompromiseEntry(
                dept="人社", asked="补偿标准 N+3，门槛降至 10 人",
                final="N+2，门槛 20 人", blocked_by="财政",
                reason="N+3 叠加稳岗补贴后财政缺口超出本年度预算上限约 40%",
            ),
            CompromiseEntry(
                dept="财政", asked="稳岗补贴总额不超过 2 亿",
                final="按 0.5 万元/人计提，设上限", blocked_by=None,
                reason="全额采纳",
            ),
            CompromiseEntry(
                dept="产业", asked="AI 转型相关岗位调整豁免报备",
                final="未采纳，仅承诺后续单独出台配套细则", blocked_by="人社",
                reason="设置豁免口子会被普遍援引，报备门槛将形同虚设",
            ),
            CompromiseEntry(
                dept="监管", asked="执法强度 0.9，按季度抽查",
                final="执法强度 0.8，半年一次抽查", blocked_by="产业",
                reason="高频抽查将影响营商环境评价与在谈的两个招商项目",
            ),
        ],
    )


# ============================================================ 企业动作（手写数组）

FIRM_SERIES = {
    "A": {
        "A_batches": [[22,14,22],[31,18,21],[35,26,27],[42,30,24],[38,28,24],[33,27,22],[29,25,20],[26,23,17]],
        "B_batches": [[22,14,22],[31,18,21],[19,19,19,19],[19,18,5],[19,19],[19,17],[18,16],[19,14]],
        "A_outsource": [8,10,12,14,13,12,11,10],
        "B_outsource": [8,10,26,55,62,65,63,60],          # ★ 变粗
        "A_transfer":  [5,6,7,8,7,7,6,6],
        "B_transfer":  [5,6,18,32,36,38,37,35],
        "A_attrition": [12,12,13,14,13,13,12,12],
        "B_attrition": [12,12,16,22,24,25,24,23],
        "A_campus": [10,8,5,4,3,3,3,2],   "B_campus": [10,8,4,2,1,1,1,1],
        "A_social": [15,12,10,8,8,7,7,6], "B_social": [15,12,8,4,3,3,3,3],
        "A_efc": [.25,.25,.26,.27,.27,.26,.26,.25],
        "B_efc": [.25,.25,.55,.72,.78,.80,.80,.79],
        "comp_A": [1.0]*8, "comp_B": [1.0,1.0,2.0,2.0,2.0,2.0,2.0,2.0],
    },
    "B": {
        "A_batches": [[]]*8, "B_batches": [[]]*8,
        "A_outsource": [0]*8, "B_outsource": [0]*8,
        "A_transfer": [0]*8,  "B_transfer": [0]*8,
        "A_attrition": [4]*8, "B_attrition": [4,4,5,6,7,7,7,7],
        "A_campus": [40,42,45,44,43,42,41,40],
        "B_campus": [40,42,38,24,16,14,13,14],            # ★ 腰斩
        "A_social": [50,53,55,54,53,52,51,50],
        "B_social": [50,53,48,36,30,28,28,29],
        "A_efc": [.20,.20,.21,.21,.22,.22,.22,.23],
        "B_efc": [.20,.20,.58,.76,.82,.84,.83,.82],       # ★ 因果链证据
        "comp_A": [1.0]*8, "comp_B": [1.0,1.0,2.0,2.0,2.0,2.0,2.0,2.0],
    },
    "C": {
        "A_batches": [[12,9],[14,10],[15,11],[16,10],[15,10],[14,9],[13,9],[12,8]],
        "B_batches": [[12,9],[14,10],[15,11],[19,3],[19,2],[17,4],[16,4],[15,4]],
        "A_outsource": [3,4,5,5,5,4,4,4], "B_outsource": [3,4,9,16,18,18,17,16],
        "A_transfer": [4,5,6,6,6,5,5,5],  "B_transfer": [4,5,9,14,15,15,14,14],
        "A_attrition": [6]*8, "B_attrition": [6,6,7,9,9,9,9,9],
        "A_campus": [6,7,8,8,8,7,7,7], "B_campus": [6,7,7,6,6,6,6,6],
        "A_social": [28,30,32,33,32,31,30,30], "B_social": [28,30,30,29,28,28,27,27],
        "A_efc": [.22,.22,.23,.23,.24,.24,.24,.24],
        "B_efc": [.22,.22,.50,.64,.70,.71,.71,.70],
        "comp_A": [1.0]*8, "comp_B": [1.0,1.0,2.0,2.0,2.0,2.0,2.0,2.0],
    },
    "D": {
        "A_batches": [[]]*8, "B_batches": [[]]*8,
        "A_outsource": [0]*8, "B_outsource": [0]*8,
        "A_transfer": [0]*8, "B_transfer": [0]*8,
        "A_attrition": [6]*8, "B_attrition": [6]*8,
        "A_campus": [0]*8, "B_campus": [0]*8,
        "A_social": [20,24,28,30,29,27,25,24],
        "B_social": [20,24,42,78,88,92,90,86],            # ★ 管制期反而扩张
        "A_efc": [.10]*8, "B_efc": [.10,.10,.12,.14,.15,.15,.15,.15],
        "comp_A": [0.6]*8, "comp_B": [0.6]*8,
    },
}

REASONING = {
    ("A", "A", 3): ("下行周期，业务线收缩是既定动作。这一批 88 人，按 N+1 谈，"
                    "法务说流程没问题，舆情部门评估热搜风险中等，可以接受。",
                    "骨干跟着走"),
    ("A", "B", 3): ("新规下来了，达到 20 人就要报备加安置方案，还要走三十天流程。"
                    "我们把这一轮拆成四批，每批控制在 19 人，"
                    "报备这一层就绕过去了，补偿按 N+2 给足，谈判反而更快。",
                    "被认定为拆分规避"),
    ("A", "B", 4): ("正式渠道成本上去了。这一轮主力改走两条：一是把整条运营线打包给外包商，"
                    "人还在干同样的活，但不进我们的裁员数字；二是调岗，"
                    "撑不住的人自己会走。正式批次继续压在 19 以内。",
                    "外包商接不下这么多"),
    ("B", "A", 3): ("市场在下行，但我们的业务还在扩，人才市场上现在很多现成的人，"
                    "价格比去年便宜两成。这是抄底的窗口，校招社招都加码。", "招错人"),
    ("B", "B", 3): ("新规我们看了三遍。它管的是 A 那种正在裁的公司，我们没在裁。"
                    "但有一条要认真算：以后招进来的人，将来要放出去的成本变高了，"
                    "而且是不可逆的。这一轮先按原计划打七折。", "招进来放不出去"),
    ("B", "B", 4): ("我们不在被管的名单里，但成本已经变了。"
                    "未来裁人成本变高了，这一轮扩招我们缓一缓。"
                    "校招从 45 砍到 24，社招只保留核心岗位。"
                    "宁可业务慢一点，也不想明年背上一支放不掉的队伍。",
                    "错过窗口不如背上包袱"),
    ("B", "B", 6): ("已经连续三个季度收缩招聘了。业务侧一直在要人，"
                    "但只要报备门槛和 N+2 还在，每一个 headcount 都是长期负债。"
                    "维持现状，等政策明朗。", "被同行抢走人才"),
    ("C", "A", 4): ("AI 平台上线，传统测试和运营岗继续压缩，同时开 33 个算法和数据岗。"
                    "内部转岗率不到两成，大部分岗位还是要从外面招。", "新岗位招不到人"),
    ("C", "B", 4): ("转型进度必须保住。裁的批次也压在 19 人以内，跟 A 一样的做法。"
                    "麻烦的是招人这头 —— 市场上放出来的都是传统岗，"
                    "我们要的算法岗还是招不满，简历量大但匹配率极低。",
                    "转型窗口关上"),
    ("D", "B", 4): ("这一季承接量翻了三倍。A 和 C 都在把整条线打包出来，"
                    "价格能压得比去年低一成五，他们照样签。"
                    "人还是那些人，干的还是那些活，只是合同换了一张。", "承接能力跟不上"),
}


def build_firm(fid: str, rnd: int, run: str) -> FirmAction:
    s = FIRM_SERIES[fid]
    i = rnd - 1
    batches = list(s[f"{run}_batches"][i])
    r, w = REASONING.get((fid, run, rnd), ("", ""))
    return FirmAction(
        firm_id=fid, round=rnd,
        layoff_batches=batches, layoff_formal=sum(batches),
        channel_outsource=s[f"{run}_outsource"][i],
        channel_transfer=s[f"{run}_transfer"][i],
        channel_attrition=s[f"{run}_attrition"][i],
        hiring_campus=s[f"{run}_campus"][i],
        hiring_social=s[f"{run}_social"][i],
        comp_offer=s[f"comp_{run}"][i],
        expected_future_firing_cost=s[f"{run}_efc"][i],
        reasoning=r, worry=w,
    )


# ============================================================ 员工（10 个抽样个体）

WORKERS = [
    # id, firm, skill, savings, rights_prior, weight, cohort_label
    ("W01", "A", "traditional", 3, 0.20, 1900, "A厂传统岗 · 储蓄薄"),
    ("W02", "A", "ai",          8, 0.60,  620, "A厂 AI 岗 · 储蓄厚"),
    ("W03", "A", "ai",          5, 0.35,  480, "A厂 AI 岗 · 储蓄中"),
    ("W04", "A", "traditional", 2, 0.15, 1000, "A厂传统岗 · 无缓冲"),
    ("W05", "B", "ai",          9, 0.50,  760, "B厂 AI 岗"),
    ("W06", "B", "traditional", 4, 0.45,  740, "B厂传统岗"),
    ("W07", "C", "ai",          7, 0.55,  900, "C厂 AI 岗"),
    ("W08", "C", "traditional", 5, 0.25, 1300, "C厂传统岗 · 转型受冲击"),
    ("W09", "D", "traditional", 3, 0.10,  800, "外包商 · 在岗"),
    ("W10", None, "traditional", 4, 0.50,    0, "市场存量待业"),
]

# (round, worker) -> (status, action, target, reasoning, hesitation)
EVENTS = {
"A": {
 3: {"W01": ("notified", "sign", "market",
     "HR 给的是 N+1，说这是统一标准没得谈。我存款只够撑三个月，房贷下个月就要扣。"
     "招聘网站上同类岗位挂了不少，先拿钱走人，下个月开始投简历。",
     "同事说拖一拖能到 N+2，但我拖不起那三个月")},
 5: {"W01": ("reemployed", None, "B",
     "面了四家，B 厂给的比原来低一点，但岗位是对口的，下周入职。", ""),
     "W08": ("notified", "jobhunt", "market",
     "公司说我这条测试线要并进 AI 平台，让我自己找内部机会。"
     "看了下内部岗位，全是算法和数据，我投了两个都没过初筛。", "四十岁转算法来得及吗")},
 7: {"W08": ("reemployed", None, "D",
     "最后是外包商招了我，干的活跟以前差不多，工资少两千，五险一金换了基数。", "")},
},
"B": {
 3: {"W01": ("notified", "delay", None,
     "这次给的是 N+2，比上次听说的高。但 HR 说名额有限，让我这周内签。"
     "群里有人说新规下公司不敢乱来，可以再谈谈。",
     "我存款三个月，谈判要谈多久我心里没数")},
 4: {"W01": ("notified", "sign", "market",
     "拖了一个月，公司态度没松，我这边房贷已经扣了两次。签了。"
     "现在开始找工作，但招聘网站上的岗位比上个季度少了一大半。",
     "早知道招聘会缩成这样，我第一周就该签"),
     "W04": ("outsourced", "accept_transfer", "D",
     "公司说不裁我，把我们整个组划给外包商，工位不动，活不变。"
     "我看了新合同，工资降 15%，公积金按最低基数。我存款只够两个月，签了。",
     "这算保住工作还是丢了工作"),
     "W02": ("notified", "delay", None,
     "我算过了，我这个岗位公司很难找人替，而且这次批次拆得很明显，"
     "四批每批 19 人，这个我留了截图。我存款够撑八个月，不急着签。",
     "撕破脸以后这个圈子还怎么混")},
 5: {"W02": ("arbitrating", "arbitrate", None,
     "谈了两轮公司不肯加,我提了仲裁。拆分规避报备这一条,律师说有戏。",
     "仲裁要走三到六个月,这期间我不算失业但也没工作"),
     "W08": ("notified", "jobhunt", "market",
     "AI 平台上线,我这条测试线整个没了。内部转岗投了三个算法岗,全部初筛没过。"
     "外面 B 厂今年校招社招都停了,以前这个季节是招人旺季。",
     "公司同时在招 30 个人,却没有一个岗位要我")},
 6: {"W08": ("unemployed", "jobhunt", "unemployed",
     "投了六十份简历,面试三次。传统运营和测试的岗位现在几乎看不到,"
     "AI 相关的我够不着。外包商那边说这个季度接的单都要有经验的。", ""),
     "W10": ("unemployed", "jobhunt", "unemployed",
     "去年从上家出来的时候没觉得难,今年发现窗口整个关了。"
     "B 厂去年这时候还在扩招,现在挂出来的岗位只有个位数。", "")},
 7: {"W02": ("reemployed", None, "B",
     "仲裁调解结案,公司补到 N+3。但我出来找工作的时候发现,"
     "同期签字走的同事早在四月就上岗了,我错过了整个春招。",
     "多拿的一个月工资,抵不上多空的三个月")},
 8: {"W08": ("exited", "exit_labor_force", "exited",
     "不找了。孩子明年上小学,先回老家。这一段就当空白吧。", ""),
     "W10": ("exited", "exit_labor_force", "exited",
     "失业金领完了,统计上我大概已经不算失业人口了。", ""),
     "W09": ("outsourced", None, None,
     "外包这边今年人多了一倍,单价压得很低,加班变多了。"
     "但我不敢走,外面比这里还难。", "")},
},
}


ACTION_SINK = {
    "accept_transfer": "D", "sign": "unemployed", "jobhunt": "unemployed",
    "exit_labor_force": "exited", "delay": None, "arbitrate": None,
}


def _share(action, firm_id, skill, weight, flows) -> float:
    sink = ACTION_SINK.get(action)
    if sink is None or not weight:
        return 0.0
    n = sum(f.count for f in flows
            if f.to == sink and f.skill == skill
            and (f.from_ == firm_id or f.from_ in ("market", "entrants")))
    return round(min(1.0, n / weight), 4)


def build_workers(rnd: int, run: str, state: dict, flows) -> list[WorkerAction]:
    out = []
    ev = EVENTS[run].get(rnd, {})
    for wid, firm, skill, sav, rp, weight, label in WORKERS:
        if wid in ev:
            status, action, target, reason, hes = ev[wid]
            state[wid] = status
        else:
            status, action, target, reason, hes = state[wid], None, None, "", ""
        out.append(WorkerAction(
            worker_id=wid, round=rnd, firm_id=firm, skill_type=skill,
            savings_months=sav, rights_prior=rp,
            cohort_weight=weight, cohort_label=label,
            cohort_share=_share(action, firm, skill, weight, flows),
            status=status, action=action, target=target,
            reasoning=reason, hesitation=hes,
        ))
    return out


# ============================================================ 规则层：流向与指标

def compute(firms, hc, cum, mood, policy):
    """按匹配规则算流向与指标。P2 接真引擎时应产出同口径的数。"""
    f = {x.firm_id: x for x in firms}
    flows, pool = [], {"traditional": 0, "ai": 0}
    d_absorbed = 0

    # ⓪ 应届生入场：只有 campus 名额能接住他们 ★监管悖论的真正受害者
    e_trad = int(NEW_ENTRANTS * ENTRANT_TRAD_SHARE)
    e_ai = NEW_ENTRANTS - e_trad
    for fid in ("A", "B", "C"):
        cap = f[fid].hiring_campus
        take_ai = min(e_ai, int(cap * 0.4)); e_ai -= take_ai
        take_trad = min(e_trad, cap - take_ai); e_trad -= take_trad
        for n, sk in ((take_trad, "traditional"), (take_ai, "ai")):
            if n:
                flows.append(Flow(**{"from": "entrants", "to": fid, "count": n, "skill": sk}))
        hc[fid] += take_trad + take_ai
    # 没被校招接住的应届生进人才市场。但他们与在职者分池：
    # C 厂社招要求相关经验，应届生够不着；B 厂和外包商可以接。
    pool_new = {"traditional": e_trad, "ai": e_ai}
    if e_trad or e_ai:
        for n, sk in ((e_trad, "traditional"), (e_ai, "ai")):
            if n:
                flows.append(Flow(**{"from": "entrants", "to": "market", "count": n, "skill": sk}))

    # ① 企业放人 → 直接渠道（外包）先走，其余进人才市场
    for fid in ("A", "C"):
        a = f[fid]
        to_d = a.channel_outsource + int(a.channel_transfer * 0.6)
        d_trad = int(to_d * 0.88); d_ai = to_d - d_trad
        if d_trad: flows.append(Flow(**{"from": fid, "to": "D", "count": d_trad, "skill": "traditional"}))
        if d_ai:   flows.append(Flow(**{"from": fid, "to": "D", "count": d_ai, "skill": "ai"}))
        hc["D"] += to_d; hc[fid] -= to_d; d_absorbed += to_d

        released = a.layoff_formal + (a.channel_transfer - int(a.channel_transfer * 0.6)) + a.channel_attrition
        r_trad = int(released * TRAD_SHARE); r_ai = released - r_trad
        pool["traditional"] += r_trad; pool["ai"] += r_ai
        hc[fid] -= released

    # ② C 厂先挑（AI 岗优先），传统技能匹配率只有 0.10  ★错配在这里发生
    c_target = f["C"].hiring_social      # campus 名额已在 ⓪ 给了应届生
    c_ai = min(pool["ai"], int(c_target * MATCH[("ai", "C")]))   # ★ 不含应届生
    pool["ai"] -= c_ai
    c_trad = min(pool["traditional"], int((c_target - c_ai) * MATCH[("traditional", "C")]))
    pool["traditional"] -= c_trad
    for n, sk in ((c_ai, "ai"), (c_trad, "traditional")):
        if n: flows.append(Flow(**{"from": "market", "to": "C", "count": n, "skill": sk}))
    hc["C"] += c_ai + c_trad
    c_unfilled = max(0, c_target - c_ai - c_trad)

    # ③ B 厂吸收
    b_target = f["B"].hiring_social      # 同上
    b_trad = min(pool["traditional"], int(b_target * 0.7 * MATCH[("traditional", "B")]))
    pool["traditional"] -= b_trad
    b_ai = min(pool["ai"], int((b_target - b_trad) * MATCH[("ai", "B")]))
    pool["ai"] -= b_ai
    b_new = min(pool_new["traditional"], max(0, b_target - b_trad - b_ai))
    pool_new["traditional"] -= b_new
    for n, sk in ((b_trad + b_new, "traditional"), (b_ai, "ai")):
        if n: flows.append(Flow(**{"from": "market", "to": "B", "count": n, "skill": sk}))
    hc["B"] += b_trad + b_ai + b_new - f["B"].channel_attrition
    hc["D"] -= f["D"].channel_attrition

    # ④ D 厂剩余承接能力从市场吸纳
    #    注意：hiring_social 是 D 的承接能力上限，A/C 打包过来的人已经占掉一部分，
    #    不能再当成独立入口，否则 D 会凭空长人。
    d_capacity_left = max(0, f["D"].hiring_social - d_absorbed)
    d_extra = min(pool["traditional"], d_capacity_left)
    pool["traditional"] -= d_extra
    d_new = min(pool_new["traditional"], d_capacity_left - d_extra)
    pool_new["traditional"] -= d_new
    d_extra += d_new
    hc["D"] += d_extra
    if d_extra: flows.append(Flow(**{"from": "market", "to": "D", "count": d_extra, "skill": "traditional"}))

    # ⑤ 剩余：失业 / 退出劳动力市场（情绪越差，退出越多）
    exit_rate = EXIT_BASE + (0.6 - mood) * 0.9
    pool["traditional"] += pool_new["traditional"]
    pool["ai"] += pool_new["ai"]
    absorbed = c_ai + c_trad + b_trad + b_ai + b_new + d_extra
    released_total = absorbed + pool["traditional"] + pool["ai"]
    for sk in ("traditional", "ai"):
        n = pool[sk]
        ex = int(n * exit_rate); un = n - ex
        if un: flows.append(Flow(**{"from": "market", "to": "unemployed", "count": un, "skill": sk}))
        if ex: flows.append(Flow(**{"from": "market", "to": "exited", "count": ex, "skill": sk}))
        cum["unemployed"] += un; cum["exited"] += ex

    emp = sum(hc.values())
    ur = cum["unemployed"] / max(1, emp + cum["unemployed"])
    formal = sum(x.layoff_formal for x in firms)
    # 稳岗补贴按在册人数计提（万元）；技能补贴按转岗人数计提
    subsidy_cost = policy.hiring_subsidy * emp / 100 + policy.skill_subsidy * (c_trad + d_extra) / 10
    m = Metrics(
        employment_total=emp,
        formal_layoff=formal,
        outsource_share=round(hc["D"] / emp, 4),
        reemployment_rate=round(absorbed / max(1, released_total), 4),
        hidden_unemployment=cum["exited"],
        skill_mismatch_gap=min(cum["unemployed"], c_unfilled),
        unemployment_rate=round(ur, 4),
        kpi={
            "人社": round(max(0, min(1, 0.45 * (1 - ur / 0.10) + 0.55 * (1 - formal / 110))), 3),
            "财政": round(max(0, min(1, 0.35 + 0.65 * emp / 8500 - subsidy_cost / 150)), 3),
            # 产业部门要两件事：C 的转型进度 + B 的扩张速度
            "产业": round(max(0, min(1, 0.30
                       + 0.40 * (c_ai + c_trad) / max(1, c_target)
                       + 0.30 * (f["B"].hiring_campus + f["B"].hiring_social) / 100)), 3),
            "监管": 0.0,  # 下面用 sentiment 填
        },
    )
    return flows, m


# ============================================================ 社交层（P1 没通时的外生默认值）

SENT = {"A": [.20,.22,.25,.28,.27,.26,.25,.24], "B": [.20,.22,.42,.61,.68,.66,.62,.58]}
MOOD = {"A": [.60,.58,.55,.52,.52,.53,.54,.55], "B": [.60,.58,.48,.36,.30,.28,.30,.32]}
POSTS = {
"A": ["组里走了两个，说是业务调整","猎头最近特别活跃","听说 B 厂在抄底招人，薪资还行",
      "面完 B 厂了，流程挺快","朋友上周入职 B 厂了","行情一般，但还有岗位",
      "校招还在开，比去年少一点","年底了，都在观望"],
"B": ["新规出来了，说是裁员超 20 人要报备","公司把这批拆成了四批，每批 19 人，截图在此",
      "★『每批 19 人』这条帖子扩散到了全行业，转发 2400+",
      "整个组被打包给外包了，工位没动，工资降 15%","B 厂校招停了，去年这时候还在扩招",
      "投了六十份简历，面试三次","有人仲裁赢了，补到 N+3，但他空窗了五个月",
      "已经不找了，先回老家"],
}


# ============================================================ 主流程

def build(run: str):
    assert sum(w[5] for w in WORKERS) == sum(INIT_HEADCOUNT.values()), \
        "cohort 权重之和必须等于初始劳动力"
    hc = deepcopy(INIT_HEADCOUNT)
    cum = {"unemployed": 0, "exited": 0}
    state = {w[0]: ("employed" if w[1] else "unemployed") for w in WORKERS}
    os.makedirs(f"data/run_{run}", exist_ok=True)

    for rnd in range(1, ROUNDS + 1):
        firms = [build_firm(fid, rnd, run) for fid in ("A", "B", "C", "D")]
        for x in firms:
            x.check()
        mood, heat = MOOD[run][rnd - 1], SENT[run][rnd - 1]
        pol = (policy_A if run == "A" else policy_B)(rnd)
        flows, metrics = compute(firms, hc, cum, mood, pol)
        metrics.kpi["监管"] = round(max(0, 1 - heat * 0.9), 3)

        snap = Snapshot(
            run_id=run, round=rnd,
            policy=pol,
            firms=firms, workers=build_workers(rnd, run, state, flows),
            flows=flows, metrics=metrics,
            sentiment_heat=heat, group_mood=mood, top_post=POSTS[run][rnd - 1],
        )
        with open(f"data/run_{run}/round_{rnd}.json", "w", encoding="utf-8") as fp:
            json.dump(snap.model_dump(by_alias=True), fp, ensure_ascii=False, indent=2)
    return hc, cum


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    for run in ("A", "B"):
        hc, cum = build(run)
        print(f"run_{run}  期末在册 {sum(hc.values())}  累计失业 {cum['unemployed']}  退出 {cum['exited']}")
    print(f"契约版本 {CONTRACT_VERSION}  ->  data/run_A/  data/run_B/")
