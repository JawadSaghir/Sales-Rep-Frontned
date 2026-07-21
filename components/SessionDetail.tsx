'use client';
// components/SessionDetail.tsx — session detail: transcript + coaching rail (design 1b).
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import { getSession, initialsOf, isPending, type PendingSession, type SessionDetail as Detail } from '../lib/history';

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
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

export function SessionDetail({ id, onBack, onRetry }: { id: string; onBack: () => void; onRetry: () => void }) {
  const [detail, setDetail] = useState<Detail | PendingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sec, setSec] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>();

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
        if (isPending(d) && d.status === 'evaluating') {
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
    load();
    return () => { alive = false; stop(); };
  }, [id]);

  // Transcript playback clock. Only runs while actually playing on a session
  // that has a real duration — `% 0` would yield NaN on a 0:00 (no-transcript) call.
  useEffect(() => {
    if (!playing || !detail || isPending(detail) || !detail.durationSec) return;
    const dur = detail.durationSec;
    timer.current = setInterval(() => setSec(s => (s + 1) % dur), 1000);
    return () => clearInterval(timer.current);
  }, [playing, detail]);

  if (!detail) {
    return (
      <div style={{ padding: 32, fontSize: 13, color: error ? 'var(--brand)' : 'var(--ink-mute)' }}>
        {error ? `Couldn’t load this session: ${error}` : 'Loading session…'}
      </div>
    );
  }

  // Not evaluated yet: the scorecard/transcript don't exist, so render the
  // waiting (or failed) state instead of the full report.
  if (isPending(detail)) {
    const failed = detail.status === 'eval_failed';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
          <button type="button" className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} onClick={onBack}>
            <Icon name="chevron-left" size={14} /> History
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <span className={`live-dot ${failed ? 'off' : 'on'}`} />
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
            {failed ? 'Couldn’t prepare this scorecard' : 'Preparing your scorecard…'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-mute)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
            {failed
              ? 'The evaluation could not be completed for this call. You can start a new roleplay and try again.'
              : 'We’re scoring your call and writing coaching notes. This updates automatically in a few seconds.'}
          </div>
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
