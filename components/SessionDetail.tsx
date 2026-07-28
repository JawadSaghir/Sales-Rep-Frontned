'use client';
// components/SessionDetail.tsx — session detail: transcript + coaching rail (design 1b).
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import {
  getSession,
  initialsOf,
  isPending,
  submitSessionFeedback,
  type PendingSession,
  type SessionDetail as Detail,
  type SessionFeedback,
} from '../lib/history';

const STRUGGLE_OPTIONS = [
  { value: 'opening', label: 'Opening' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'objection_handling', label: 'Objection handling' },
  { value: 'closing', label: 'Closing' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'staying_on_script', label: 'Staying on script' },
] as const;

const BEHAVIOR_OPTIONS = [
  { value: 'felt_unrealistic', label: 'Felt unrealistic' },
  { value: 'talked_over_me', label: 'Talked over me' },
  { value: 'response_delay', label: 'Slow to respond' },
  { value: 'misheard_me', label: 'Misheard me' },
  { value: 'repetitive', label: 'Too repetitive' },
  { value: 'wrong_difficulty', label: 'Difficulty felt off' },
  { value: 'wrong_context', label: 'Wrong persona/context' },
  { value: 'tone_felt_off', label: 'Tone felt off' },
] as const;

type FeedbackMode = 'hidden' | 'editable' | 'readonly';

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function toggleChoice(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter(item => item !== value) : [...current, value];
}

function selectedLabels(
  options: readonly { value: string; label: string }[],
  values: string[],
): string[] {
  return values
    .map(value => options.find(option => option.value === value)?.label ?? value)
    .filter(Boolean);
}

