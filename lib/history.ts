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

type UnknownRecord = Record<string, unknown>;

const SESSION_STATUSES: SessionStatus[] = ['preparing', 'evaluating', 'evaluated', 'eval_failed'];

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asStringList(value: unknown): string[] {
  return asArray(value).map(item => asString(item)).filter(Boolean);
}

function normalizeStatus(value: unknown): SessionStatus {
  return SESSION_STATUSES.includes(value as SessionStatus) ? (value as SessionStatus) : 'evaluated';
}

function slugify(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function normalizeTranscriptMessages(value: unknown): TranscriptMessage[] {
  return asArray<unknown>(value).map((item, index) => {
    const source = asRecord(item);
    const speaker = asString(source.speaker).toLowerCase();
    return {
      turn: asNumber(source.turn, index + 1),
      speaker: speaker === 'rep' || speaker === 'user' ? 'rep' : 'ai',
      time: asString(source.time, '0:00'),
      text: asString(source.text),
      marker: asString(source.marker) || undefined,
    };
  });
}

function normalizeCitations(value: unknown): TranscriptCitation[] {
  return asArray<unknown>(value).map(item => {
    const source = asRecord(item);
    return {
      turn: source.turn == null ? undefined : asNumber(source.turn),
      t: source.t == null ? undefined : asNumber(source.t),
      time: asString(source.time) || undefined,
    };
  });
}

function legacyReviewAnalysis(source: UnknownRecord): ReviewAnalysis {
  const wentWell = asStringList(source.wentWell);
  const toImprove = asStringList(source.toImprove);
  const fallbackSummary =
    toImprove[0] ||
    wentWell[0] ||
    'This session was scored before the newer review workspace analytics were available.';

  return {
    callSummary: fallbackSummary,
    stageSnapshots: [],
    metrics: [],
    objections: {
      summary: 'Objection analytics were not available for this older session.',
      moments: [],
      repQuestions: [],
      missedOpportunities: [],
    },
    analysisLimits: [
      'This older session does not include stage snapshots, objection mapping, or item-level evaluator analytics from the newer review workspace.',
    ],
  };
}

function normalizeReviewAnalysis(value: unknown, source: UnknownRecord): ReviewAnalysis {
  const raw = asRecord(value);
  if (Object.keys(raw).length === 0) return legacyReviewAnalysis(source);

  return {
    callSummary: asString(raw.callSummary, legacyReviewAnalysis(source).callSummary),
    stageSnapshots: asArray<unknown>(raw.stageSnapshots).map(item => {
      const stage = asRecord(item);
      const status = asString(stage.status) as ReviewStageSnapshot['status'];
      return {
        key: asString(stage.key, 'stage'),
        label: asString(stage.label, 'Stage'),
        status: ['strong', 'mixed', 'weak', 'not-enough-evidence'].includes(status)
          ? status
          : 'not-enough-evidence',
        summary: asString(stage.summary),
      };
    }),
    metrics: asArray<unknown>(raw.metrics).map(item => {
      const metric = asRecord(item);
      const status = asString(metric.status) as ReviewMetric['status'];
      return {
        key: asString(metric.key, 'metric'),
        label: asString(metric.label, 'Metric'),
        value:
          typeof metric.value === 'string' || typeof metric.value === 'number'
            ? metric.value
            : asString(metric.value),
        summary: asString(metric.summary),
        status: ['strong', 'mixed', 'weak', 'neutral', 'not-enough-evidence'].includes(status)
          ? status
          : 'not-enough-evidence',
      };
    }),
    objections: {
      summary: asString(asRecord(raw.objections).summary, 'No objection analytics were captured.'),
      moments: asArray<unknown>(asRecord(raw.objections).moments).map(item => {
        const moment = asRecord(item);
        return {
          type: asString(moment.type) || undefined,
          label: asString(moment.label, 'Objection moment'),
          buyerText: asString(moment.buyerText),
          repText: asString(moment.repText),
          whatWorked: asString(moment.whatWorked),
          whatWasMissed: asString(moment.whatWasMissed),
          citation: (() => {
            const citation = asRecord(moment.citation);
            return Object.keys(citation).length === 0
              ? undefined
              : {
                  turn: citation.turn == null ? undefined : asNumber(citation.turn),
                  t: citation.t == null ? undefined : asNumber(citation.t),
                  time: asString(citation.time) || undefined,
                };
          })(),
        };
      }),
      repQuestions: asArray<unknown>(asRecord(raw.objections).repQuestions).map(item => {
        const question = asRecord(item);
        return {
          turn: asNumber(question.turn),
          time: asString(question.time, '0:00'),
          text: asString(question.text),
        };
      }),
      missedOpportunities: asStringList(asRecord(raw.objections).missedOpportunities),
    },
    analysisLimits: asStringList(raw.analysisLimits),
  };
}

function normalizeScorecard(value: unknown): ScorecardGroup[] {
  return asArray<unknown>(value).map((item, index) => {
    const section = asRecord(item);
    const rawKey = asString(section.key) || asString(section.name) || asString(section.label);
    const key = slugify(rawKey, `scorecard_${index + 1}`);
    const name = asString(section.name || section.label || section.key, `Scorecard ${index + 1}`);
    const earned = asNumber(section.earned);
    const total = asNumber(section.total ?? section.max);
    const rawItems = asArray<unknown>(section.items);

    if (rawItems.length > 0) {
      return {
        key,
        name,
        earned,
        total,
        items: rawItems.map((rawItem, itemIndex) => {
          const criterion = asRecord(rawItem);
          const rawCriterionKey =
            asString(criterion.key) || asString(criterion.label) || `${key}_item_${itemIndex + 1}`;
          return {
            key: slugify(rawCriterionKey, `${key}_item_${itemIndex + 1}`),
            label: asString(criterion.label, 'Criterion'),
            passed: Boolean(criterion.passed),
            weight: asNumber(criterion.weight, 1),
            why: asString(criterion.why),
            improve: asString(criterion.improve),
            sectionKey: asString(criterion.sectionKey) || key,
            sectionLabel: asString(criterion.sectionLabel) || name,
            citations: normalizeCitations(criterion.citations),
          };
        }),
      };
    }

    return {
      key,
      name,
      earned,
      total,
      items: [
        {
          key: `${key}_legacy`,
          label: name,
          passed: total > 0 ? earned >= total : earned > 0,
          weight: total || 1,
          why: `This session used the older scorecard response format, which only stored the section result (${earned}/${total}).`,
          improve:
            'Use the transcript and the section totals above as guidance. Newer sessions include item-level scoring details.',
          sectionKey: key,
          sectionLabel: name,
          citations: [],
        },
      ],
    };
  });
}

function normalizeFeedback(value: unknown): SessionFeedback | null | undefined {
  const source = asRecord(value);
  if (Object.keys(source).length === 0) return undefined;

  const struggles = asStringList(source.struggles);
  const behaviorIssues = asStringList(source.behaviorIssues ?? source.behavior_issues);
  const notes = asString(source.notes);
  const submittedAt = asString(source.submittedAt ?? source.submitted_at);

  if (!submittedAt && struggles.length === 0 && behaviorIssues.length === 0 && !notes.trim()) {
    return null;
  }

  return { struggles, behaviorIssues, notes, submittedAt };
}

function normalizeSummary(value: unknown): SessionSummary {
  const source = asRecord(value);
  return {
    id: asString(source.id),
    status: normalizeStatus(source.status),
    score: asNumber(source.score),
    grade: asString(source.grade),
    persona: asString(source.persona, 'Prospect'),
    business: asString(source.business),
    callType: asString(source.callType),
    difficulty: asString(source.difficulty),
    objection: asString(source.objection),
    date: asString(source.date),
    duration: asString(source.duration, '0:00'),
    durationSec: asNumber(source.durationSec),
  };
}

function normalizePendingSession(value: unknown): PendingSession {
  const source = asRecord(value);
  return {
    id: asString(source.id),
    status: normalizeStatus(source.status) as PendingSession['status'],
    transcript: normalizeTranscriptMessages(source.transcript),
    persona: asString(source.persona) || undefined,
    callType: asString(source.callType) || undefined,
    difficulty: asString(source.difficulty) || undefined,
    duration: asString(source.duration) || undefined,
    feedback: normalizeFeedback(source.feedback),
  };
}

function normalizeDetail(value: unknown): SessionDetail {
  const source = asRecord(value);
  const summary = normalizeSummary(source);
  return {
    ...summary,
    trend: asArray<unknown>(source.trend).map(item => asNumber(item)),
    wentWell: asStringList(source.wentWell),
    toImprove: asStringList(source.toImprove),
    scorecard: normalizeScorecard(source.scorecard),
    reviewAnalysis: normalizeReviewAnalysis(source.reviewAnalysis, source),
    transcript: normalizeTranscriptMessages(source.transcript),
    feedback: normalizeFeedback(source.feedback),
  };
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
  return get<unknown[]>(`/api/sessions${q}`).then(rows => asArray(rows).map(normalizeSummary));
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
  return get<unknown>(`/api/sessions/${id}`).then(session => {
    const source = asRecord(session);
    return 'scorecard' in source ? normalizeDetail(source) : normalizePendingSession(source);
  });
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
