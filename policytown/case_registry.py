from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, HttpUrl, model_validator


class CaseSource(BaseModel):
    case_id: str
    title: str
    source_type: str
    publisher: str
    published_at: date
    source_url: HttpUrl
    verification: Literal["secondary_public_source", "primary_public_source"]
    identity_policy: Literal["do_not_impersonate_company"]


class PublicFact(BaseModel):
    fact_id: str
    statement: str
    status: Literal["reported", "verified"]
    confidence: Literal["L1", "L2"]


class Mechanism(BaseModel):
    mechanism_id: str
    source_fact_ids: list[str] = Field(min_length=1)
    action_intents: list[str] = Field(min_length=1)
    affected_dimensions: list[str] = Field(min_length=1)


class UnknownRegistry(BaseModel):
    unknowns: list[str] = Field(min_length=1)
    policy: Literal["must_remain_unknown"]


class TimelineEntry(BaseModel):
    order: int = Field(ge=1)
    event: str
    provenance: Literal["public_fact", "scenario_assumption"]


class PublicCasePackage(BaseModel):
    source: CaseSource
    facts: list[PublicFact]
    mechanisms: list[Mechanism]
    unknowns: UnknownRegistry
    timeline: list[TimelineEntry]

    @model_validator(mode="after")
    def cross_references_are_valid(self) -> "PublicCasePackage":
        fact_ids = {item.fact_id for item in self.facts}
        if len(fact_ids) != len(self.facts):
            raise ValueError("duplicate fact_id")
        mechanism_ids = {item.mechanism_id for item in self.mechanisms}
        if len(mechanism_ids) != len(self.mechanisms):
            raise ValueError("duplicate mechanism_id")
        missing = {ref for mechanism in self.mechanisms for ref in mechanism.source_fact_ids if ref not in fact_ids}
        if missing:
            raise ValueError(f"mechanisms reference unknown facts: {sorted(missing)}")
        orders = [item.order for item in self.timeline]
        if orders != list(range(1, len(orders) + 1)):
            raise ValueError("timeline order must be contiguous and sorted")
        return self


def load_case_package(path: str | Path) -> PublicCasePackage:
    root = Path(path)
    read = lambda name: yaml.safe_load((root / name).read_text(encoding="utf-8"))
    return PublicCasePackage(
        source=read("source.yaml"),
        facts=read("facts.yaml"),
        mechanisms=read("mechanisms.yaml"),
        unknowns=read("unknowns.yaml"),
        timeline=read("timeline.yaml"),
    )
