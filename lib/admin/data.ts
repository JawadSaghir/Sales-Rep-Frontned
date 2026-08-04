// lib/admin/data.ts — the admin console's data layer.
//
// Every CONNECT stub from the bundle is implemented here against the real API.
// The rule from the brief: keep the signatures and the return shapes declared in
// lib/types.ts, and map our schema onto them HERE, never in the components.
//
// Four cached primitives do all the reading; everything else derives from them.
// cache() is request-scoped, so a page that needs the roster and one rep's
// sessions pays for each exactly once no matter how many callers ask.
import { cache } from "react";
import { serverGet } from "./server-api";
import { encodeRepId, decodeRepId } from "./rep-id";
import type {
  Alert,
  CallSummary,
  QuickFeedback,
  Rep,
  RepStatus,
  Scenario,
  ScorecardRow,
} from "../types";

/* ------------------------------------------------------------- wire shapes */
// What the API actually sends. Declared locally so this module's dependency on
// the API contract is explicit and reviewable in one place.

interface ApiRosterEntry {
  rep_key: string; // the rep's email — the canonical key (AGENTS.md invariant 9)
  label: string; // "Tobi Adeyemi", derived from the local-part
  calls: number;
  avg_score: number;
  last_active: string; // raw ISO timestamp
  trend: number[]; // capped at the last 10 — see seriesFromSessions()
}

interface ApiSessionSummary {
  id: string;
  status: string;
  score: number;
  grade: string;
  persona: string;
  business: string;
  callType: string;
  difficulty: string;
  objection: string;
  date: string; // "Aug 03" — no year, see parseDisplayDate()
  duration: string;
  durationSec: number;
}

interface ApiScorecardItem {
  label: string;
  passed: boolean;
  improve: string;
}

interface ApiScorecardGroup {
  key: string;
  name: string;
  earned: number;
  total: number;
  items: ApiScorecardItem[];
}

interface ApiSessionFeedback {
  struggles: string[];
  behaviorIssues: string[];
  notes: string;
  submittedAt: string;
}

interface ApiSessionDetail extends ApiSessionSummary {
  scorecard?: ApiScorecardGroup[];
  feedback?: ApiSessionFeedback | null;
}

interface ApiPersona {
  slug: string;
  character_name: string;
  business_name: string;
  industry: string;
  primary_objection: string;
  call_type?: string | null;
}

interface ApiCallType {
  slug: string;
  label: string;
}

/* ---------------------------------------------------------------- tuning */

/** Status bands. A first cut — tune here, not at the call sites. */
const ON_TRACK_MIN_AVG = 75;
const WATCH_MIN_AVG = 60;
/** Silence this long drops a rep to at least "Watch" regardless of score. */
const IDLE_WATCH_DAYS = 7;
/** Window for the "this week" deltas on the team KPIs. */
const RECENT_WINDOW_DAYS = 7;
/**
 * Quick feedback lives only on the per-session detail response, so a team-wide
 * feed costs one request per call. Capped, and the cap is reported rather than
 * passed off as full coverage.
 */
const FEEDBACK_FEED_LIMIT = 25;

const DAY_MS = 86_400_000;

/* ------------------------------------------------------ cached primitives */

/**
 * One row per rep who has ever started a session. Admin-only upstream (403
 * otherwise) — safe because requireAdmin() in app/admin/layout.tsx runs first.
 * A rep with no sessions at all does not appear here, because the roster is
 * built from the session table.
 */
const roster = cache(async (): Promise<ApiRosterEntry[]> =>
  serverGet<ApiRosterEntry[]>("/api/admin/roster"),
);

/**
 * One rep's sessions, newest first. This is the same endpoint the rep-side
 * Roleplay History reads, which is what keeps the two screens showing the same
 * numbers.
 */
const repSessions = cache(async (repKey: string): Promise<ApiSessionSummary[]> =>
  serverGet<ApiSessionSummary[]>(`/api/sessions?rep_slug=${encodeURIComponent(repKey)}`),
);

const sessionDetail = cache(async (callId: string): Promise<ApiSessionDetail> =>
  serverGet<ApiSessionDetail>(`/api/sessions/${encodeURIComponent(callId)}`),
);

