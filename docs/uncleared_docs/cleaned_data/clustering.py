"""LLM cluster-labelling + per-call classification against a frozen taxonomy."""

from __future__ import annotations

import json
import os

LABEL_KEYS = ("label", "definition", "aliases", "coaching_fix")
_HANDLED = {"well", "poorly", "unclear"}

# Strict structured-output schema: forces a single flat object with exactly
# these keys. Prevents the model from wrapping the result or returning an array.
_LABEL_SCHEMA = {
    "name": "cluster_label",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "label": {"type": "string"},
            "definition": {"type": "string"},
            "aliases": {"type": "array", "items": {"type": "string"}},
            "coaching_fix": {"type": "string"},
        },
        "required": ["label", "definition", "aliases", "coaching_fix"],
        "additionalProperties": False,
    },
}


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


def _chat_json(client, model: str, prompt: str, schema: dict | None = None) -> str:
    response_format = (
        {"type": "json_schema", "json_schema": schema}
        if schema is not None
        else {"type": "json_object"}
    )
    resp = client.chat.completions.create(
        model=model,
        response_format=response_format,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content


def _model(model: str | None) -> str:
    return model or os.environ.get("REP_PROFILE_MODEL", "openai/gpt-4o-mini")


def label_cluster(phrases: list[str], client, model: str | None = None) -> dict:
    prompt = (
        "You are naming ONE cluster of semantically similar sales-call "
        "weakness/objection phrases that all share a single common theme. "
        "Return a SINGLE flat JSON object describing that one shared theme. Do NOT "
        "wrap it in another key, do NOT return an array, and do NOT label phrases "
        "individually. Keys: label (kebab-case), definition, aliases (list of "
        "strings), coaching_fix. Phrases:\n- " + "\n- ".join(phrases[:40])
    )
    for attempt in range(2):
        try:
            return parse_label(_chat_json(client, _model(model), prompt, _LABEL_SCHEMA))
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
