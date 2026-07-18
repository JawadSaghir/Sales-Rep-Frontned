"""Enrich a data-derived persona with voice + objection example lines from the real
transcript, via OpenRouter. The generation call is API-key-gated; the JSON validator
is pure and unit-tested.
"""

from __future__ import annotations

import json
import os

ENRICH_KEYS = (
    "speech_style_description",
    "signature_phrases",
    "character_core_motivation",
    "baseline_tone",
    "shutdown_line",
    "character_backstory",
)


def parse_enrichment(content: str, objection_types: list[str]) -> dict:
    """Parse and validate enrichment JSON response.

    Args:
        content: JSON string containing enrichment data
        objection_types: List of objection types that must have example lines

    Returns:
        dict with ENRICH_KEYS plus example_lines restricted to objection_types

    Raises:
        ValueError: if any ENRICH_KEYS missing or example_lines lacks any objection_type
    """
    data = json.loads(content)
    missing = [k for k in ENRICH_KEYS if k not in data]
    if missing:
        raise ValueError(f"enrichment JSON missing keys: {missing}")
    lines = data.get("example_lines", {})
    missing_obj = [t for t in objection_types if not lines.get(t)]
    if missing_obj:
        raise ValueError(f"example_lines missing for objections: {missing_obj}")
    out = {k: data[k] for k in ENRICH_KEYS}
    out["example_lines"] = {t: lines[t] for t in objection_types}
    return out


def enrich_persona(
    transcript: str, objection_types: list[str], client, model: str | None = None
) -> dict:
    """Call LLM to enrich persona with voice and example lines from transcript.

    Args:
        transcript: Sales call transcript
        objection_types: List of objection types to extract example lines for
        client: OpenRouter API client
        model: OpenRouter model ID; defaults to REP_PROFILE_MODEL env var or gpt-4o-mini

    Returns:
        dict from parse_enrichment with validated enrichment data

    Raises:
        ValueError: if LLM response invalid JSON after one retry
    """
    model = model or os.environ.get("REP_PROFILE_MODEL", "openai/gpt-4o-mini")
    prompt = (
        "From this real sales-call transcript, extract the PROSPECT's character for a "
        "roleplay. Return JSON with keys: speech_style_description, signature_phrases "
        "(list), character_core_motivation, baseline_tone, shutdown_line, "
        "character_backstory, and example_lines (object mapping each of these objection "
        f"types {objection_types} to a list of 1-3 real/paraphrased lines the prospect "
        "would say). Ground everything in the transcript; do not invent facts.\n\n"
        + transcript[:8000]
    )
    for attempt in range(2):
        try:
            resp = client.chat.completions.create(
                model=model,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
            return parse_enrichment(resp.choices[0].message.content, objection_types)
        except ValueError:
            if attempt == 1:
                raise
