from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from .firm_reality import FirmIntent, default_intent


FORBIDDEN_RESULT_KEYS = {
    "affected_workers",
    "transfer_eligible",
    "internal_transfer_accepted",
    "relocation_declined",
    "channel_outsource",
    "government_bridged",
    "layoff_formal",
    "net_unemployment",
    "headcount",
    "people",
}


class IntentValidationError(ValueError):
    pass


def _all_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {key for item in value.values() for key in _all_keys(item)}
    if isinstance(value, list):
        return {key for item in value for key in _all_keys(item)}
    return set()


class FirmDecisionGateway:
    """Schema firewall between an LLM and deterministic settlement."""

    name = "firm-decision-gateway-v1"

    def parse(self, payload: str | dict[str, Any]) -> FirmIntent:
        try:
            raw = json.loads(payload) if isinstance(payload, str) else payload
        except json.JSONDecodeError as exc:
            raise IntentValidationError(f"invalid JSON: {exc.msg}") from exc
        if not isinstance(raw, dict):
            raise IntentValidationError("firm intent must be a JSON object")
        forbidden = sorted(_all_keys(raw) & FORBIDDEN_RESULT_KEYS)
        if forbidden:
            raise IntentValidationError(f"LLM attempted to emit rule-owned fields: {', '.join(forbidden)}")
        try:
            return FirmIntent.model_validate(raw)
        except ValidationError as exc:
            raise IntentValidationError(str(exc)) from exc

    def parse_or_fallback(self, payload: str | dict[str, Any]) -> tuple[FirmIntent, bool, str | None]:
        try:
            return self.parse(payload), False, None
        except IntentValidationError as exc:
            return default_intent(), True, str(exc)
