"""LLM cluster-labelling + per-call classification against a frozen taxonomy."""

from __future__ import annotations

import json
import os

LABEL_KEYS = ("label", "definition", "aliases", "coaching_fix")
_HANDLED = {"well", "poorly", "unclear"}


def parse_label(content: str) -> dict:
    data = json.loads(content)
    missing = [k for k in LABEL_KEYS if k not in data]
    if missing:
        raise ValueError(f"label JSON missing keys: {missing}")
    if not isinstance(data["aliases"], list):
        raise ValueError("aliases must be a list")
    return {k: data[k] for k in LABEL_KEYS}


def parse_classification(content: str, valid_ids: set[int]) -> dict:
    data = json.loads(content)
    weak = [i for i in data.get("weakness_ids", []) if i in valid_ids]
    objs = [
        {"obj_id": o["obj_id"], "handled": o["handled"], "quote": o.get("quote", "")}
        for o in data.get("objections", [])
        if o.get("obj_id") in valid_ids and o.get("handled") in _HANDLED
    ]
    return {"weakness_ids": weak, "objections": objs}


def _chat_json(client, model: str, prompt: str) -> str:
    resp = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content


def _model(model: str | None) -> str:
    return model or os.environ.get("REP_PROFILE_MODEL", "openai/gpt-4o-mini")


def label_cluster(phrases: list[str], client, model: str | None = None) -> dict:
    prompt = (
        "You are naming a cluster of sales-call weakness/objection phrases. "
        "Return JSON with keys label (kebab-case), definition, aliases (list), "
        "coaching_fix. Phrases:\n- " + "\n- ".join(phrases[:40])
    )
    for attempt in range(2):
        try:
            return parse_label(_chat_json(client, _model(model), prompt))
        except ValueError:
            if attempt == 1:
                raise


def classify_call(
    text: str, taxonomy: list[dict], client, model: str | None = None
) -> dict:
    valid_ids = {t["id"] for t in taxonomy}
    catalog = "\n".join(f"{t['id']}: {t['label']}" for t in taxonomy)
    prompt = (
        "Given this fixed taxonomy (id: label):\n"
        + catalog
        + "\n\nClassify the call notes below. Return JSON: "
        '{"weakness_ids":[ids], "objections":[{"obj_id":id,'
        '"handled":"well|poorly|unclear","quote":"short quote"}]}. '
        "Only use ids from the taxonomy.\n\nNotes:\n" + text[:4000]
    )
    for attempt in range(2):
        try:
            return parse_classification(
                _chat_json(client, _model(model), prompt), valid_ids
            )
        except ValueError:
            if attempt == 1:
                raise
