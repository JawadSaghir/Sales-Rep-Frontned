"""Frozen, typed layer models + Context Object, Selection, and manifest."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LayerMeta:
    id: str
    version: int = 1
    priority: int = 0


@dataclass(frozen=True)
class ConversationPolicy:
    meta: LayerMeta
    rules: tuple[str, ...]


@dataclass(frozen=True)
class Persona:
    meta: LayerMeta
    name: str
    title: str
    age: str
    personality: tuple[str, ...]
    communication_style: str
    decision_style: str
    values: tuple[str, ...]
    risk_tolerance: str
    briefing_summary: str = ""
    opinions: str = ""


@dataclass(frozen=True)
class KnowledgeBundle:
    items: tuple = ()


@dataclass(frozen=True)
class Scenario:
    meta: LayerMeta
    call_type: str
    context: str
    buyer_goal: str
    hidden_information: str = ""
    default_objection_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class ObjectionCard:
    meta: LayerMeta
    trigger: str
    emotion: str
    buyer_language: tuple[str, ...]
    acceptable_resolution: str
    coach_signal: str


@dataclass(frozen=True)
class ObjectionPack:
    cards: tuple[ObjectionCard, ...]

    @property
    def primary(self) -> ObjectionCard | None:
        return self.cards[0] if self.cards else None

    @property
    def card_ids(self) -> tuple[str, ...]:
        return tuple(c.meta.id for c in self.cards)


@dataclass(frozen=True)
class Difficulty:
    meta: LayerMeta
    level: str
    framing: str


@dataclass(frozen=True)
class CallType:
    meta: LayerMeta
    call_type: str
    frame: str
    rep_objective: str


@dataclass(frozen=True)
class ScorecardConfig:
    meta: LayerMeta
    name: str
    criteria: tuple[dict, ...]


@dataclass(frozen=True)
class Selection:
    persona_id: str
    scenario_id: str
    call_type: str
    difficulty: str
    scorecard: str
    add_objection_ids: tuple[str, ...] = ()
    remove_objection_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class ContextManifest:
    version: int
    renderer: str
    included_layers: tuple[str, ...]
    omitted_layers: tuple[str, ...]


@dataclass(frozen=True)
class Context:
    conversation_policy: ConversationPolicy
    persona: Persona
    knowledge: KnowledgeBundle
    scenario: Scenario
    objection_pack: ObjectionPack
    difficulty: Difficulty
    call_type: CallType
    evaluation_config: ScorecardConfig
    state: None = None
    memory: None = None
