"""Fail-fast validation of a Context before rendering. Never silently recover."""

from __future__ import annotations

from context import models as m


class ValidationError(ValueError):
    pass


def validate(context: m.Context) -> None:
    if not context.persona.name:
        raise ValidationError("persona has no name")
    if not context.scenario.buyer_goal:
        raise ValidationError("scenario has no buyer_goal")
    if not context.difficulty.framing:
        raise ValidationError("difficulty has no framing")
    if not context.call_type.frame:
        raise ValidationError("call_type has no frame")
    if not context.objection_pack.cards:
        raise ValidationError("objection_pack is empty")
    if not context.evaluation_config.criteria:
        raise ValidationError("evaluation_config has no criteria")
