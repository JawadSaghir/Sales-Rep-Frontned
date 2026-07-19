"""Assemble a Selection into a Context + ContextManifest. Pure loading + composition."""

from __future__ import annotations

import re
from pathlib import Path

from context import CONTEXT_DATA, loaders
from context import models as m

_OMITTED = ("knowledge", "state", "memory")

# Layer ids become file paths, and several flow from untrusted room metadata
# (persona/scenario/difficulty/call_type/scorecard/objection ids). Constrain
# them to a safe charset so a value like "../scorecards/closing_v1" cannot
# escape the data dir and load an unintended YAML into the buyer prompt.
_VALID_ID = re.compile(r"[a-z0-9_-]+")


class AssembleError(FileNotFoundError):
    pass


def merge_objection_ids(default: tuple[str, ...], add: tuple[str, ...],
                        remove: tuple[str, ...]) -> tuple[str, ...]:
    ordered, seen = [], set()
    for i in (*default, *add):
        if i not in seen and i not in remove:
            seen.add(i)
            ordered.append(i)
    return tuple(ordered)


def _path(data_dir: Path, kind: str, name: str) -> Path:
    if not _VALID_ID.fullmatch(name):
        raise AssembleError(f"invalid layer id {name!r} for {kind}")
    p = data_dir / kind / f"{name}.yaml"
    if not p.is_file():
        raise AssembleError(f"missing context layer: {kind}/{name}.yaml")
    return p


def assemble(selection: m.Selection,
             data_dir: Path = CONTEXT_DATA) -> tuple[m.Context, m.ContextManifest]:
    system = loaders.load_system(_path(data_dir, "system", "system"))
    policy = loaders.load_policy(_path(data_dir, "policy", "conversation"))
    persona = loaders.load_persona(_path(data_dir, "personas", selection.persona_id))
    company = loaders.load_company(_path(data_dir, "companies", persona.company_id))
    scenario = loaders.load_scenario(_path(data_dir, "scenarios", selection.scenario_id))
    difficulty = loaders.load_difficulty(_path(data_dir, "difficulty", selection.difficulty))
    call_type = loaders.load_call_type(_path(data_dir, "call_types", selection.call_type))
    scorecard = loaders.load_scorecard(_path(data_dir, "scorecards", selection.scorecard))

    ids = merge_objection_ids(scenario.default_objection_ids,
                              selection.add_objection_ids, selection.remove_objection_ids)
    cards = tuple(loaders.load_objection_card(_path(data_dir, "objections", i)) for i in ids)

    ctx = m.Context(
        system=system, conversation_policy=policy, persona=persona, company=company,
        knowledge=m.KnowledgeBundle(items=()), scenario=scenario,
        objection_pack=m.ObjectionPack(cards=cards), difficulty=difficulty,
        call_type=call_type, evaluation_config=scorecard, state=None, memory=None)

    included = ("system", "conversation_policy", "persona", "company", "scenario",
                "objection_pack", "difficulty", "call_type", "evaluation_config")
    manifest = m.ContextManifest(version=1, renderer="buyer_v1",
                                 included_layers=included, omitted_layers=_OMITTED)
    return ctx, manifest
