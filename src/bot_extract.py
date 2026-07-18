"""Derive persona/scenario/objection_card layers from real Meeting-Transcripts rows.

Deterministic only — no LLM, no network. Voice/example-lines come later from the
enrichment tier (src/bot_enrich.py).
"""

from __future__ import annotations

_EMPTY = {"", "none", "unknown", "n/a"}


def clean(value: str) -> str:
    v = (value or "").strip()
    return "" if v.lower() in _EMPTY else v


def split_list(value: str) -> list[str]:
    return [p.strip() for p in clean(value).split(",") if p.strip()]


def _slug(label: str) -> str:
    return label.strip().lower().replace("/", "_").replace(" ", "_").replace("-", "_")


def row_to_layers(row: dict) -> dict:
    """Map one CSV row to persona/scenario/objection_card dicts (structured fields)."""
    mid = clean(row.get("Meeting ID"))
    objections = [_slug(t) for t in split_list(row.get("Objection/Friction"))]
    persona = {
        "character_name": clean(row.get("Client Name")),
        "business_name": clean(row.get("Business name")),
        "industry": clean(row.get("Indusrtry")),
        "sub_industry": clean(row.get("Sub-industry")),
        "role": "owner",
        "buying_authority": clean(row.get("Buying Authority")).lower() == "yes",
        "motivations": [_slug(m) for m in split_list(row.get("Motivation"))],
        "source_meeting_id": mid,
    }
    scenario = {
        "call_type": "closing",
        "situation": clean(row.get("Business Stage")),
        "offer_on_table": split_list(row.get("Package Discussed")),
        "disposition_context": clean(row.get("Call Disposition")),
        "source_meeting_id": mid,
    }
    objection_card = {
        "objection_types": objections,
        "primary": objections[0] if objections else "",
        "source_meeting_id": mid,
    }
    return {"persona": persona, "scenario": scenario, "objection_card": objection_card}
