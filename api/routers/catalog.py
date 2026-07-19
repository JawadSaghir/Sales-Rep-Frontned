"""Catalog endpoints: call-types, buyer personas, difficulties (from prompts/*.yaml)."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))  # repo root for `src`
from api.schemas import ok
from src import bot_config

router = APIRouter(prefix="/api")


def _label(slug: str) -> str:
    return slug.replace("_", " ").replace("-", " ").title()


@router.get("/call-types")
def call_types() -> dict:
    out = []
    for slug in bot_config.list_layer_slugs("call_types"):
        ct = bot_config.load_layer("call_types", slug)
        out.append(
            {
                "slug": slug,
                "label": _label(slug),
                "locked": False,
                "rep_objective": ct.get("rep_objective", ""),
            }
        )
    return ok(out)


@router.get("/difficulties")
def difficulties() -> dict:
    out = []
    for slug in bot_config.list_layer_slugs("difficulty"):
        d = bot_config.load_layer("difficulty", slug)
        out.append(
            {
                "level": d.get("level", slug),
                "skepticism_baseline": d.get("skepticism_baseline", ""),
            }
        )
    return ok(out)


@router.get("/personas")
def personas() -> dict:
    out = []
    for slug in bot_config.list_layer_slugs("bots"):
        bot = bot_config.load_layer("bots", slug)
        persona = bot_config.load_layer("personas", bot["persona"])
        obj = bot_config.load_layer("objection_cards", bot["objection_card"])
        out.append(
            {
                "slug": slug,
                "character_name": persona.get("character_name", ""),
                "business_name": persona.get("business_name", ""),
                "industry": persona.get("industry", ""),
                "primary_objection": obj.get("primary", ""),
            }
        )
    return ok(out)
