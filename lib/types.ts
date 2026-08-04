export type Role = "admin" | "rep";

export type RepStatus = "On track" | "Watch" | "Needs coaching";

export interface Rep {
  id: string;
  name: string;
  initials: string;
  team: string;
  sessions: number;          // total sessions ever
  avg: number;               // mean of scoredSessions below
  delta: number;             // latest score vs the mean of earlier ones
  // null = we cannot know yet. Our scorecard exposes objection-handling only
  // per session, inside GET /api/sessions/{id}, so a per-rep "criteria met"
  // rate would cost one detail request per session per rep. Rendered as "—"
  // until the API grows a per-rep aggregate. Same convention as streakDays.
  objectionPct: number | null;
  practicedHours: number;
  streakDays: number | null; // null = no active streak
  idleDays: number;
  status: RepStatus;
  series: number[];          // chronological scores, oldest first
}

export interface ScorecardRow {
  // Section names are not a fixed set on our side: the evaluator emits whatever
  // sections the active rules pack defines (api/history_view.py passes
  // `section.label` straight through), so this is a plain string rather than
  // the four-way union the mock assumed.
  name: string;
  got: number;
  max: number;
  note: string;
}

export interface CallSummary {
  id: string;
  repId: string;
  persona: string;
  company: string;
  type: string;              // "Call 1 / Casting Call"
  difficulty: "Easy" | "Medium" | "Hard";
  score: number;             // derived from the scorecard total
  points: string;            // "18 of 20 points"
  verdict: "Excellent" | "Good" | "Needs improvement";
  summary: string;
  when: string;              // "Aug 03 · 7:41"
}

/** Shape of the rep-side Quick feedback form (What felt hard / AI behavior issues / note). */
export interface QuickFeedback {
  callId: string;
  submitted: boolean;
  hard: string[];            // Opening, Discovery, Objection handling, Closing, Confidence, Script control
  aiIssues: string[];        // Unrealistic, Interrupted me, Too slow, Misheard me, Too repetitive, Difficulty off, Wrong context, Tone off
  note: string;              // optional
}

export interface Scenario {
  id: string;
  name: string;
  type: string;
  // Not a closed set on our side: difficulty is a per-session dial the rep
  // turns at setup time, not a property of a scenario, so a scenario row has no
  // single level to report. Rendered as a Chip, so any label works.
  difficulty: string;
  persona: string;
  assignedTo: number;
  completed: number;
  avg: number;
  assignees: { repId: string; name: string; initials: string; started: boolean; score: number | null; state: string }[];
}

export interface Alert {
  id: string;
  kind: string;              // "Below threshold" | "Inactive 9 days" | "Awaiting review"
  title: string;
  detail: string;
  when: string;
  action: string;
  repId?: string;
  severity: "high" | "info";
}
