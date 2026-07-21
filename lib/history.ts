// lib/history.ts — types + data access for the Roleplay History tab.
// Wired to the real backend: getSessions/getSession hit /api/sessions, which
// returns these exact shapes (see api/history_view.py).

import { get } from './api';

export interface TranscriptMessage {
  speaker: 'rep' | 'ai';
  time: string; // "0:14"
  text: string;
  marker?: string; // coaching highlight, e.g. "Strong permission-based opener"
}

export interface ScorecardItem {
  name: string;
  earned: number;
  total: number;
}

export interface SessionSummary {
  id: string;
  status: 'evaluating' | 'evaluated' | 'eval_failed';
  score: number; // 0–100
  grade: string; // "B · Solid"
  persona: string;
  business: string;
  callType: string;
  difficulty: string;
  objection: string;
  date: string;
  duration: string; // "6:48"
  durationSec: number;
}

export interface SessionDetail extends SessionSummary {
  trend: number[]; // last N session scores, oldest first
  wentWell: string[];
  toImprove: string[];
  scorecard: ScorecardItem[];
  transcript: TranscriptMessage[];
}

export function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

export function scoreColor(score: number): string {
  return score >= 75 ? 'var(--teal)' : score >= 50 ? 'var(--amber)' : 'var(--brand)';
}

/* ------------------------------------------------------------- data access */
// Both hit the real backend. The API returns these exact shapes (built server
// side in api/history_view.py), so no client-side mapping is needed.

export interface PendingSession {
  id: string;
  status: 'evaluating' | 'eval_failed';
}

export function getSessions(): Promise<SessionSummary[]> {
  return get<SessionSummary[]>('/api/sessions');
}

export function getSession(id: string): Promise<SessionDetail | PendingSession> {
  return get<SessionDetail | PendingSession>(`/api/sessions/${id}`);
}

// A pending/failed session has no scorecard; a full detail always does.
export function isPending(s: SessionDetail | PendingSession): s is PendingSession {
  return !('scorecard' in s);
}
