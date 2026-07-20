const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
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
  business_name: string;
  industry: string;
  primary_objection: string;
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

export const getCallTypes = () => get<CallType[]>('/api/call-types');
export const getPersonas = () => get<Persona[]>('/api/personas');
export const getDifficulties = () => get<Difficulty[]>('/api/difficulties');
export const getReps = () => get<RepSummary[]>('/api/reps');
export const getRepProfile = (slug: string) => get<Record<string, unknown>>(`/api/reps/${slug}`);
export const getTeamWeaknesses = () =>
  get<{ objection_type: string; count: number }[]>('/api/analytics/team-weaknesses');

export async function startSession(body: {
  rep_slug: string;
  call_type: string;
  persona_slug: string;
  difficulty: string;
}): Promise<StartSessionResult> {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed: ApiResponse<StartSessionResult> = await res.json();
  if (!res.ok || !parsed.success || !parsed.data) throw new Error(parsed.error ?? 'startSession failed');
  return parsed.data;
}
