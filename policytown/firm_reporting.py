from __future__ import annotations

from pydantic import BaseModel, Field

from .case_registry import PublicCasePackage
from .firm_reality import DecisionTrace
from .models import RiskFinding
from .reality_detectors import detect_firm_reality


class MetricDefinition(BaseModel):
    id: str
    definition: str
    source: str
    purpose: str


class CounterfactualResult(BaseModel):
    baseline: str
    candidate: str
    metric: str
    baseline_value: int
    candidate_value: int
    absolute_change: int
    relative_change: float
    interpretation: str


class PolicyPatch(BaseModel):
    id: str
    title: str
    changes_boundary: str
    supported_by: list[str]
    validation_metric: str
    expected_direction: str


class FirmRealityReport(BaseModel):
    case_id: str
    subject: str
    claim: str
    experiment_purpose: str
    comparison_method: str
    metrics: list[MetricDefinition]
    results: list[CounterfactualResult]
    findings: list[RiskFinding]
    policy_patches: list[PolicyPatch]
    timing_analysis: dict[str, int | str]
    judge_questions: dict[str, str]
    limitations: list[str] = Field(min_length=1)


def _comparison(baseline: DecisionTrace, candidate: DecisionTrace) -> CounterfactualResult:
    base = baseline.settlement.net_unemployment
    cur = candidate.settlement.net_unemployment
    return CounterfactualResult(
        baseline=baseline.settlement.scenario_id,
        candidate=candidate.settlement.scenario_id,
        metric="net_unemployment",
        baseline_value=base,
        candidate_value=cur,
        absolute_change=cur - base,
        relative_change=round(cur / base - 1, 4) if base else 0,
        interpretation=f"在相同匿名企业状态下，仅改变工具组合后，规则结算的净失业由 {base} 变为 {cur}。",
    )


def build_firm_reality_report(case: PublicCasePackage, traces: list[DecisionTrace]) -> FirmRealityReport:
    by_id = {item.settlement.scenario_id: item for item in traces}
    findings = detect_firm_reality(traces)
    results = [_comparison(by_id["A0"], by_id[target]) for target in ("A1", "A2", "A3")]
    return FirmRealityReport(
        case_id=case.source.case_id,
        subject="匿名化头部平台办公产品企业 A",
        claim="内部转岗可以缓冲净失业，但技能门槛与地域迁移会削弱效果；培训和政府承接改变的是边界，而不是企业 AI 重组战略。",
        experiment_purpose="验证公开案例中出现的内部活水与区域集中机制，在同一企业状态下如何响应不同工具组合。",
        comparison_method="固定企业状态与 RuleLedger，依次比较无转岗、转岗、迁移支持、培训与政府承接四个方案。",
        metrics=[MetricDefinition(id="net_unemployment", definition="受影响人数扣除内部转岗、外包承接与政府承接后的正式离开人数。", source="RuleLedger firm_settlement_v1", purpose="比较不同工具组合对最终就业结果的边际影响。")],
        results=results,
        findings=findings,
        policy_patches=[
            PolicyPatch(id="relocation_support", title="提供迁移支持", changes_boundary="提高转岗资格人群的迁移接受度", supported_by=["internal_transfer_failure", "A1_vs_A2"], validation_metric="net_unemployment", expected_direction="decrease"),
            PolicyPatch(id="training_and_bridge", title="培训与政府承接组合", changes_boundary="提高技能匹配并承接仍未被市场吸收的人群", supported_by=["tool_disease_mismatch", "A2_vs_A3"], validation_metric="net_unemployment", expected_direction="decrease"),
        ],
        timing_analysis={
            "training_months": by_id["A3"].tools.training_months,
            "government_bridge_start_month": by_id["A3"].tools.bridge_start_month,
            "workers_waiting_for_training": by_id["A3"].settlement.workers_waiting_for_training,
            "workers_without_savings_buffer": by_id["A3"].settlement.workers_without_savings_buffer,
            "interpretation": "培训与承接工具虽然降低最终净失业，但生效前仍存在等待期；缺少储蓄缓冲的人群可能等不到工具兑现。",
        },
        judge_questions={
            "why_adjust": "AI 产品协同与组织重构是公开回应支持的机制，场景中企业战略目标保持不变。",
            "why_transfer_first": "公开案例出现内部活水机制；在模型中它先于正式离开结算，作为第一道缓冲。",
            "why_traditional_skills_fail_more": "技能匹配率限制可获得承接岗位的人数，地域接受度进一步限制最终接受人数。",
            "what_government_changes": "政府工具提高培训匹配、迁移接受或承接容量，不直接把企业战略改成停止调整。",
            "fact_or_assumption": "每条结果链区分 public_fact、mechanism、scenario_assumption 与 rule_result。",
            "how_measured": "人数仅由 RuleLedger 按固定状态与工具参数结算，Agent 只给方向性意图。",
            "what_is_not_claimed": "不复原腾讯真实人数、真实转岗成功率、补偿条款或未来决策。",
        },
        limitations=["公开材料仅为二手公开来源，支持机制校准而非企业内部事实复原。", "数值均为场景假设与确定性规则结果，不能外推为现实点预测。", "窄场景未模拟长期宏观反馈、个体异质性与多企业策略互动。"],
    )
