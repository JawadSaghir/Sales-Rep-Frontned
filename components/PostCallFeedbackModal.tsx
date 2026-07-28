'use client';

import { useEffect, useState } from 'react';
import { getSession, submitSessionFeedback, type SessionFeedback } from '../lib/history';
import { Icon } from '../lib/icons';

const STRUGGLE_OPTIONS = [
  { value: 'opening', label: 'Opening' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'objection_handling', label: 'Objection handling' },
  { value: 'closing', label: 'Closing' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'staying_on_script', label: 'Script control' },
] as const;

const BEHAVIOR_OPTIONS = [
  { value: 'felt_unrealistic', label: 'Unrealistic' },
  { value: 'talked_over_me', label: 'Interrupted me' },
  { value: 'response_delay', label: 'Too slow' },
  { value: 'misheard_me', label: 'Misheard me' },
  { value: 'repetitive', label: 'Too repetitive' },
  { value: 'wrong_difficulty', label: 'Difficulty off' },
  { value: 'wrong_context', label: 'Wrong context' },
  { value: 'tone_felt_off', label: 'Tone off' },
] as const;

function toggleChoice(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter(item => item !== value) : [...current, value];
}

export function PostCallFeedbackModal({
  sessionId,
  onCancel,
  onSaved,
}: {
  sessionId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [struggles, setStruggles] = useState<string[]>([]);
  const [behaviorIssues, setBehaviorIssues] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSession(sessionId)
      .then((detail) => {
        if (!alive || !detail.feedback) return;
        const feedback: SessionFeedback = detail.feedback;
        setStruggles(feedback.struggles);
        setBehaviorIssues(feedback.behaviorIssues);
        setNotes(feedback.notes);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [sessionId]);

  const save = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitSessionFeedback(sessionId, {
        struggles,
        behavior_issues: behaviorIssues,
        notes,
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const chipStyle = (active: boolean) => ({
    padding: '7px 10px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--brand-line)' : 'var(--line)'}`,
    background: active ? 'var(--brand-soft)' : 'var(--surface)',
    color: active ? 'var(--brand-ink)' : 'var(--ink-soft)',
    fontSize: 11.5,
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(248, 244, 239, .32)',
        backdropFilter: 'blur(2px)',
        zIndex: 30,
      }}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: 560,
          padding: '22px 22px 18px',
          boxShadow: '0 24px 60px rgba(26, 31, 44, .18)',
          border: '1px solid rgba(192,57,43,.14)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <Icon name="target" size={16} style={{ color: 'var(--brand)' }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Quick feedback</span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-mute)', marginBottom: 16 }}>
          Optional. Note what felt hard and whether the buyer behavior felt unrealistic before you move on.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>
              WHAT FELT HARD?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STRUGGLE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  style={chipStyle(struggles.includes(option.value))}
                  onClick={() => setStruggles(current => toggleChoice(current, option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>
              AI BEHAVIOR ISSUES
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {BEHAVIOR_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  style={chipStyle(behaviorIssues.includes(option.value))}
                  onClick={() => setBehaviorIssues(current => toggleChoice(current, option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', color: 'var(--ink-mute)', marginBottom: 8 }}>
              OPTIONAL NOTE
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything unrealistic, repetitive, or hard to handle?"
              style={{
                width: '100%',
                minHeight: 88,
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: error ? 'var(--brand-ink)' : 'var(--ink-mute)' }}>
            {error ?? 'All fields are optional.'}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '9px 14px', fontSize: 12.5 }}
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '9px 14px', fontSize: 12.5 }}
              onClick={save}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save feedback'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
