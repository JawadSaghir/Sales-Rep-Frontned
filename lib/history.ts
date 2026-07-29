// lib/history.ts — types + data access for the Roleplay History tab.
// Wired to the real backend: getSessions/getSession hit /api/sessions, which
// returns these exact shapes (see api/history_view.py).

import { get, post } from './api';

export interface TranscriptMessage {
  turn: number;
  speaker: 'rep' | 'ai';
  time: string; // "0:14"
  text: string;
  marker?: string; // coaching highlight, e.g. "Strong permission-based opener"
}

export interface TranscriptCitation {
  turn?: number;
  t?: number;
  time?: string;
}

export interface ScorecardCriterion {
  key: string;
  label: string;
  passed: boolean;
  weight: number;
  why: string;
  improve: string;
  sectionKey?: string;
  sectionLabel?: string;
  citations: TranscriptCitation[];
}

export interface ScorecardGroup {
  key: string;
  name: string;
  earned: number;
  total: number;
  items: ScorecardCriterion[];
}

export interface ReviewStageSnapshot {
  key: string;
  label: string;
  status: 'strong' | 'mixed' | 'weak' | 'not-enough-evidence';
  summary: string;
}

export interface ReviewMetric {
  key: string;
  label: string;
  value: number | string;
  summary: string;
  status: 'strong' | 'mixed' | 'weak' | 'neutral' | 'not-enough-evidence';
}

export interface ReviewQuestion {
  turn: number;
  time: string;
  text: string;
}

export interface ReviewObjectionMoment {
  type?: string;
  label: string;
  buyerText: string;
  repText: string;
  whatWorked: string;
  whatWasMissed: string;
  citation?: TranscriptCitation;
}

export interface ReviewAnalysis {
  callSummary: string;
  stageSnapshots: ReviewStageSnapshot[];
  metrics: ReviewMetric[];
  objections: {
    summary: string;
    moments: ReviewObjectionMoment[];
    repQuestions: ReviewQuestion[];
    missedOpportunities: string[];
  };
  analysisLimits: string[];
}

export interface SessionFeedback {
  struggles: string[];
  behaviorIssues: string[];
  notes: string;
  submittedAt: string;
}

// The UI state machine, in order:
//   preparing  — call ended, waiting for the agent to hand over the transcript
//   evaluating — transcript in, scorecard being written
//   evaluated  — finished
//   eval_failed— gave up (no transcript, or the eval itself failed)
export type SessionStatus = 'preparing' | 'evaluating' | 'evaluated' | 'eval_failed';

export interface SessionSummary {
  id: string;
  status: SessionStatus;
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
  scorecard: ScorecardGroup[];
  reviewAnalysis: ReviewAnalysis;
  transcript: TranscriptMessage[];
  feedback?: SessionFeedback | null;
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
  status: Exclude<SessionStatus, 'evaluated'>;
  // Present once /complete has stored the turns (evaluating / eval_failed):
  // the transcript exists BEFORE the scorecard, so the UI can show it while
  // scoring runs instead of a bare spinner. Absent while still "preparing".
  transcript?: TranscriptMessage[];
  persona?: string;
  callType?: string;
  difficulty?: string;
  duration?: string;
  feedback?: SessionFeedback | null;
}

export function getSessions(repSlug?: string): Promise<SessionSummary[]> {
  const q = repSlug ? `?rep_slug=${encodeURIComponent(repSlug)}` : '';
  return get<SessionSummary[]>(`/api/sessions${q}`);
}

// Admin-only aggregate: one row per rep, backed by GET /api/admin/roster
// (403s for non-admins — the page renders that as "Admin access required").
export interface RosterEntry {
  rep_key: string;
  label: string;
  calls: number;
  avg_score: number;
  last_active: string;
  trend: number[];
}

export function getRoster(): Promise<RosterEntry[]> {
  return get<RosterEntry[]>('/api/admin/roster');
}

export function getSession(id: string): Promise<SessionDetail | PendingSession> {
  return get<SessionDetail | PendingSession>(`/api/sessions/${id}`);
}

export function submitSessionFeedback(
  id: string,
  body: { struggles: string[]; behavior_issues: string[]; notes: string },
): Promise<SessionFeedback> {
  return post<SessionFeedback>(`/api/sessions/${id}/feedback`, body);
}

// A pending/failed session has no scorecard; a full detail always does.
export function isPending(s: SessionDetail | PendingSession): s is PendingSession {
  return !('scorecard' in s);
}
