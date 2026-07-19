"""Load layer YAML files into frozen dataclasses. Raise LoaderError on bad input."""

from __future__ import annotations

from pathlib import Path

import yaml

from context import models as m


class LoaderError(ValueError):
    pass


def _read(path: str | Path) -> dict:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise LoaderError(f"{path}: expected a YAML mapping")
    return data


def _req(data: dict, key: str, path) -> object:
    if key not in data or data[key] in (None, ""):
        raise LoaderError(f"{path}: missing required field {key!r}")
    return data[key]


def _tuple(value) -> tuple:
    if value is None:
        return ()
    return tuple(value) if isinstance(value, (list, tuple)) else (value,)


def load_meta(data: dict) -> m.LayerMeta:
    return m.LayerMeta(id=str(data.get("id", "")), version=int(data.get("version", 1)),
                       priority=int(data.get("priority", 0)))


def load_system(path) -> m.SystemRules:
    d = _read(path)
    return m.SystemRules(meta=load_meta(d), role=str(_req(d, "role", path)),
                         rules=_tuple(_req(d, "rules", path)))


def load_policy(path) -> m.ConversationPolicy:
    d = _read(path)
    return m.ConversationPolicy(meta=load_meta(d), rules=_tuple(_req(d, "rules", path)))


def load_company(path) -> m.Company:
    d = _read(path)
    return m.Company(meta=load_meta(d), name=str(_req(d, "name", path)),
                     industry=str(_req(d, "industry", path)),
                     sub_industry=str(d.get("sub_industry", "")),
                     business_stage=str(d.get("business_stage", "")),
                     initiatives=_tuple(d.get("initiatives")))


def load_persona(path) -> m.Persona:
    d = _read(path)
    return m.Persona(
        meta=load_meta(d), name=str(_req(d, "name", path)), title=str(d.get("title", "")),
        age=str(d.get("age", "")), personality=_tuple(d.get("personality")),
        communication_style=str(d.get("communication_style", "")),
        decision_style=str(d.get("decision_style", "")), values=_tuple(d.get("values")),
        risk_tolerance=str(d.get("risk_tolerance", "")),
        company_id=str(_req(d, "company_id", path)),
        briefing_summary=str(d.get("briefing_summary", "")))


def load_scenario(path) -> m.Scenario:
    d = _read(path)
    return m.Scenario(meta=load_meta(d), call_type=str(_req(d, "call_type", path)),
                      context=str(_req(d, "context", path)),
                      buyer_goal=str(_req(d, "buyer_goal", path)),
                      hidden_information=str(d.get("hidden_information", "")),
                      default_objection_ids=_tuple(d.get("default_objection_ids")))


def load_objection_card(path) -> m.ObjectionCard:
    d = _read(path)
    return m.ObjectionCard(
        meta=load_meta(d), trigger=str(_req(d, "trigger", path)),
        emotion=str(d.get("emotion", "")), buyer_language=_tuple(_req(d, "buyer_language", path)),
        acceptable_resolution=str(d.get("acceptable_resolution", "")),
        coach_signal=str(d.get("coach_signal", "")))


def load_difficulty(path) -> m.Difficulty:
    d = _read(path)
    return m.Difficulty(meta=load_meta(d), level=str(_req(d, "level", path)),
                        framing=str(_req(d, "framing", path)))


def load_call_type(path) -> m.CallType:
    d = _read(path)
    return m.CallType(meta=load_meta(d), call_type=str(_req(d, "call_type", path)),
                      frame=str(_req(d, "frame", path)),
                      rep_objective=str(_req(d, "rep_objective", path)))


def load_scorecard(path) -> m.ScorecardConfig:
    d = _read(path)
    return m.ScorecardConfig(meta=load_meta(d), name=str(_req(d, "name", path)),
                             criteria=tuple(_req(d, "criteria", path)))
