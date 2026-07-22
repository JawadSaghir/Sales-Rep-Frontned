// lib/roleplay.ts — types + data for the AI Sales Roleplays setup screen.
// Mock data ships so the UI works today; swap `getPersonas` to the real
// endpoint (`get<Persona[]>('/api/personas')`) when the backend is ready.

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

/* ------------------------------------------------------------- mock data */

export const CALL_TYPES: CallType[] = [
  { id: 'call1', label: 'Call 1' },
  { id: 'call2', label: 'Call 2' },
  { id: 'call3', label: 'Call 3' },
];

export const DIFFICULTIES: Difficulty[] = [
  { level: 'Easy', hint: 'Warms up quickly — good for trying a new script.' },
  { level: 'Medium', hint: 'Realistic skepticism — holds objections until you earn trust.' },
  { level: 'Hard', hint: 'Guarded, interrupts, and makes you earn every step.' },
];

export const MOCK_PERSONAS: Persona[] = [
  { id: 'marcus', name: 'Marcus Turner', business: 'Turner Logistics', industry: 'Logistics', objection: '"We already have a vendor for this."', scenario: 'Marcus runs ops for a 40-truck fleet and has been burned by training vendors before. He picks up but is guarded — earn 20 seconds, then prove you\u2019re not "another seminar."' },
  { id: 'dana', name: 'Dana Whitfield', business: 'Whitfield Dental Group', industry: 'Healthcare', objection: '"Send me an email instead."', scenario: 'Dana manages three dental clinics and deflects every call to email. Your job: give her one concrete reason to stay on the line.' },
  { id: 'raj', name: 'Raj Patel', business: 'Patel & Co Accounting', industry: 'Finance', objection: '"Your price is way too high."', scenario: 'Raj compares everything to spreadsheet cost. He\u2019ll anchor hard on price — quantify the pain before you ever say a number.' },
  { id: 'elena', name: 'Elena Marsh', business: 'Marsh Realty', industry: 'Real Estate', objection: '"I need to talk to my partner first."', scenario: 'Elena is friendly but never decides alone. Practice isolating the objection and booking the three-way follow-up on the call.' },
];

/* -------------------------------------------------------------- API stubs */
// Replace with real fetches when endpoints exist, e.g.:
//   export const getPersonas = () => get<Persona[]>('/api/personas');
//   export const createPersona = (d: PersonaDraft) => post<Persona>('/api/personas', d);
export async function getPersonas(): Promise<Persona[]> {
  return MOCK_PERSONAS;
}

// Turns a validated form draft into a Persona (client-side id). Swap for a real
// POST when the backend exists and return the server-assigned record instead.
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
