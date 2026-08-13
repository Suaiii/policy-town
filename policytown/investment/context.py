from __future__ import annotations

import math
from dataclasses import dataclass

from contracts.investment_simulation_v0_1 import (
    CityMetrics,
    CompanyState,
    ContextDerivation,
    RawObservation,
    RealDataContext,
)

from .loader import HefeiMvpLoader
from .real_data import HefeiRealDataRepository


def _clamp(value: float, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, round(value)))


@dataclass(frozen=True)
class ContextProjection:
    city: CityMetrics
    companies: list[CompanyState]
    context: RealDataContext


@dataclass(frozen=True)
class ContextAdjustment:
    entity_id: str
    metric_id: str
    delta: int
    formula: str
    evidence_ids: list[str]


class HefeiContextBuilder:
    """把截止日前真实观测映射成场景指数，不让原始数值直接混入规则。"""

    COMPANY_ENTITIES = {
        "company_a": {"boe", "proj_boe_6g", "ind_display", "ind_home_appliance"},
        "company_b": {"cxmt", "ind_display"},
        "company_c": {"xinhao", "proj_xinhao_pdp", "ind_equipment"},
        "company_d": {"ldk_hefei", "ind_pv"},
        "company_e": {"ind_equipment"},
        "company_f": set(),
    }

    # Keep the parent company's SEC figures in a separate unit domain.  The
    # Hefei subsidiary is reported in RMB 亿元 while LDK parent figures are in
    # USD millions; only dimensionless ratios/signals may cross this boundary.
    PARENT_ENTITIES = {
        "company_d": {"ldk"},
    }

    AGENT_DOMAINS = {
        "fiscal": {"government", "project", "world"},
        "industry": {"industry", "world", "talent", "infrastructure"},
        "technology": {"company", "project", "talent"},
        "market": {"industry", "world"},
    }

    def __init__(self, loader: HefeiMvpLoader, repository: HefeiRealDataRepository) -> None:
        self.loader = loader
        self.repository = repository

    def project(self, company_ids: list[str], cutoff_at: str) -> ContextProjection:
        city = self.loader.initial_city_metrics().model_copy(deep=True)
        companies = self.loader.load_companies(company_ids)
        context = self.repository.context_at(cutoff_at)
        derivations = [*self._city_derivations(context)]
        for company in companies:
            derivations.extend(self._company_derivations(company.company_id, context))
        context.derivations = derivations
        for item in derivations:
            target = city if item.entity_id == "city" else next(
                (company for company in companies if company.company_id == item.entity_id), None
            )
            if target is not None and hasattr(target, item.metric_id):
                setattr(target, item.metric_id, item.value)
        return ContextProjection(city=city, companies=companies, context=context)

    def adjustments(
        self,
        company_ids: list[str],
        previous_cutoff: str,
        current_cutoff: str,
    ) -> tuple[list[ContextAdjustment], RealDataContext]:
        previous = self.project(company_ids, previous_cutoff)
        current = self.project(company_ids, current_cutoff)
        previous_values = {
            (item.entity_id, item.metric_id): item.value for item in previous.context.derivations
        }
        base_city = self.loader.initial_city_metrics()
        base_companies = {item.company_id: item for item in self.loader.load_companies(company_ids)}
        result: list[ContextAdjustment] = []
        for item in current.context.derivations:
            key = (item.entity_id, item.metric_id)
            if key in previous_values:
                before = previous_values[key]
            elif item.entity_id == "city" and hasattr(base_city, item.metric_id):
                before = int(getattr(base_city, item.metric_id))
            elif item.entity_id in base_companies and hasattr(base_companies[item.entity_id], item.metric_id):
                before = int(getattr(base_companies[item.entity_id], item.metric_id))
            else:
                continue
            delta = item.value - before
            if delta:
                result.append(ContextAdjustment(
                    entity_id=item.entity_id,
                    metric_id=item.metric_id,
                    delta=delta,
                    formula=item.formula,
                    evidence_ids=item.evidence_ids,
                ))
        return result, current.context

    @staticmethod
    def index(context: RealDataContext, entity_id: str, metric_id: str) -> int | None:
        item = next(
            (item for item in context.derivations if item.entity_id == entity_id and item.metric_id == metric_id),
            None,
        )
        return item.value if item else None

    def evidence_ids(self, company_id: str, agent: str, context: RealDataContext) -> list[str]:
        entities = self.COMPANY_ENTITIES.get(company_id, set()) | self.PARENT_ENTITIES.get(company_id, set())
        domains = self.AGENT_DOMAINS[agent]
        company_specific = [
            f"observation:{item.observation_id}"
            for item in context.observations
            if item.entity_id in entities and item.domain in domains
        ]
        city_context = [
            f"observation:{item.observation_id}"
            for item in context.observations
            if item.entity_id == "hefei" and item.domain in domains
        ]
        derived = [
            evidence_id
            for item in context.derivations
            if item.entity_id in {"city", company_id}
            for evidence_id in item.evidence_ids
        ]
        policy_ids = [f"policy:{item['policy_id']}" for item in context.policies]
        return list(dict.fromkeys([*company_specific[-8:], *city_context[-6:], *derived, *policy_ids[-4:]]))

    def _city_derivations(self, context: RealDataContext) -> list[ContextDerivation]:
        result: list[ContextDerivation] = []
        gdp = self._latest(context, "gdp", {"hefei"})
        secondary = self._latest(context, "secondary_value_added", {"hefei"})
        home_share = self._latest(context, "city_industry_share", {"ind_home_appliance"})
        if gdp and secondary and float(gdp.value) > 0:
            share = 100 * float(secondary.value) / float(gdp.value)
            value = _clamp(share + (float(home_share.value) if home_share else 0))
            result.append(self._derived(
                "city", "industrial_base", value,
                "secondary_value_added / gdp * 100 + home_appliance_share",
                [secondary, gdp, home_share],
            ))

        industrial_output = self._latest(context, "industrial_output", {"ind_home_appliance"})
        if industrial_output or home_share:
            value = _clamp(
                25
                + (float(industrial_output.value) / 10 if industrial_output else 0)
                + (float(home_share.value) if home_share else 0)
            )
            result.append(self._derived(
                "city", "supply_chain_strength", value,
                "25 + home_appliance_output / 10 + home_appliance_share",
                [industrial_output, home_share],
            ))

        growth = self._latest(context, "gdp_growth", {"hefei"})
        if growth:
            result.append(self._derived(
                "city", "market_cycle", _clamp((float(growth.value) - 10) * 5, -100, 100),
                "(latest_published_gdp_growth - 10) * 5",
                [growth],
            ))

        fixed_investment = self._latest(context, "fixed_asset_investment", {"hefei"})
        if fixed_investment and gdp and float(gdp.value) > 0:
            result.append(self._derived(
                "city", "infrastructure_capacity",
                _clamp(30 + 20 * float(fixed_investment.value) / float(gdp.value)),
                "30 + fixed_asset_investment / gdp * 20",
                [fixed_investment, gdp],
            ))

        talent = {
            key: self._latest(context, key, {"hefei"})
            for key in ("universities", "students", "key_labs")
        }
        if sum(item is not None for item in talent.values()) >= 2:
            components = []
            if talent["universities"]:
                components.append(float(talent["universities"].value) / 80 * 100)
            if talent["students"]:
                components.append(float(talent["students"].value) / 80 * 100)
            if talent["key_labs"]:
                components.append(float(talent["key_labs"].value) / 160 * 100)
            result.append(self._derived(
                "city", "talent_supply", _clamp(sum(components) / len(components)),
                "mean(universities/80, students/80, key_labs/160) * 100",
                list(talent.values()),
            ))

        fiscal = self._latest_any(
            context, ("fiscal_revenue_local", "fiscal_revenue_total"), {"hefei"}
        )
        if fiscal and gdp and float(gdp.value) > 0:
            result.append(self._derived(
                "city", "fiscal_capacity",
                _clamp(float(fiscal.value) / float(gdp.value) * 400),
                "latest_published_fiscal_revenue / gdp * 400",
                [fiscal, gdp],
            ))
            result.append(self._derived(
                "city", "portfolio_public_value",
                _clamp(float(fiscal.value) / float(gdp.value) * 350),
                "latest_published_fiscal_revenue / gdp * 350",
                [fiscal, gdp],
            ))

        if context.policies:
            result.append(ContextDerivation(
                entity_id="city",
                metric_id="policy_support",
                value=_clamp(45 + len(context.policies) * 8),
                value_type="derived",
                formula="45 + available_policy_count * 8",
                evidence_ids=[f"policy:{item['policy_id']}" for item in context.policies],
                confidence=.86,
            ))
        return result


    def _company_derivations(self, company_id: str, context: RealDataContext) -> list[ContextDerivation]:
        entities = self.COMPANY_ENTITIES.get(company_id, set())
        if not entities:
            return []
        result: list[ContextDerivation] = []
        investment = self._latest(context, "total_investment", entities)
        if investment and float(investment.value) >= 0:
            intensity = _clamp(40 + math.log10(float(investment.value) + 1) * 20)
            result.append(self._derived(
                company_id, "capital_intensity", intensity,
                "40 + log10(total_investment + 1) * 20",
                [investment],
            ))
            result.append(self._derived(
                company_id, "capital_request", _clamp(intensity * .65, 10, 80),
                "capital_intensity * 0.65",
                [investment],
            ))
        elif company_id == "company_a":
            # The S1 BOE project record is a key grounding fact.  When it is
            # absent from a copied/partial evidence store, surface the gap in
            # the derived context instead of silently preserving the fixture's
            # seeded capital intensity and request.
            result.append(self._derived(
                company_id, "capital_intensity", 0,
                "missing total_investment evidence",
                [],
            ))
            result.append(self._derived(
                company_id, "capital_request", 10,
                "missing total_investment evidence; conservative floor",
                [],
            ))

        assets = self._latest(context, "assets", entities)
        liabilities = self._latest(context, "liabilities", entities)
        net_profit = self._latest(context, "net_profit", entities)
        cashflow = self._latest(context, "operating_cash_flow", entities)

        # Parent-company credit is deliberately derived as a dimensionless
        # signal.  It never merges USD amounts into the subsidiary's RMB
        # balance sheet.  The signal is used to update the enterprise's
        # financing belief and to temper its operating financial health.
        parent_entities = self.PARENT_ENTITIES.get(company_id, set())
        parent_assets = self._latest(context, "assets", parent_entities)
        parent_liabilities = self._latest(context, "liabilities", parent_entities)
        parent_profit = self._latest(context, "net_profit", parent_entities)
        parent_cashflow = self._latest(context, "operating_cash_flow", parent_entities)
        parent_health: ContextDerivation | None = None
        if parent_assets and parent_liabilities and float(parent_assets.value) > 0:
            leverage = float(parent_liabilities.value) / float(parent_assets.value)
            profit_margin = (
                float(parent_profit.value) / float(parent_assets.value)
                if parent_profit is not None else 0.0
            )
            cashflow_sign = 5 if parent_cashflow is not None and float(parent_cashflow.value) >= 0 else -5
            parent_health = self._derived(
                company_id,
                "parent_financing_health",
                _clamp(60 - leverage * 45 + profit_margin * 100 + cashflow_sign),
                "60 - parent_liabilities / parent_assets * 45 + parent_net_profit / parent_assets * 100 + parent_cashflow_sign",
                [parent_assets, parent_liabilities, parent_profit, parent_cashflow],
            )
            result.append(parent_health)

        if assets and liabilities and float(assets.value) > 0:
            equity_ratio = 1 - float(liabilities.value) / float(assets.value)
            profit_adjustment = 0
            if net_profit:
                profit_adjustment = max(-15, min(15, float(net_profit.value) / float(assets.value) * 100))
            cash_adjustment = 5 if cashflow and float(cashflow.value) >= 0 else -5
            base_health = _clamp(50 + (equity_ratio - .4) * 50 + profit_adjustment + cash_adjustment)
            if parent_health is not None:
                # Parent credit affects the subsidiary, but only as a bounded
                # adjustment to the local signal; no currency conversion is
                # performed and the parent observation remains auditable.
                base_health = _clamp(base_health + (parent_health.value - 50) * .35)
            result.append(self._derived(
                company_id, "financial_health",
                base_health,
                "local_financial_health + (parent_financing_health - 50) * 0.35",
                [assets, liabilities, net_profit, cashflow, *(
                    [item for item in (parent_assets, parent_liabilities, parent_profit, parent_cashflow)
                     if item is not None]
                )],
            ))
        if cashflow and assets and float(assets.value) > 0:
            result.append(self._derived(
                company_id, "project_cashflow",
                _clamp(float(cashflow.value) / float(assets.value) * 500, -100, 100),
                "operating_cash_flow / assets * 500",
                [cashflow, assets],
            ))

        industry_growth = self._latest(context, "industry_growth", entities)
        wafer_asp = self._latest(context, "wafer_asp", parent_entities)
        polysilicon_price = self._latest(context, "polysilicon_purchase_price", parent_entities)
        if industry_growth:
            result.append(self._derived(
                company_id, "customer_order_strength",
                _clamp(50 + float(industry_growth.value)),
                "50 + latest_industry_growth",
                [industry_growth],
            ))
        if industry_growth or wafer_asp or polysilicon_price:
            pressure_parts: list[int] = []
            pressure_evidence: list[RawObservation | None] = [industry_growth]
            if industry_growth:
                pressure_parts.append(_clamp(50 - float(industry_growth.value) / 2))
            if wafer_asp:
                pressure_parts.append(_clamp(100 - float(wafer_asp.value) / 2.35 * 100))
                pressure_evidence.append(wafer_asp)
            if polysilicon_price:
                pressure_parts.append(_clamp(100 - float(polysilicon_price.value) / 261.8 * 100))
                pressure_evidence.append(polysilicon_price)
            result.append(self._derived(
                company_id, "supply_pressure",
                max(pressure_parts),
                "max(50 - industry_growth / 2, 100 - wafer_asp / 2.35 * 100, 100 - polysilicon_purchase_price / 261.8 * 100)",
                pressure_evidence,
            ))
        return result

    @staticmethod
    def _latest(context: RealDataContext, indicator: str, entities: set[str]) -> RawObservation | None:
        matches = [
            item for item in context.observations
            if item.indicator_id == indicator and item.entity_id in entities and isinstance(item.value, (int, float))
        ]
        return max(matches, key=lambda item: (item.information_available_date, item.observation_id), default=None)

    def _latest_any(
        self, context: RealDataContext, indicators: tuple[str, ...], entities: set[str]
    ) -> RawObservation | None:
        matches = [self._latest(context, indicator, entities) for indicator in indicators]
        available = [item for item in matches if item is not None]
        return max(available, key=lambda item: (item.information_available_date, item.observation_id), default=None)

    @staticmethod
    def _derived(
        entity_id: str,
        metric_id: str,
        value: int,
        formula: str,
        observations: list[RawObservation | None],
    ) -> ContextDerivation:
        available = [item for item in observations if item is not None]
        quality_weights = {"A": .96, "B": .82, "C": .65, "D": .35}
        confidence = min((quality_weights[item.quality] for item in available), default=.35)
        return ContextDerivation(
            entity_id=entity_id,
            metric_id=metric_id,
            value=value,
            value_type="derived",
            formula=formula,
            evidence_ids=[f"observation:{item.observation_id}" for item in available],
            confidence=confidence,
        )
