"""
大厂 Town · 数据契约 v1.0  【H0 冻结，字段名不许改】

改动流程：改字段 -> 找 P0 -> P0 群里广播 -> 版本号 +0.1
私自改字段导致的联调事故，由改的人负责修。

四个模型：
    Policy       政府 -> 企业        （四部门联席会的产物）
    FirmAction   企业 -> 引擎
    WorkerAction 员工 -> 引擎
    Snapshot     引擎 -> 前端        （前端唯一数据源）
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

CONTRACT_VERSION = "1.2"

# ---------------------------------------------------------------- 枚举

FirmId = Literal["A", "B", "C", "D"]
# A=成熟期大厂(放人)  B=增长期大厂(接人)  C=AI转型大厂(换人)  D=外包服务商(承接)

SkillType = Literal["traditional", "ai"]

DeptName = Literal["人社", "财政", "产业", "监管"]

WorkerAction_ = Literal[
    "sign",              # 签字接受协商
    "delay",             # 拒签、拖延谈判
    "arbitrate",         # 申请劳动仲裁
    "expose",            # 社交媒体曝光
    "accept_transfer",   # 接受转岗 / 转外包
    "jobhunt",           # 骑驴找马 / 主动求职
    "exit_labor_force",  # 退出劳动力市场  ★隐性失业
]

WorkerStatus = Literal[
    "employed",      # 在职
    "notified",      # 收到优化通知，协商中
    "arbitrating",   # 仲裁中
    "jobseeking",    # 求职中
    "reemployed",    # 已再就业
    "outsourced",    # 已转外包（统计上仍在就业，但处境变差）
    "unemployed",    # 失业
    "exited",        # 退出劳动力市场
]

# 桑基图的节点：企业 id + 这几个源/终点
#   entrants   = 本轮新进入劳动力市场的应届生 ★校招腰斩打到的就是他们
#   market     = 人才市场中转池
FlowNode = Literal[
    "A", "B", "C", "D", "entrants", "market", "unemployed", "exited"
]


# ---------------------------------------------------------------- 1. Policy

class CompromiseEntry(BaseModel):
    """联席会妥协记录的一条。溯源面板最好看的东西，别省。"""
    dept: DeptName
    asked: str = Field(..., description="该部门原本要什么")
    final: str = Field(..., description="最终落地成什么")
    blocked_by: Optional[DeptName] = Field(None, description="被谁挡了，全额通过则为 None")
    reason: str = Field(..., description="为什么被挡，一句话")


class Policy(BaseModel):
    round: int
    active: bool = Field(True, description="False 表示本轮无政策（基线期）")

    layoff_threshold: int = Field(999, description="单次经济性裁员报备门槛（人）。999=无管制")
    compensation_multiple: str = Field("N+1", description="补偿标准，形如 N+1 / N+2 / N+3")
    enforcement: float = Field(0.0, ge=0.0, le=1.0, description="执法强度")
    skill_subsidy: float = Field(0.0, ge=0.0, description="技能转换补贴，单位：万元/人")
    hiring_subsidy: float = Field(0.0, ge=0.0, description="稳岗/招聘补贴，单位：万元/人")

    policy_text: str = Field("", description="发布给企业和员工看的政策原文")
    compromise_log: list[CompromiseEntry] = Field(default_factory=list)


# ---------------------------------------------------------------- 2. FirmAction

class FirmAction(BaseModel):
    firm_id: FirmId
    round: int

    # --- 放人侧
    layoff_batches: list[int] = Field(
        default_factory=list,
        description="★ 本轮各批次的裁员人数。直方图的数据源，尖峰要靠它才画得出来",
    )
    layoff_formal: int = Field(0, description="正式裁员总数 = sum(layoff_batches)")
    channel_outsource: int = Field(0, description="转外包人数（不计入正式裁员）")
    channel_transfer: int = Field(0, description="调岗逼退人数")
    channel_attrition: int = Field(0, description="自然减员/不续签")

    # --- 接人侧  ★★ 监管悖论的唯一证据，任何降级都不许砍这两个字段
    hiring_campus: int = Field(0, description="校招名额")
    hiring_social: int = Field(0, description="社招名额")

    # --- 决策参数
    comp_offer: float = Field(1.0, description="补偿报价倍数，如 2.0 表示 N+2")
    expected_future_firing_cost: float = Field(
        0.0, ge=0.0, le=1.0,
        description="★ 该企业对『未来解雇成本』的预期。监管悖论的因果链证据",
    )

    # --- 溯源
    reasoning: str = Field("", description="完整推理。要求 prompt 里先说权衡再给结论")
    worry: str = Field("", description="它最担心什么，一句话")

    def check(self) -> None:
        assert self.layoff_formal == sum(self.layoff_batches), \
            f"{self.firm_id} R{self.round}: layoff_formal 与 batches 不一致"


# ---------------------------------------------------------------- 3. WorkerAction

class WorkerAction(BaseModel):
    worker_id: str
    round: int
    firm_id: Optional[FirmId] = None

    # 三维异质性（初始化时注入，全程不变）
    skill_type: SkillType
    savings_months: int = Field(..., description="存款能撑几个月，决定议价能力")
    rights_prior: float = Field(..., ge=0.0, le=1.0, description="相信维权能赢的概率")

    cohort_weight: int = Field(1, description="该 agent 代表的人群规模，10 个之和 = 8500")
    cohort_label: str = Field("", description="人群名称，如『A厂传统岗 · 无缓冲』")
    cohort_share: float = Field(
        0.0, ge=0.0, le=1.0,
        description="本轮该人群中真正走了这条路的比例，由宏观 flows 反推",
    )

    status: WorkerStatus = "employed"
    action: Optional[WorkerAction_] = Field(None, description="本轮无事发生则为 None")
    target: Optional[FlowNode] = Field(None, description="流向哪里")

    # --- 溯源。★ hesitation 是溯源面板里最打动人的素材，prompt 必须要求输出
    reasoning: str = ""
    hesitation: str = ""


# ---------------------------------------------------------------- 4. Snapshot

class Flow(BaseModel):
    """桑基图的一条边。单位：人。"""
    from_: FlowNode = Field(..., alias="from")
    to: FlowNode
    count: int
    skill: SkillType

    model_config = {"populate_by_name": True}


class Metrics(BaseModel):
    employment_total: int = Field(..., description="四家主体在册总人数")
    formal_layoff: int = Field(..., description="本轮全市正式裁员数")
    outsource_share: float = Field(..., description="外包用工占比")
    reemployment_rate: float = Field(..., description="被放出者的再就业率")
    hidden_unemployment: int = Field(..., description="★ 退出劳动力市场的累计人数")
    skill_mismatch_gap: int = Field(
        ..., description="★ 同时存在的『失业人数』与『C厂招不到的岗位数』的较小值"
    )
    unemployment_rate: float = Field(..., description="官方口径失业率（转外包的人算就业）")
    kpi: dict[str, float] = Field(..., description="四部门 KPI，键为 DeptName，值 0-1")


class Snapshot(BaseModel):
    """引擎每轮落盘一个。前端只读这个，不调任何后端接口。"""
    contract_version: str = CONTRACT_VERSION
    run_id: str = Field(..., description="A=无管制基线 / B=直接管制 / C=技能补贴")
    round: int

    policy: Policy
    firms: list[FirmAction]
    workers: list[WorkerAction]
    flows: list[Flow]
    metrics: Metrics

    # 社交层输出。P1 没通就用这两个外生默认值，不阻塞任何人
    sentiment_heat: float = Field(0.0, ge=0.0, le=1.0, description="舆情热度")
    group_mood: float = Field(0.5, ge=0.0, le=1.0, description="群体情绪，越低越悲观")
    top_post: str = Field("", description="本轮社交场上传播最广的一条，Demo 里可以直接念")


# ---------------------------------------------------------------- 落盘约定

def snapshot_path(run_id: str, rnd: int) -> str:
    """data/run_{run_id}/round_{n}.json —— 前端 glob 这个目录，别改。"""
    return f"data/run_{run_id}/round_{rnd}.json"
