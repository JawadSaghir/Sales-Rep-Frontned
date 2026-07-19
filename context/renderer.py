"""Dumb renderers: format a validated Context into buyer / evaluator prompts."""

from __future__ import annotations

from context import models as m


def _bullets(items) -> str:
    return "\n".join(f"- {i}" for i in items)


def render_buyer(context: m.Context) -> str:
    c = context
    sections: list[str] = [
        f"# SYSTEM\n{c.system.role.strip()}\n{_bullets(c.system.rules)}",
        f"# CONVERSATION POLICY\n{_bullets(c.conversation_policy.rules)}",
        f"# HOW HARD YOU ARE TODAY (# DIFFICULTY)\n{c.difficulty.framing.strip()}",
        (
            f"# WHO YOU ARE\nYou are {c.persona.name}, {c.persona.title}"
            + (f", {c.persona.age}" if c.persona.age else "")
            + ".\n"
            + f"Personality: {', '.join(c.persona.personality)}.\n"
            + f"Communication style: {c.persona.communication_style}.\n"
            + f"Decision style: {c.persona.decision_style}.\n"
            + f"You value: {', '.join(c.persona.values)}. "
            + f"Risk tolerance: {c.persona.risk_tolerance}."
        ),
        (
            f"# YOUR COMPANY\n{c.company.name} — {c.company.industry}"
            + (f" / {c.company.sub_industry}" if c.company.sub_industry else "")
            + ".\n"
            + (f"{c.company.business_stage}" if c.company.business_stage else "")
        ),
        (
            f"# THIS CALL\n{c.call_type.frame.strip()}\n"
            + f"The rep's goal: {c.call_type.rep_objective}.\n"
            + f"Situation: {c.scenario.context}\n"
            + f"What you privately want: {c.scenario.buyer_goal}"
        ),
        (
            "# YOUR OBJECTIONS\n"
            + "\n\n".join(
                f"[{card.meta.id}] (you feel {card.emotion}) — "
                "things you might say, in your own words:\n"
                + _bullets(card.buyer_language)
                for card in c.objection_pack.cards
            )
        ),
    ]
    if c.knowledge.items:  # optional; omitted when empty
        sections.append(f"# WHAT YOU KNOW\n{_bullets(c.knowledge.items)}")
    header = f"# NOW: YOU ARE {c.persona.name.upper()}. REACT."
    return "\n\n".join(sections) + "\n\n" + header


def render_evaluator(context: m.Context) -> str:
    sc = context.evaluation_config
    lines = [f"Scorecard: {sc.name}", "Score the rep on these weighted criteria:"]
    for crit in sc.criteria:
        lines.append(
            f"- {crit.get('key')} (weight {crit.get('weight')}, scale {crit.get('scale')})"
        )
    return "\n".join(lines)