function FeedbackCard({
  mode,
  struggles,
  behaviorIssues,
  notes,
  submittedAt,
  submitting,
  submitError,
  onToggleStruggle,
  onToggleBehavior,
  onNotesChange,
  onSubmit,
}: {
  mode: FeedbackMode;
  struggles: string[];
  behaviorIssues: string[];
  notes: string;
  submittedAt: string | null;
  submitting: boolean;
  submitError: string | null;
  onToggleStruggle: (value: string) => void;
  onToggleBehavior: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (mode === 'hidden') return null;
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 10px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--brand-line)' : 'var(--line)'}`,
    background: active ? 'var(--brand-soft)' : 'var(--surface)',
    color: active ? 'var(--brand-ink)' : 'var(--ink-soft)',
    fontSize: 11.5,
    fontWeight: 700,
    cursor: 'pointer',
  });
  const submitted = Boolean(submittedAt);
  const readonlyStruggles = selectedLabels(STRUGGLE_OPTIONS, struggles);
  const readonlyBehaviorIssues = selectedLabels(BEHAVIOR_OPTIONS, behaviorIssues);

  if (mode === 'readonly') {
    return (
      <div className="panel" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="target" size={16} style={{ color: 'var(--brand)' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Rep feedback</span>
        </div>
        {!submitted && readonlyStruggles.length === 0 && readonlyBehaviorIssues.length === 0 && !notes.trim() ? (
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-mute)' }}>
            No rep feedback was submitted for this call.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>WHAT FELT HARD</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {readonlyStruggles.length > 0 ? readonlyStruggles.map(label => (
                  <span key={label} className="pill-neutral">{label}</span>
                )) : <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>Nothing selected.</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>AI BEHAVIOR ISSUES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {readonlyBehaviorIssues.length > 0 ? readonlyBehaviorIssues.map(label => (
                  <span key={label} className="pill-neutral">{label}</span>
                )) : <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>Nothing selected.</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>NOTES</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                {notes.trim() || 'No notes left.'}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="target" size={16} style={{ color: 'var(--brand)' }} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Your feedback</span>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-mute)', marginBottom: 14 }}>
        Optional. Capture what felt hard and whether the buyer behavior felt unrealistic while the call is still fresh.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>WHAT DID YOU STRUGGLE WITH?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STRUGGLE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                style={chipStyle(struggles.includes(option.value))}
                onClick={() => onToggleStruggle(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>DID THE AI FEEL OFF IN ANY WAY?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BEHAVIOR_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                style={chipStyle(behaviorIssues.includes(option.value))}
                onClick={() => onToggleBehavior(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>OPTIONAL NOTE</div>
          <textarea
            value={notes}
            onChange={event => onNotesChange(event.target.value)}
            placeholder="Anything the AI missed, repeated, or handled unrealistically?"
            style={{
              width: '100%',
              minHeight: 96,
              resize: 'vertical',
              borderRadius: 14,
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              padding: '12px 13px',
              fontSize: 12.5,
              lineHeight: 1.55,
              color: 'var(--ink)',
              outline: 'none',
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: submitError ? 'var(--brand-ink)' : submitted ? 'var(--teal)' : 'var(--ink-mute)' }}>
          {submitError
            ? submitError
            : submitted
            ? 'Feedback saved for this session.'
            : 'No fields are required.'}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '9px 14px', fontSize: 12.5 }}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : submitted ? 'Update feedback' : 'Save feedback'}
        </button>
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 360, h = 40, pad = 4;
  // One point can't make a line (i/(length-1) would divide by zero -> NaN path).
  if (points.length < 2) return null;
  const max = Math.max(...points, 1), min = Math.min(...points, 0);
  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * w,
    h - pad - ((p - min) / (max - min || 1)) * (h - pad * 2),
  ]);
  const last = xy[xy.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={xy.map(p => p.join(',')).join(' ')} fill="none" stroke="#e8695c" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={4} fill="#e8695c" />
    </svg>
  );
}

export function SessionDetail({
  id,
  onBack,
  onRetry,
  feedbackMode = 'hidden',
}: {
  id: string;
  onBack: () => void;
  onRetry: () => void;
  feedbackMode?: FeedbackMode;
}) {
  const [detail, setDetail] = useState<Detail | PendingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sec, setSec] = useState(0);
  const [struggles, setStruggles] = useState<string[]>([]);
  const [behaviorIssues, setBehaviorIssues] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [feedbackLoadedFor, setFeedbackLoadedFor] = useState<string | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const applyFeedback = (feedback?: SessionFeedback | null) => {
    if (!feedback) return;
    setStruggles(feedback.struggles);
    setBehaviorIssues(feedback.behaviorIssues);
    setNotes(feedback.notes);
    setSubmittedAt(feedback.submittedAt);
    setFeedbackLoadedFor(id);
  };

  // Poll while the eval is still running so the scorecard fills in on its own.
  useEffect(() => {
    let alive = true;
    let poll: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (poll) { clearInterval(poll); poll = undefined; } };
    const load = async () => {
      try {
        const d = await getSession(id);
        if (!alive) return;
        setDetail(d);
        setError(null);
        if (isPending(d) && (d.status === 'preparing' || d.status === 'evaluating')) {
          if (!poll) poll = setInterval(load, 4000);
        } else {
          stop();
        }
      } catch (e: unknown) {
        if (!alive) return;
        // Leave any already-loaded detail on screen; a poll can fail transiently.
        setError(e instanceof Error ? e.message : 'Could not load this session.');
      }
    };
    // Opening a different session must not inherit the previous one's clock.
    setPlaying(false);
    setSec(0);
    setStruggles([]);
    setBehaviorIssues([]);
    setNotes('');
    setSubmittedAt(null);
    setFeedbackLoadedFor(null);
    setSubmittingFeedback(false);
    setFeedbackError(null);
    load();
    return () => { alive = false; stop(); };
  }, [id]);

  useEffect(() => {
    if (!detail?.feedback || feedbackLoadedFor === id) return;
    applyFeedback(detail.feedback);
  }, [detail, feedbackLoadedFor, id]);

  // Transcript playback clock. Only runs while actually playing on a session
  // that has a real duration — `% 0` would yield NaN on a 0:00 (no-transcript) call.
  useEffect(() => {
    if (!playing || !detail || isPending(detail) || !detail.durationSec) return;
    const dur = detail.durationSec;
    timer.current = setInterval(() => setSec(s => (s + 1) % dur), 1000);
    return () => clearInterval(timer.current);
  }, [playing, detail]);

  const saveFeedback = async () => {
    setSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      const saved = await submitSessionFeedback(id, {
        struggles,
        behavior_issues: behaviorIssues,
        notes,
      });
      applyFeedback(saved);
      setDetail(current => (current ? { ...current, feedback: saved } : current));
    } catch (e: unknown) {
      setFeedbackError(e instanceof Error ? e.message : 'Could not save your feedback.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (!detail) {
    return (
      <div style={{ padding: 32, fontSize: 13, color: error ? 'var(--brand)' : 'var(--ink-mute)' }}>
        {error ? `Couldn’t load this session: ${error}` : 'Loading session…'}
      </div>
    );
  }

  // Not evaluated yet: render the waiting (or failed) state. The transcript
  // exists BEFORE the scorecard (the API stores it the moment the call ends),
  // so when it's present we show it immediately under a slim status banner —
  // the rep reads the call while scoring runs instead of staring at a spinner.
  if (isPending(detail)) {
    const failed = detail.status === 'eval_failed';
    const preparing = detail.status === 'preparing';
    const pendingTranscript = detail.transcript ?? [];
    const personaName = detail.persona || 'Prospect';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
          <button type="button" className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} onClick={onBack}>
            <Icon name="chevron-left" size={14} /> History
          </button>
          {pendingTranscript.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, flex: 1 }}>
              <span className="avatar" style={{ width: 36, height: 36 }}>{initialsOf(personaName)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
                  {personaName} <span className="tag">AI</span>
                  {detail.callType && <span className="pill-brand">{detail.callType}</span>}
                  {detail.difficulty && <span className="pill-neutral">{detail.difficulty}</span>}
                </div>
                {detail.duration && (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-mute)' }}>{detail.duration} duration</div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* status banner — slim when the transcript is already readable */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', background: failed ? 'var(--brand-soft)' : 'var(--surface-inset)', borderBottom: '1px solid var(--line)' }}>
          <span className={`live-dot ${failed ? 'off' : 'on'}`} />
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
            {failed
              ? 'Couldn’t prepare this scorecard'
              : preparing
              ? 'Preparing your transcript…'
              : 'Writing your scorecard…'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-mute)' }}>
            {failed
              ? 'The evaluation could not be completed for this call.'
              : preparing
              ? 'Your call just ended — the transcript lands here first.'
              : 'Read your transcript below — coaching notes appear here automatically when ready.'}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {feedbackMode !== 'hidden' && (
            <div style={{ padding: '16px 20px 0' }}>
              <FeedbackCard
                mode={feedbackMode}
                struggles={struggles}
                behaviorIssues={behaviorIssues}
                notes={notes}
                submittedAt={submittedAt}
                submitting={submittingFeedback}
                submitError={feedbackError}
                onToggleStruggle={value => setStruggles(current => toggleChoice(current, value))}
                onToggleBehavior={value => setBehaviorIssues(current => toggleChoice(current, value))}
                onNotesChange={setNotes}
                onSubmit={saveFeedback}
              />
            </div>
          )}
          {pendingTranscript.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 12.5, color: 'var(--ink-mute)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
                {failed
                  ? 'You can start a new roleplay and try again.'
                  : 'This updates automatically in a few seconds.'}
              </div>
            </div>
          ) : (
            <div className="scroll-y" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pendingTranscript.map((m, i) => {
                const isRep = m.speaker === 'rep';
                return (
                  <div key={i} style={{ display: 'flex', gap: 11, flexDirection: isRep ? 'row-reverse' : 'row' }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, background: isRep ? 'var(--ink)' : 'var(--surface-3)', color: isRep ? '#fff' : 'var(--ink-soft)' }}>
                      {isRep ? 'You' : initialsOf(personaName)}
                    </span>
                    <div style={{ maxWidth: '76%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: isRep ? 'flex-end' : 'flex-start' }}>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{isRep ? 'You' : personaName}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{m.time}</span>
                      </div>
                      <div style={{ padding: '10px 13px', borderRadius: 12, fontSize: 12.5, lineHeight: 1.55, background: isRep ? 'var(--brand-soft)' : 'var(--surface-inset)', color: 'var(--ink)', border: `1px solid ${isRep ? 'var(--brand-line)' : 'var(--line)'}` }}>
                        {m.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalEarned = detail.scorecard.reduce((a, c) => a + c.earned, 0);
  const totalCriteria = detail.scorecard.reduce((a, c) => a + c.total, 0);
  const ringC = 2 * Math.PI * 32;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} onClick={onBack}>
          <Icon name="chevron-left" size={14} /> History
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, flex: 1 }}>
          <span className="avatar" style={{ width: 36, height: 36 }}>{initialsOf(detail.persona)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
              {detail.persona} <span className="tag">AI</span>
              <span className="pill-brand">{detail.callType}</span>
              <span className="pill-neutral">{detail.difficulty}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-mute)' }}>
              {detail.business} · {detail.date} · {detail.duration} duration
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-ghost" style={{ padding: '9px 14px', fontSize: 12.5 }}>Export</button>
        <button type="button" className="btn btn-primary" style={{ padding: '9px 14px', fontSize: 12.5 }} onClick={onRetry}>
          <Icon name="history" size={14} /> Retry scenario
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 424px', gridTemplateRows: 'minmax(0, 1fr)', flex: 1, minHeight: 0 }}>
        {/* transcript column */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--line)', background: 'var(--surface)' }}>
          {/* audio bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
            <button
              type="button"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={() => setPlaying(p => !p)}
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--brand)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 4px 12px rgba(192,57,43,.24)' }}
            >
              {playing ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: detail.durationSec ? `${(sec / detail.durationSec) * 100}%` : '0%', background: 'linear-gradient(90deg, var(--brand-strong), var(--brand))', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-mute)' }}>
                <span>{fmt(sec)}</span><span>{detail.duration}</span>
              </div>
            </div>
            <button type="button" className="icon-btn" aria-label="Volume"><Icon name="volume" size={15} /></button>
          </div>
          {/* transcript search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Transcript</span>
            <div className="field-wrap" style={{ flex: 1, marginBottom: 0 }}>
              <span className="field-icon"><Icon name="search" size={13} /></span>
              <input className="field" style={{ padding: '7px 10px 7px 30px', fontSize: 11.5, background: 'var(--surface-inset)' }} placeholder="Search transcript…" aria-label="Search transcript" />
            </div>
          </div>
          {/* messages */}
          <div className="scroll-y" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {detail.transcript.map((m, i) => {
              const isRep = m.speaker === 'rep';
              return (
                <div key={i} style={{ display: 'flex', gap: 11, flexDirection: isRep ? 'row-reverse' : 'row' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, background: isRep ? 'var(--ink)' : 'var(--surface-3)', color: isRep ? '#fff' : 'var(--ink-soft)' }}>
                    {isRep ? 'You' : initialsOf(detail.persona)}
                  </span>
                  <div style={{ maxWidth: '76%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: isRep ? 'flex-end' : 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{isRep ? 'You' : detail.persona}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{m.time}</span>
                    </div>
                    <div style={{ padding: '10px 13px', borderRadius: 12, fontSize: 12.5, lineHeight: 1.55, background: isRep ? 'var(--brand-soft)' : 'var(--surface-inset)', color: 'var(--ink)', border: `1px solid ${isRep ? 'var(--brand-line)' : 'var(--line)'}` }}>
                      {m.text}
                    </div>
                    {m.marker && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'var(--amber)' }}>
                        <Icon name="target" size={11} strokeWidth={2.2} /> {m.marker}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* coaching rail */}
        <div className="scroll-y" style={{ minWidth: 0, background: 'var(--surface-inset)', overflowY: 'auto' }}>
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* score card */}
            <div style={{ background: 'linear-gradient(158deg, var(--deep-1), var(--deep-2))', borderRadius: 'var(--r-lg)', padding: 20, color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: 'linear-gradient(90deg, var(--brand-strong), var(--brand), #e8695c)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
                  <svg width="76" height="76" viewBox="0 0 76 76">
                    <circle cx="38" cy="38" r="32" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={6} />
                    <circle cx="38" cy="38" r="32" fill="none" stroke="#e8695c" strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(detail.score / 100) * ringC} ${ringC}`} transform="rotate(-90 38 38)" />
                  </svg>
                  <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 21, fontWeight: 800 }}>{detail.score}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.4px', color: 'rgba(255,255,255,.6)' }}>OVERALL SCORE</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{detail.grade}</div>
                  {detail.trend.length > 1 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, fontWeight: 700, color: '#3ddbc4' }}>
                      <Icon name="analytics" size={12} strokeWidth={2.2} />
                      {detail.score - detail.trend[detail.trend.length - 2] >= 0 ? '+' : ''}
                      {detail.score - detail.trend[detail.trend.length - 2]} vs your last {detail.callType}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  LAST {detail.trend.length} SESSIONS
                </div>
                <Sparkline points={detail.trend} />
              </div>
            </div>

            {/* AI feedback */}
            {feedbackMode !== 'hidden' && (
              <FeedbackCard
                mode={feedbackMode}
                struggles={struggles}
                behaviorIssues={behaviorIssues}
                notes={notes}
                submittedAt={submittedAt}
                submitting={submittingFeedback}
                submitError={feedbackError}
                onToggleStruggle={value => setStruggles(current => toggleChoice(current, value))}
                onToggleBehavior={value => setBehaviorIssues(current => toggleChoice(current, value))}
                onNotesChange={setNotes}
                onSubmit={saveFeedback}
              />
            )}

            <div className="panel" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="sparkle" size={16} style={{ color: 'var(--brand)' }} />
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>AI Coach feedback</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--teal)', marginBottom: 8 }}>WHAT WENT WELL</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {detail.wentWell.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, fontSize: 12, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
                    <Icon name="check" size={14} strokeWidth={2.2} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--brand-ink)', marginBottom: 8 }}>WHAT TO IMPROVE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.toImprove.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, fontSize: 12, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
                    <Icon name="target" size={14} strokeWidth={2.2} style={{ color: 'var(--brand)', flexShrink: 0, marginTop: 2 }} />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* scorecard */}
            <div className="panel" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Scorecard</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)' }}>{totalEarned} of {totalCriteria} criteria met</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {detail.scorecard.map(c => {
                  const pct = c.total ? (c.earned / c.total) * 100 : 0;
                  const color = pct >= 75 ? 'var(--teal)' : pct >= 50 ? 'var(--amber)' : 'var(--brand)';
                  return (
                    <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{c.earned} / {c.total}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, width: `${Math.max(pct, 4)}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
