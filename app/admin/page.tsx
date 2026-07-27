'use client';
// app/admin/page.tsx — Team progress: roster -> drill into a rep's History ->
// open a session with the existing SessionDetail. The UI hides nothing
// security-critical: GET /api/admin/roster (and /api/sessions?rep_slug=)
// enforce admin (403) server-side regardless of what renders here; the
// middleware only gates sign-in, not the admin role.
import { useEffect, useState } from 'react';
import { HistoryList } from '../../components/HistoryList';
import { SessionDetail } from '../../components/SessionDetail';
import { Icon } from '../../lib/icons';
import { getRoster, type RosterEntry } from '../../lib/history';

export default function AdminPage() {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repKey, setRepKey] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    getRoster()
      .then(setRoster)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Admin access required'),
      );
  }, []);

  if (error) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <div className="empty-icon">
          <Icon name="phone-off" size={26} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-ink)' }}>
          Admin access required
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-mute)', maxWidth: 340 }}>{error}</div>
      </div>
    );
  }

  if (sessionId) {
    return (
      <SessionDetail
        id={sessionId}
        onBack={() => setSessionId(null)}
        onRetry={() => setSessionId(null)}
      />
    );
  }

  if (repKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '16px 24px 0' }}>
          <button type="button" className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} onClick={() => setRepKey(null)}>
            <Icon name="chevron-left" size={14} /> Team
          </button>
        </div>
        <div className="scroll-y" style={{ overflowY: 'auto', flex: 1 }}>
          <HistoryList repSlug={repKey} onOpen={setSessionId} onStart={() => setRepKey(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ padding: '32px 40px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div className="empty-icon" style={{ width: 44, height: 44 }}>
          <Icon name="analytics" size={22} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--ink)' }}>
            Team progress
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-mute)' }}>
            {roster ? `${roster.length} reps · click a row for their full history.` : 'Loading roster…'}
          </p>
        </div>
      </div>

      {roster === null && (
        <div style={{ fontSize: 13, color: 'var(--ink-mute)', padding: '8px 0' }}>Loading roster…</div>
      )}

      {roster !== null && roster.length === 0 && (
        <div className="panel">
          <div className="empty-state">
            <div className="empty-icon"><Icon name="clock" size={26} /></div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>No sessions yet</div>
            <div style={{ fontSize: 13, color: 'var(--ink-mute)', maxWidth: 380, lineHeight: 1.6 }}>
              Once reps complete roleplays, their aggregates land here.
            </div>
          </div>
        </div>
      )}

      {roster !== null && roster.length > 0 && (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-mute)', fontSize: 11.5 }}>
              <th style={{ padding: 8 }}>Rep</th>
              <th style={{ padding: 8 }}>Calls</th>
              <th style={{ padding: 8 }}>Avg score</th>
              <th style={{ padding: 8 }}>Last active</th>
            </tr>
          </thead>
          <tbody>
            {roster.map(r => (
              <tr
                key={r.rep_key}
                style={{ borderTop: '1px solid var(--line)', cursor: 'pointer' }}
                onClick={() => setRepKey(r.rep_key)}
              >
                <td style={{ padding: 10, fontWeight: 700, color: 'var(--ink)' }}>{r.label}</td>
                <td style={{ padding: 10 }}>{r.calls}</td>
                <td style={{ padding: 10 }}>{r.avg_score}%</td>
                <td style={{ padding: 10, fontSize: 11.5, color: 'var(--ink-mute)' }}>
                  {r.last_active.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