const catalog = cache(
  async (): Promise<{ personas: ApiPersona[]; callTypes: ApiCallType[] }> => {
    const [personas, callTypes] = await Promise.all([
      serverGet<ApiPersona[]>("/api/personas"),
      serverGet<ApiCallType[]>("/api/call-types"),
    ]);
    return { personas, callTypes };
  },
);

/* --------------------------------------------------------------- helpers */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The API formats session dates as "%b %d" ("Aug 03"), which drops the year and
 * so cannot be compared or subtracted. Infer the year from the rep's
 * last_active: a session cannot post-date the rep's most recent activity, so a
 * date that lands in the future belongs to the previous year. The day of slack
 * absorbs timezone skew between the two representations.
 */
function parseDisplayDate(display: string, reference: Date): Date | null {
  const match = /^([A-Za-z]{3})\s+(\d{1,2})$/.exec(display.trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]);
  const day = Number(match[2]);
  if (month < 0 || !day) return null;

  const candidate = new Date(Date.UTC(reference.getUTCFullYear(), month, day));
  if (candidate.getTime() > reference.getTime() + DAY_MS) {
    return new Date(Date.UTC(reference.getUTCFullYear() - 1, month, day));
  }
  return candidate;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function evaluatedOnly(sessions: ApiSessionSummary[]): ApiSessionSummary[] {
  return sessions.filter((session) => session.status === "evaluated");
}

/**
 * Chronological scores, oldest first — ALL of them, not the roster's last-ten
 * `trend`. Rep.avg is the mean of exactly this array, so the sparkline, the
 * trend chart, the delta chip and the number can never disagree; and because it
 * comes from the same endpoint the rep's own history reads, it cannot disagree
 * with the rep side either.
 */
function seriesFromSessions(sessions: ApiSessionSummary[]): number[] {
  return evaluatedOnly(sessions)
    .map((session) => session.score)
    .reverse(); // API returns newest first
}

/**
 * Latest score against the mean of the ones before it, per lib/types.ts.
 * null when there is nothing to compare — one score is not a trend, and zero
 * scores are not "no change".
 */
function deltaFromSeries(series: number[]): number | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  return Math.round(latest - mean(series.slice(0, -1)));
}

/**
 * Consecutive days, ending today or yesterday, on which the rep ran at least
 * one session. Returns null when there is no live streak — which is exactly
 * what `streakDays: number | null` means in lib/types.ts.
 */
