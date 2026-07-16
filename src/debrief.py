"""Pure logic for turning a Scorecard into a spoken-debrief instruction.

Kept free of any livekit import so it is unit-testable on machines where PyAV /
livekit cannot load.
"""

from scorecard import Scorecard


def build_debrief_instructions(card: Scorecard) -> str:
    """Render a scorecard into a spoken-debrief instruction for generate_reply."""
    if not card.per_objection:
        return (
            "Drop the roleplay and speak as a warm sales coach. Tell the rep you "
            "didn't catch a clear objection to grade this round, encourage them to "
            "push into a real objection next time, and keep it brief."
        )
    parts = [
        "Drop the roleplay and speak as a warm, direct sales coach giving a short "
        f"spoken debrief. Overall grade: {card.overall_grade}. "
        f"Summary: {card.notes}",
        "Go objection by objection:",
    ]
    for obj in card.per_objection:
        verdict = "handled well" if obj.handled else "not handled"
        missed = f" Missed steps: {', '.join(obj.missed)}." if obj.missed else ""
        model = (
            f' Here is what worked for a top rep: "{obj.model_answer}".'
            if obj.model_answer
            else ""
        )
        parts.append(f"- On the {obj.type} objection: {verdict}.{missed}{model}")
    parts.append("Keep it encouraging and under about 45 seconds of speech.")
    return "\n".join(parts)
