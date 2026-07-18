"""Build demo bot config from REAL Meeting-Transcripts rows (deterministic tier).

Voice/example-lines are left as TODO markers for a human to fill FROM the real
transcript (or via src/bot_enrich.enrich_persona when OPENROUTER_API_KEY is set).
Run: ./.venv/Scripts/python.exe scripts/build_demo_bots.py
"""

import csv
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.bot_extract import clean, row_to_layers

CSV = Path("data/raw_data/Meeting Transcripts-Grid view.csv")
PROMPTS = Path("prompts")
csv.field_size_limit(10**9)


def _rich(row: dict) -> bool:
    return all(
        clean(row.get(c))
        for c in [
            "Meeting ID",
            "Client Name",
            "Indusrtry",
            "Objection/Friction",
            "Motivation",
            "Business Stage",
            "Package Discussed",
        ]
    )


def _objection_count(row: dict) -> int:
    return len(
        [p for p in clean(row.get("Objection/Friction")).split(",") if p.strip()]
    )


def main() -> None:
    with open(CSV, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if _rich(r)]
    # Prefer real calls where the prospect surfaced a full primary/secondary/
    # tertiary objection set (>=3 distinct types) so the demo objection_card
    # is fully real-grounded with no fabricated secondary/tertiary objection.
    # Order is preserved (first matches in the CSV), so this is deterministic.
    candidates = [r for r in rows if _objection_count(r) >= 3][:2] or rows[:2]
    for row in candidates:
        layers = row_to_layers(row)
        slug = clean(row["Client Name"]).lower().replace(" ", "-")
        # voice placeholders a human/LLM fills FROM the real transcript
        layers["persona"].update(
            {
                "character_age": "TODO-from-transcript",
                "character_background": f"owner of {layers['persona'].get('business_name') or 'their business'}",
                "character_backstory": "TODO-from-transcript",
                "character_core_motivation": "TODO-from-transcript",
                "speech_style_description": "TODO-from-transcript",
                "signature_phrases": ["TODO-from-transcript"],
                "baseline_tone": "guarded",
            }
        )
        layers["scenario"]["shutdown_line"] = "TODO-from-transcript"
        layers["scenario"]["what_would_flip_them"] = "TODO-from-transcript"
        for kind, data in [
            ("personas", layers["persona"]),
            ("scenarios", layers["scenario"]),
            ("objection_cards", layers["objection_card"]),
        ]:
            (PROMPTS / kind).mkdir(parents=True, exist_ok=True)
            (PROMPTS / kind / f"{slug}.yaml").write_text(
                yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
                encoding="utf-8",
            )
        bot = {
            "slug": f"{slug}-closing",
            "persona": slug,
            "scenario": slug,
            "objection_card": slug,
            "call_type": "closing",
            "difficulty": "medium",
            "scorecard": "closing_v1",
            "source_meeting_id": clean(row["Meeting ID"]),
        }
        (PROMPTS / "bots").mkdir(parents=True, exist_ok=True)
        (PROMPTS / "bots" / f"{slug}-closing.yaml").write_text(
            yaml.safe_dump(bot, sort_keys=False, allow_unicode=True), encoding="utf-8"
        )
        print("wrote bot", bot["slug"], "from meeting", bot["source_meeting_id"])


if __name__ == "__main__":
    main()