function streakFromSessions(sessions: ApiSessionSummary[], lastActive: Date, now: Date): number | null {
  const days = new Set<string>();
  for (const session of sessions) {
    const date = parseDisplayDate(session.date, lastActive);
    if (date) days.add(utcDayKey(date));
  }
  if (days.size === 0) return null;

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(today.getTime() - DAY_MS);

  let cursor = days.has(utcDayKey(today))
    ? today
    : days.has(utcDayKey(yesterday))
      ? yesterday
      : null;
  if (!cursor) return null;

  let streak = 0;
  while (days.has(utcDayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

function repStatus(avg: number | null, idleDays: number): RepStatus {
  // Nothing scored yet is not a failing grade — it is something to watch.
  if (avg === null) return "Watch";
  if (avg < WATCH_MIN_AVG) return "Needs coaching";
  if (idleDays >= IDLE_WATCH_DAYS) return "Watch";
  return avg >= ON_TRACK_MIN_AVG ? "On track" : "Watch";
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

/* ------------------------------------------------------------ rep assembly */

function buildRep(entry: ApiRosterEntry, sessions: ApiSessionSummary[], now: Date): Rep {
  const lastActive = new Date(entry.last_active);
  const lastActiveValid = !Number.isNaN(lastActive.getTime());
  const reference = lastActiveValid ? lastActive : now;

  const series = seriesFromSessions(sessions);
  const avg = series.length > 0 ? Math.round(mean(series)) : null;
  const idleDays = lastActiveValid ? daysBetween(lastActive, now) : 0;
  const practicedSeconds = sessions.reduce((total, session) => total + (session.durationSec || 0), 0);

  return {
    id: encodeRepId(entry.rep_key),
    name: entry.label || entry.rep_key,
    initials: initialsOf(entry.label || entry.rep_key),
    // No team/department/squad field exists anywhere in our schema. The email is
    // the canonical rep key and the only real per-rep attribute we have, so it
    // fills this slot rather than an invented grouping.
    team: entry.rep_key,
    // The rep's own history counts the sessions this endpoint returns, which
    // excludes abandoned rooms; the roster's `calls` includes them. Match the
    // rep side.
    sessions: sessions.length,
    avg,
    delta: deltaFromSeries(series),
    // Unavailable: objection handling is only broken out per session, inside
    // GET /api/sessions/{id}. A per-rep rate would cost one request per session
    // per rep. Rendered as "—" until the API exposes an aggregate.
    objectionPct: null,
    practicedHours: Math.round((practicedSeconds / 3600) * 10) / 10,
    streakDays: streakFromSessions(sessions, reference, now),
    idleDays,
    status: repStatus(avg, idleDays),
    series,
  };
}

/**
 * Every rep with at least one session, best average first (the team table
 * renders this order as-is).
 *
 * The 1 + N read is deliberate. The roster alone cannot serve this screen: its
 * avg_score covers all sessions while its trend is capped at ten, so avg would
 * not equal mean(series); and it carries no durations, so practicedHours would
 * be impossible. A per-rep aggregate endpoint would collapse this to one call
 * and is the recommended follow-up.
 */
export const getTeam = cache(async (): Promise<Rep[]> => {
  const entries = await roster();
  const now = new Date();

  const reps = await Promise.all(
    entries.map(async (entry) => {
      try {
        return buildRep(entry, await repSessions(entry.rep_key), now);
      } catch {
        // One rep's session read failing must not blank the whole team. Fall
        // back to the roster's own numbers for that row.
        return buildRep(entry, [], now);
      }
    }),
  );

  // Best average first; never-scored reps sort to the bottom rather than
  // pretending to be a 0.
  const rank = (rep: Rep) => rep.avg ?? -1;
  return reps.sort((a, b) => rank(b) - rank(a));
});

/**
 * One rep, in two requests — deliberately NOT `getTeam().find(...)`, which would
 * fan out across every rep on the team just to render one of them.
 */
export async function getRep(repId: string): Promise<Rep | undefined> {
  const repKey = decodeRepId(repId);
  if (!repKey) return undefined;

  const entry = (await roster()).find((candidate) => candidate.rep_key === repKey);
  if (!entry) return undefined;

  const sessions = await repSessions(repKey).catch(() => [] as ApiSessionSummary[]);
  return buildRep(entry, sessions, new Date());
}

/** The rep's email, for handing to components that query by rep_slug. */
export function repKeyOf(repId: string): string | null {
  return decodeRepId(repId);
}

export async function getTeamKpis() {
  const reps = await getTeam();
  const now = new Date();
  // flatMap rather than filter+map so the nulls are dropped and the result is
  // number[] without an assertion.
  const scoredAvgs = reps.flatMap((rep) => (rep.avg === null ? [] : [rep.avg]));

  // Week-over-week needs real timestamps, so it is computed from the session
  // dates rather than the mock's hardcoded numbers.
  const recent: number[] = [];
  const earlier: number[] = [];
  let recentSessions = 0;
  for (const rep of reps) {
    const sessions = await repSessions(rep.team).catch(() => [] as ApiSessionSummary[]);
    const reference = new Date(now);
    for (const session of sessions) {
      const date = parseDisplayDate(session.date, reference);
      const isRecent = date ? daysBetween(date, now) < RECENT_WINDOW_DAYS : false;
      if (isRecent) recentSessions += 1;
      if (session.status !== "evaluated") continue;
      (isRecent ? recent : earlier).push(session.score);
    }
  }

  return {
    sessions: reps.reduce((total, rep) => total + rep.sessions, 0),
    sessionsDelta: recentSessions,
    avgScore: scoredAvgs.length ? Math.round(mean(scoredAvgs)) : null,
    avgDelta:
      recent.length && earlier.length ? Math.round(mean(recent) - mean(earlier)) : 0,
    // See Rep.objectionPct — no aggregate exists. null renders as "—".
    objectionPct: null as number | null,
    objectionDelta: null as number | null,
    practicedHours: Math.round(reps.reduce((total, rep) => total + rep.practicedHours, 0)),
    repCount: reps.length,
  };
}

/* ------------------------------------------------------------------- calls */

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;

function asDifficulty(value: string): CallSummary["difficulty"] {
  const match = DIFFICULTIES.find((level) => level === value);
  return match ?? "Medium";
}

function verdictOf(score: number): CallSummary["verdict"] {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  return "Needs improvement";
}

/**
 * The same query the rep-side Roleplay History uses, scoped to one rep.
 *
 * Note that the rep detail screen mounts our HistoryList component directly
 * rather than rendering CallSummary rows, so this exists for parity with the
 * declared interface and for any caller that wants the mapped shape.
 */
export async function getCalls(repId: string): Promise<CallSummary[]> {
  const repKey = decodeRepId(repId);
  if (!repKey) return [];

  const sessions = await repSessions(repKey).catch(() => [] as ApiSessionSummary[]);
  return sessions.map((session) => ({
    id: session.id,
    repId,
    persona: session.persona,
    company: session.business,
    type: session.callType,
    difficulty: asDifficulty(session.difficulty),
    score: session.score,
    // The list endpoint returns a percentage, not earned/max — those live on
    // the detail response only. Stated in the unit we actually have.
    points: `${session.score} of 100 points`,
    verdict: verdictOf(session.score),
    // No per-call summary on the list endpoint either; the closest real field is
    // the evaluator's grade band ("B · Solid").
    summary: session.objection || session.grade,
    when: session.date,
  }));
}

/* -------------------------------------------------------------- scorecard */

function noteForGroup(group: ApiScorecardGroup): string {
  const missed = group.items?.find((item) => !item.passed);
  if (missed) return missed.improve || `Missed: ${missed.label}`;
  return "All criteria met.";
}

export async function getScorecard(
  callId: string,
): Promise<{ rows: ScorecardRow[]; total: string; score: number } | null> {
  const detail = await sessionDetail(callId).catch(() => null);
  if (!detail?.scorecard?.length) return null; // still evaluating, or eval failed

  const rows: ScorecardRow[] = detail.scorecard.map((group) => ({
    name: group.name,
    got: group.earned,
    max: group.total,
    note: noteForGroup(group),
  }));
  const earned = rows.reduce((total, row) => total + row.got, 0);
  const max = rows.reduce((total, row) => total + row.max, 0);

  return { rows, total: `${earned} of ${max} points`, score: detail.score };
}

/* --------------------------------------------------------------- feedback */

// We store the rep's Quick feedback as slugs; the chips render display labels.
// The label sets below are exactly the ones in lib/types.ts, which are exactly
// the options in components/PostCallFeedbackModal.tsx — so this table is
// lossless in both directions.
const STRUGGLE_LABELS: Record<string, string> = {
  opening: "Opening",
  discovery: "Discovery",
  objection_handling: "Objection handling",
  closing: "Closing",
  confidence: "Confidence",
  staying_on_script: "Script control",
};

const BEHAVIOR_LABELS: Record<string, string> = {
  felt_unrealistic: "Unrealistic",
  talked_over_me: "Interrupted me",
  response_delay: "Too slow",
  misheard_me: "Misheard me",
  repetitive: "Too repetitive",
  wrong_difficulty: "Difficulty off",
  wrong_context: "Wrong context",
  tone_felt_off: "Tone off",
};

/** Unknown slugs pass through readably rather than vanishing. */
function toLabels(slugs: string[] | undefined, table: Record<string, string>): string[] {
  return (slugs ?? []).map((slug) => table[slug] ?? slug.replace(/_/g, " "));
}

function toQuickFeedback(callId: string, feedback: ApiSessionFeedback | null | undefined): QuickFeedback {
  if (!feedback || !feedback.submittedAt) {
    return { callId, submitted: false, hard: [], aiIssues: [], note: "" };
  }
  return {
    callId,
    submitted: true,
    hard: toLabels(feedback.struggles, STRUGGLE_LABELS),
    aiIssues: toLabels(feedback.behaviorIssues, BEHAVIOR_LABELS),
    note: feedback.notes ?? "",
  };
}

/** Reads the same rows components/PostCallFeedbackModal.tsx writes. */
export async function getFeedback(callId: string): Promise<QuickFeedback | null> {
  const detail = await sessionDetail(callId).catch(() => null);
  if (!detail) return null;
  return toQuickFeedback(callId, detail.feedback);
}

export async function getFeedbackFeed(): Promise<
  (QuickFeedback & {
    repId: string;
    repName: string;
    initials: string;
    persona: string;
    score: number;
    when: string;
  })[]
> {
  const reps = await getTeam();
  const now = new Date();

  const candidates: {
    rep: Rep;
    session: ApiSessionSummary;
    at: number;
  }[] = [];

  for (const rep of reps) {
    const sessions = await repSessions(rep.team).catch(() => [] as ApiSessionSummary[]);
    sessions.forEach((session, index) => {
      const date = parseDisplayDate(session.date, now);
      // Within a day the list order (newest first) is the only ordering we
      // have, so it breaks ties.
      candidates.push({
        rep,
        session,
        at: (date?.getTime() ?? 0) - index,
      });
    });
  }

  // FEEDBACK_FEED_LIMIT: one detail request per row, so this is bounded rather
  // than team-wide. Anything older than the newest 25 sessions is not shown.
  const newest = candidates.sort((a, b) => b.at - a.at).slice(0, FEEDBACK_FEED_LIMIT);

  const rows = await Promise.all(
    newest.map(async ({ rep, session }) => {
      const detail = await sessionDetail(session.id).catch(() => null);
      return {
        ...toQuickFeedback(session.id, detail?.feedback),
        repId: rep.id,
        repName: rep.name,
        initials: rep.initials,
        persona: session.persona,
        score: session.score,
        when: session.date,
      };
    }),
  );

  return rows;
}

/* -------------------------------------------------------------- scenarios */

/**
 * Our scenarios are persona x call_type (see context/data/scenarios/). There is
 * no assignment model in the schema, so the assignment figures are genuinely
 * zero rather than placeholders: nothing has been assigned to anybody, because
 * assigning is not yet a thing the system can do. Wiring the Assign action is
 * the follow-up that makes them move.
 */
export async function getScenarios(): Promise<Scenario[]> {
  const { personas, callTypes } = await catalog().catch(() => ({
    personas: [] as ApiPersona[],
    callTypes: [] as ApiCallType[],
  }));
  const labelOf = new Map(callTypes.map((callType) => [callType.slug, callType.label]));

  return personas.map((persona) => ({
    id: persona.slug,
    name: `${persona.character_name} · ${persona.business_name}`,
    type: persona.call_type ? labelOf.get(persona.call_type) ?? persona.call_type : "Any call type",
    // Difficulty is a per-session dial in our model, not a property of a
    // scenario, so there is no single value to show here.
    difficulty: "Any",
    persona: persona.primary_objection || persona.industry,
    assignedTo: 0,
    completed: 0,
    avg: 0,
    assignees: [],
  }));
}

/* ----------------------------------------------------------------- alerts */

/**
 * Derived from the team, not stored: a rep below the coaching bar, a rep who has
 * gone quiet, and any session whose evaluation failed. Highest severity first —
 * the sidebar badge counts this list.
 */
export async function getAlerts(): Promise<Alert[]> {
  const reps = await getTeam();
  const alerts: Alert[] = [];

  for (const rep of reps) {
    if (rep.avg !== null && rep.avg < WATCH_MIN_AVG) {
      alerts.push({
        id: `below-${rep.id}`,
        kind: "Below threshold",
        title: `${rep.name} · avg ${rep.avg}`,
        detail: `${rep.sessions} sessions, last ${rep.series.length} scored.`,
        when: rep.idleDays === 0 ? "today" : `${rep.idleDays} days ago`,
        action: "Open rep",
        repId: rep.id,
        severity: "high",
      });
    }
    if (rep.idleDays >= IDLE_WATCH_DAYS) {
      alerts.push({
        id: `idle-${rep.id}`,
        kind: `Inactive ${rep.idleDays} days`,
        title: rep.name,
        detail: "No roleplay since their last session.",
        when: `${rep.idleDays} days ago`,
        action: "Open rep",
        repId: rep.id,
        severity: "high",
      });
    }
  }

  let failed = 0;
  for (const rep of reps) {
    const sessions = await repSessions(rep.team).catch(() => [] as ApiSessionSummary[]);
    failed += sessions.filter((session) => session.status === "eval_failed").length;
  }
  if (failed > 0) {
    alerts.push({
      id: "eval-failed",
      kind: "Awaiting review",
      title: `${failed} call${failed === 1 ? "" : "s"} could not be scored`,
      detail: "The transcript is there but the scorecard failed to generate.",
      when: "recent",
      action: "Review calls",
      severity: "info",
    });
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
