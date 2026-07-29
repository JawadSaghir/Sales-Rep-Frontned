// Same-origin BFF proxy (adds auth); FastAPI paths keep their /api prefix on
// the upstream side, so strip it here: /api/personas -> /api/backend/personas.
const BASE = '/api/backend';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export async function get<T>(path: string): Promise<T> {
  // Every one of these is live data, and History polls a session through
  // preparing -> evaluating -> evaluated. A cached 200 would make the poll
  // re-read its own stale answer and the scorecard would never appear.
  const res = await fetch(`${BASE}${path.replace(/^\/api/, '')}`, { cache: 'no-store' });
  const body: ApiResponse<T> = await res.json();
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path.replace(/^\/api/, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed: ApiResponse<T> = await res.json();
  if (!res.ok || !parsed.success || parsed.data === null) {
    throw new Error(parsed.error ?? `Request failed: ${path}`);
  }
  return parsed.data;
}

export async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path.replace(/^\/api/, '')}`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  const body: ApiResponse<T> = await res.json();
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data;
}

export interface CallType {
  slug: string;
  label: string;
  locked: boolean;
  rep_objective: string;
}

export interface Persona {
  slug: string;
  character_name: string;
  persona_label?: string;
  personality_traits?: string[];
  business_name: string;
  industry: string;
  primary_objection: string;
  scenario: string;
  custom?: boolean;
  call_type?: string | null;
}

export interface PersonaOptions {
  industries: string[];
  objections: { id: string; trigger: string }[];
  stage_defaults: Record<string, string[]>;
}

export interface Difficulty {
  level: string;
  skepticism_baseline: string;
}

export interface RepSummary {
  slug: string;
  name: string;
  calls: number;
  avg_total_score: number | null;
  grade_normalized: string | null;
}

export interface StartSessionResult {
  session_id: string;
  room: string;
  token: string;
  livekit_url: string;
}

export interface Me {
  email: string;
  is_admin: boolean;
}

export const getCallTypes = () => get<CallType[]>('/api/call-types');
export const getPersonas = () => get<Persona[]>('/api/personas');
export const getPersonaOptions = () => get<PersonaOptions>('/api/persona-options');
export const createPersona = (draft: {
  name: string;
  business: string;
  industry: string;
  objection: string;
  scenario: string;
  call_type: string;
  objection_ids: string[];
}) => post<Persona>('/api/personas', draft);
export const deletePersona = (slug: string) =>
  del<{ deleted: boolean }>(`/api/personas/${encodeURIComponent(slug)}`);
export const getDifficulties = () => get<Difficulty[]>('/api/difficulties');
export const getReps = () => get<RepSummary[]>('/api/reps');
export const getRepProfile = (slug: string) => get<Record<string, unknown>>(`/api/reps/${slug}`);
export const getTeamWeaknesses = () =>
  get<{ objection_type: string; count: number }[]>('/api/analytics/team-weaknesses');
// Drives the Admin nav link only — a UI courtesy. The API enforces the real
// admin check on every /api/admin/* route regardless of what this returns.
export const getMe = () => get<Me>('/api/me');

export async function startSession(body: {
  call_type: string;
  persona_slug: string;
  difficulty: string;
}): Promise<StartSessionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const parsed: ApiResponse<StartSessionResult> = await res.json();
    if (!res.ok || !parsed.success || parsed.data === null) {
      throw new Error(parsed.error ?? 'Failed to start session');
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        'Starting the call timed out after 15 seconds. Reload the page and try again.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
