// lib/history.ts — types + data access for the Roleplay History tab.
// Mock data included so the UI works today; swap `getSessions` to the real
// endpoint (`get<SessionSummary[]>('/api/sessions')`) when the backend is ready.

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

/* ------------------------------------------------------------- mock data */

export const MOCK_SESSIONS: SessionSummary[] = [
  { id: 's1', score: 72, grade: 'B · Solid', persona: 'Marcus Turner', business: 'Turner Logistics', callType: 'Cold Call', difficulty: 'Hard', objection: '"We already have a vendor for this."', date: 'Jul 20', duration: '6:48', durationSec: 408 },
  { id: 's2', score: 84, grade: 'A · Strong', persona: 'Dana Whitfield', business: 'Whitfield Dental Group', callType: 'Discovery', difficulty: 'Medium', objection: '"Send me an email instead."', date: 'Jul 19', duration: '9:12', durationSec: 552 },
  { id: 's3', score: 58, grade: 'C · Needs work', persona: 'Raj Patel', business: 'Patel & Co Accounting', callType: 'Cold Call', difficulty: 'Hard', objection: '"Your price is way too high."', date: 'Jul 18', duration: '4:03', durationSec: 243 },
  { id: 's4', score: 91, grade: 'A · Strong', persona: 'Elena Marsh', business: 'Marsh Realty', callType: 'Follow-up', difficulty: 'Easy', objection: '"I need to talk to my partner first."', date: 'Jul 16', duration: '7:56', durationSec: 476 },
  { id: 's5', score: 43, grade: 'D · Review', persona: 'Marcus Turner', business: 'Turner Logistics', callType: 'Cold Call', difficulty: 'Hard', objection: '"How did you get this number?"', date: 'Jul 15', duration: '2:41', durationSec: 161 },
  { id: 's6', score: 66, grade: 'B · Solid', persona: 'Dana Whitfield', business: 'Whitfield Dental Group', callType: 'Objection Drill', difficulty: 'Medium', objection: '"Not in the budget this quarter."', date: 'Jul 14', duration: '5:20', durationSec: 320 },
];

export const MOCK_DETAIL: SessionDetail = {
  ...MOCK_SESSIONS[0],
  trend: [44, 52, 49, 61, 63, 72],
  wentWell: [
    'Permission-based opener earned 20 seconds instead of a hang-up — keep this exact pattern.',
    'Reframed the "existing vendor" objection as complementary rather than competitive.',
  ],
  toImprove: [
    'You quoted price before anchoring value at 3:41 — hold pricing until after the pain is quantified.',
    'Two closed questions in a row at 1:05 stalled discovery; open with "how" or "what" instead.',
    'Call ended without a concrete next step — always book the follow-up while on the line.',
  ],
  scorecard: [
    { name: 'Opener', earned: 2, total: 2 },
    { name: 'Discovery', earned: 2, total: 3 },
    { name: 'Objection handling', earned: 2, total: 2 },
    { name: 'Pricing conversation', earned: 0, total: 2 },
    { name: 'Close & next steps', earned: 1, total: 1 },
  ],
  transcript: [
    { speaker: 'ai', time: '0:02', text: 'Turner Logistics, Marcus speaking. Who is this?' },
    { speaker: 'rep', time: '0:05', text: 'Hey Marcus, this is Jordan with Inside Success. I know I\u2019m calling out of the blue — can I take twenty seconds to tell you why, and you can decide if we keep talking?', marker: 'Strong permission-based opener' },
    { speaker: 'ai', time: '0:14', text: 'You\u2019ve got twenty seconds.' },
    { speaker: 'rep', time: '0:16', text: 'We work with logistics teams your size that are losing deals because reps freeze on price pushback. We run AI practice calls so they don\u2019t. Worth a look?' },
    { speaker: 'ai', time: '0:29', text: 'We already have a vendor for training. Not interested in switching.' },
    { speaker: 'rep', time: '0:33', text: 'Totally fair — most teams we work with kept their vendor. This sits alongside it for daily reps practice. What does your current program do for objection drills?', marker: 'Objection reframed — kept the conversation open' },
    { speaker: 'ai', time: '0:47', text: 'Honestly? Not much. It\u2019s mostly onboarding videos.' },
  ],
};

/* -------------------------------------------------------------- API stubs */
// Replace bodies with real fetches when endpoints exist, e.g.:
//   export const getSessions = () => get<SessionSummary[]>('/api/sessions');
//   export const getSession = (id: string) => get<SessionDetail>(`/api/sessions/${id}`);

export async function getSessions(): Promise<SessionSummary[]> {
  return MOCK_SESSIONS;
}

export async function getSession(id: string): Promise<SessionDetail> {
  return { ...MOCK_DETAIL, ...(MOCK_SESSIONS.find(s => s.id === id) ?? MOCK_SESSIONS[0]) , trend: MOCK_DETAIL.trend, wentWell: MOCK_DETAIL.wentWell, toImprove: MOCK_DETAIL.toImprove, scorecard: MOCK_DETAIL.scorecard, transcript: MOCK_DETAIL.transcript };
}
