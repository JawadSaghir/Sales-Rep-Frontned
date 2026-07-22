// lib/roleplay.ts — types + config for the AI Sales Roleplays setup screen (2a).
//
// Personas are fetched live from the API in app/page.tsx and passed into
// <RoleplaySetup> via the `personas` prop — see `mapApiPersona` below for the
// API-shape → design-shape adapter. CALL_TYPES / DIFFICULTIES are fixed enums
// whose ids/levels intentionally match the backend slugs (context/data/…), so
// the config emitted by onStart maps straight onto POST /api/sessions with no
// translation table. MOCK_PERSONAS remains only as the component's standalone
// default so the screen still renders in isolation (e.g. Storybook).

import type { Persona as ApiPersona } from './api';

export interface Persona {
  id: string;
  name: string;
  business: string;
  industry: string;
  objection: string;   // signature objection, shown on the card
  scenario: string;    // briefing shown in the summary rail
  custom?: boolean;     // user-created persona
}

export interface CallType {
  id: string;
  label: string;
  locked?: boolean;    // gated behind a plan / not yet available
}

export interface Difficulty {
  level: 'Easy' | 'Medium' | 'Hard';
  hint: string;
}

export interface RoleplayConfig {
  callTypeId: string;
  personaId: string;
  difficulty: Difficulty['level'];
}

// Draft shape used by the "Add custom persona" modal form.
export interface PersonaDraft {
  name: string;
  business: string;
  industry: string;
  objection: string;
  scenario: string;
}

export function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

/* ---------------------------------------------------------------- config */
// Ids match the backend call-type slugs (context/data/call_types/*.yaml).
// The stage name after the slash is what reps call each call — keep in sync
// with CALL_TYPE_LABELS in api/history_view.py, which labels the same slugs on
// the History tab.
export const CALL_TYPES: CallType[] = [
  { id: 'call_1', label: 'Call 1 / Discovery' },
  { id: 'call_2', label: 'Call 2 / Followup' },
  { id: 'call_3', label: 'Call 3 / Closing' },
];

/** Slug → display label, for screens that only have the slug (e.g. the in-call
 *  header, which reads it back off the query string). Unknown slugs fall back
 *  to title case so a new backend call type still renders sensibly. */
export function callTypeLabelFromSlug(slug: string, fallback = 'Roleplay Call'): string {
  if (!slug) return fallback;
  const known = CALL_TYPES.find(c => c.id === slug);
  return known ? known.label : slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// `level` labels map to the backend difficulty levels case-insensitively
// (context/data/difficulty/*.yaml uses lowercase easy/medium/hard); the start
// handler lowercases before hitting the API.
export const DIFFICULTIES: Difficulty[] = [
  { level: 'Easy', hint: 'Warms up quickly — good for trying a new script.' },
  { level: 'Medium', hint: 'Realistic skepticism — holds objections until you earn trust.' },
  { level: 'Hard', hint: 'Guarded, interrupts, and makes you earn every step.' },
];

/* -------------------------------------------------------- API → design map */
// The API's Persona (slug / character_name / business_name / primary_objection)
// rendered into the design's Persona shape the setup screen expects.
export function mapApiPersona(p: ApiPersona): Persona {
  return {
    id: p.slug,
    name: p.character_name,
    business: p.business_name,
    industry: p.industry,
    objection: p.primary_objection,
    scenario: p.scenario,
  };
}

/* ---------------------------------------------------------- standalone mock */
// Only used as <RoleplaySetup>'s default prop when no real personas are passed.
export const MOCK_PERSONAS: Persona[] = [
  { id: 'marcus', name: 'Marcus Turner', business: 'Turner Logistics', industry: 'Logistics', objection: '"We already have a vendor for this."', scenario: 'Marcus runs ops for a 40-truck fleet and has been burned by training vendors before. He picks up but is guarded — earn 20 seconds, then prove you’re not "another seminar."' },
  { id: 'dana', name: 'Dana Whitfield', business: 'Whitfield Dental Group', industry: 'Healthcare', objection: '"Send me an email instead."', scenario: 'Dana manages three dental clinics and deflects every call to email. Your job: give her one concrete reason to stay on the line.' },
  { id: 'raj', name: 'Raj Patel', business: 'Patel & Co Accounting', industry: 'Finance', objection: '"Your price is way too high."', scenario: 'Raj compares everything to spreadsheet cost. He’ll anchor hard on price — quantify the pain before you ever say a number.' },
  { id: 'elena', name: 'Elena Marsh', business: 'Marsh Realty', industry: 'Real Estate', objection: '"I need to talk to my partner first."', scenario: 'Elena is friendly but never decides alone. Practice isolating the objection and booking the three-way follow-up on the call.' },
];

// Turns a validated form draft into a Persona (client-side id). Swap for a real
// POST when a persona-create endpoint exists and return the server record.
export function draftToPersona(d: PersonaDraft): Persona {
  return {
    id: 'custom-' + Date.now().toString(36),
    name: d.name.trim(),
    business: d.business.trim() || 'Custom company',
    industry: d.industry.trim() || 'Custom',
    objection: d.objection.trim() || '"—"',
    scenario: d.scenario.trim(),
    custom: true,
  };
}
