'use client';
// components/HistoryList.tsx — Roleplay History session list (design 1a).
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../lib/icons';
import { getSessions, initialsOf, scoreColor, type SessionSummary } from '../lib/history';

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={scoreColor(score)} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
        {score}
      </span>
    </div>
  );
}

function StatCard({ label, value, sub, delta, deltaColor }: { label: string; value: string; sub: string; delta?: string; deltaColor?: string }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.6px', color: 'var(--brand)' }}>{label}</span>
        {delta && <span style={{ fontSize: 11, fontWeight: 700, color: deltaColor ?? 'var(--ink-mute)' }}>{delta}</span>}
      </div>
      <div className="stat-value" style={{ marginTop: 8 }}>{value}</div>
      <div className="stat-label">{sub}</div>
    </div>
  );
}

export function HistoryList({ onOpen, onStart }: { onOpen: (id: string) => void; onStart: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      const data = await getSessions();
      if (!alive) return;
      setSessions(data);
      setLoading(false);
      const anyPending = data.some(s => s.status === 'evaluating');
      if (anyPending && !timer) {
        timer = setInterval(refresh, 4000);
      } else if (!anyPending && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    refresh().catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(s =>
      [s.persona, s.business, s.callType, s.objection].some(v => v.toLowerCase().includes(q))
    );
  }, [sessions, search]);

  const evaluated = sessions.filter(s => s.status === 'evaluated');
  const avg = evaluated.length ? Math.round(evaluated.reduce((a, s) => a + s.score, 0) / evaluated.length) : 0;

  return (
    <div className="fade-up" style={{ padding: '32px 40px', width: '100%' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div className="empty-icon" style={{ width: 44, height: 44 }}>
          <Icon name="history" size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--ink)' }}>Roleplay History</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-mute)' }}>
            {sessions.length} sessions · reviewed transcripts, scores and coaching.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onStart}>
          <Icon name="sparkle" size={15} /> Start a roleplay
        </button>
      </div>

      {/* stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatCard label="SESSIONS" value={String(sessions.length)} sub="roleplays completed" delta="+3 this week" deltaColor="var(--teal)" />
        <StatCard label="AVG SCORE" value={String(avg)} sub="out of 100" delta="+6 pts" deltaColor="var(--teal)" />
        <StatCard label="BEST CATEGORY" value="Opener" sub="86% criteria met" />
        <StatCard label="WEAKEST" value="Pricing" sub="objection handling" delta="Drill it" deltaColor="var(--brand-ink)" />
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <div className="field-wrap" style={{ flex: 1, marginBottom: 0 }}>
          <span className="field-icon"><Icon name="search" size={15} /></span>
          <input
            className="field"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by persona, call type or objection…"
            aria-label="Search sessions"
          />
        </div>
        <button type="button" className="chip">Call type <Icon name="chevron-down" size={14} /></button>
        <button type="button" className="chip">Persona <Icon name="chevron-down" size={14} /></button>
        <button type="button" className="chip active">Score: All <Icon name="chevron-down" size={14} /></button>
      </div>

      {/* rows */}
      {loading && <div style={{ fontSize: 13, color: 'var(--ink-mute)', padding: '8px 0' }}>Loading sessions…</div>}
      {!loading && filtered.length === 0 && (
        <div className="panel">
          <div className="empty-state">
            <div className="empty-icon"><Icon name="clock" size={26} /></div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
              {search ? `No sessions match "${search}"` : 'No sessions yet'}
            </div>
            {!search && (
              <div style={{ fontSize: 13, color: 'var(--ink-mute)', maxWidth: 380, lineHeight: 1.6 }}>
                Once you finish an AI roleplay, it lands here with its transcript and score.
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(s => {
          const preparing = s.status === 'evaluating';
          const failed = s.status === 'eval_failed';
          return (
            <button key={s.id} type="button" className="session-row" onClick={() => onOpen(s.id)}>
              {s.status === 'evaluated' ? (
                <ScoreRing score={s.score} />
              ) : (
                <div style={{ width: 52, height: 52, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                  <span className={`live-dot ${failed ? 'off' : 'on'}`} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, width: 224, flexShrink: 0, minWidth: 0 }}>
                <span className="avatar" style={{ width: 36, height: 36 }}>{initialsOf(s.persona)}</span>
                <span style={{ minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    {s.persona} <span className="tag">AI</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.business}
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="pill-brand">{s.callType}</span>
                  <span className="pill-neutral">{s.difficulty}</span>
                </div>
                <span style={{ fontSize: 11.5, color: preparing ? 'var(--brand)' : 'var(--ink-mute)', fontWeight: preparing ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {preparing ? 'Scorecard being prepared…' : failed ? 'Couldn’t prepare scorecard' : `Key objection: ${s.objection}`}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, width: 120, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                  {preparing ? 'Preparing…' : failed ? 'Failed' : s.grade}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
                  {preparing ? 'just now' : `${s.date} · ${s.duration}`}
                </span>
              </div>
              <Icon name="chevron-right" size={16} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
