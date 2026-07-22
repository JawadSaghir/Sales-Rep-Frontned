'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NAV_ITEMS, FAQS, type Tab } from '../lib/data';
import { Icon, type IconName } from '../lib/icons';
import {
  getPersonas,
  getReps,
  getTeamWeaknesses,
  type Persona,
  type RepSummary,
} from '../lib/api';
import { HistoryList } from '../components/HistoryList';
import { SessionDetail } from '../components/SessionDetail';
import { RoleplaySetup } from '../components/RoleplaySetup';
import { mapApiPersona, type RoleplayConfig } from '../lib/roleplay';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

/* --------------------------------------------------------------- Sidebar */

function Sidebar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <Icon name="wave" size={20} />
        </div>
        <div className="collapse-hide" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="brand-name">AI CAST MEMBER</span>
          <span className="brand-sub">INSIDE SUCCESS TV</span>
        </div>
      </div>

      <nav className="nav" aria-label="Primary">
        {NAV_ITEMS.map(item => {
          const isActive = active === item.label;
          const label = item.label === 'home' ? 'AI Sales Roleplays' : item.label;
          return (
            <button
              key={item.label}
              type="button"
              className={`nav-item${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onChange(item.label)}
            >
              <span className="nav-label">
                <Icon name={item.icon} size={18} />
                <span>{label}</span>
              </span>
              {item.label === 'home' ? (
                <Icon name="sparkle" size={14} />
              ) : item.badge ? (
                <span className="nav-badge collapse-hide">NEW</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div className="sidebar-user">
        <div className="avatar" style={{ background: 'var(--ink)', color: '#fff' }}>
          IS
        </div>
        <div className="collapse-hide" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
          Inside Success
        </div>
      </div>
    </aside>
  );
}

/* ----------------------------------------------------------- Page header */

function PageHeader({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
      <div className="empty-icon" style={{ width: 44, height: 44 }}>
        <Icon name={icon} size={22} />
      </div>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--ink)' }}>
          {title}
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-mute)' }}>{subtitle}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Analytics tab */

function AnalyticsView({ reps }: { reps: RepSummary[] }) {
  const [weaknesses, setWeaknesses] = useState<{ objection_type: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeamWeaknesses()
      .then(setWeaknesses)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const totalCalls = reps.reduce((sum, r) => sum + r.calls, 0);
  const graded = reps.filter(r => r.grade_normalized);
  const maxCount = Math.max(1, ...weaknesses.map(w => w.count));

  return (
    <div className="fade-up" style={{ padding: '32px 36px', maxWidth: 960, width: '100%', margin: '0 auto' }}>
      <PageHeader icon="analytics" title="Analytics" subtitle="How the team performs across roleplay sessions." />

      <div style={{ display: 'flex', gap: 14, marginBottom: 26, flexWrap: 'wrap' }}>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand)' }}>
            <Icon name="user" size={16} />
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>REPS</span>
          </div>
          <div className="stat-value" style={{ marginTop: 8 }}>{reps.length}</div>
          <div className="stat-label">trainees on the roster</div>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand)' }}>
            <Icon name="phone-off" size={16} />
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>CALLS</span>
          </div>
          <div className="stat-value" style={{ marginTop: 8 }}>{totalCalls.toLocaleString()}</div>
          <div className="stat-label">calls analysed</div>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand)' }}>
            <Icon name="trophy" size={16} />
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>GRADED</span>
          </div>
          <div className="stat-value" style={{ marginTop: 8 }}>{graded.length}</div>
          <div className="stat-label">reps with a grade</div>
        </div>
      </div>

      <div className="panel" style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <Icon name="target" size={18} style={{ color: 'var(--brand)' }} />
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>Top team weaknesses</h2>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--ink-mute)' }}>
          Objection types the team struggles with most — practise these personas first.
        </p>

        {loading && <div style={{ fontSize: 13, color: 'var(--ink-mute)', padding: '8px 0' }}>Loading analytics…</div>}
        {!loading && error && (
          <div style={{ fontSize: 13, color: 'var(--brand-ink)', padding: '8px 0' }}>{error}</div>
        )}
        {!loading && !error && weaknesses.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink-mute)', padding: '8px 0' }}>
            No objection data yet — it appears once reps complete graded roleplays.
          </div>
        )}
        {!loading && !error && weaknesses.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {weaknesses.map(w => (
              <div key={w.objection_type} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 160, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>
                  {w.objection_type.replace(/[-_]/g, ' ')}
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(w.count / maxCount) * 100}%` }} />
                </div>
                <div style={{ width: 42, flexShrink: 0, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-soft)' }}>
                  {w.count}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- FAQ tab */

function FaqView() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="fade-up" style={{ padding: '32px 36px', maxWidth: 760, width: '100%', margin: '0 auto' }}>
      <PageHeader icon="faq" title="FAQ" subtitle="How the training platform works." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q} className={`faq-item${isOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="faq-q"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{f.q}</span>
                <Icon name="chevron-down" size={18} className="faq-chevron" />
              </button>
              {isOpen && <div className="faq-a">{f.a}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Home tab */

function HomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === 'analytics' ? 'Analytics' : tabParam === 'history' ? 'Roleplay History' : 'home'
  );
  // Which session's detail is open in the History tab (null = show the list).
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [reps, setReps] = useState<RepSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Personas gate the setup screen — it can't render without them.
  useEffect(() => {
    setLoading(true);
    setError(null);
    getPersonas()
      .then(setPersonas)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load personas'))
      .finally(() => setLoading(false));
  }, []);

  // Reps are only needed for the Analytics tab and to label the session; they
  // come from the (slow, optional) call corpus, so they must never block the
  // setup screen or fail it.
  useEffect(() => {
    getReps()
      .then(setReps)
      .catch(() => setReps([]));
  }, []);

  // API shape -> the setup screen's Persona shape.
  const roleplayPersonas = useMemo(() => personas.map(mapApiPersona), [personas]);

  // The 2a setup screen has no rep/profile picker. rep_slug is just the identity
  // label stored on the session (the API itself falls back to "rep"), so use the
  // first rep when the roster has loaded and that same fallback otherwise.
  const startRoleplay = (config: RoleplayConfig) => {
    const query = new URLSearchParams({
      rep_slug: reps[0]?.slug ?? 'rep',
      call_type: config.callTypeId,
      persona_slug: config.personaId,
      difficulty: config.difficulty.toLowerCase(),
    });
    router.push(`/roleplay?${query.toString()}`);
  };

  return (
    <div className="app">
      <Sidebar
        active={activeTab}
        onChange={t => {
          if (t === 'Roleplay History') setHistoryOpenId(null); // nav click → list, not a stale detail
          setActiveTab(t);
        }}
      />

      <main style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'Analytics' && (
          <div className="scroll-y" style={{ overflowY: 'auto', height: '100%' }}>
            <AnalyticsView reps={reps} />
          </div>
        )}
        {activeTab === 'Roleplay History' &&
          (historyOpenId ? (
            // SessionDetail owns its own full-height layout + internal scroll.
            <SessionDetail
              id={historyOpenId}
              onBack={() => setHistoryOpenId(null)}
              onRetry={() => {
                setHistoryOpenId(null);
                setActiveTab('home');
              }}
            />
          ) : (
            <div className="scroll-y" style={{ overflowY: 'auto', height: '100%' }}>
              <HistoryList onOpen={setHistoryOpenId} onStart={() => setActiveTab('home')} />
            </div>
          ))}
        {activeTab === 'FAQ' && (
          <div className="scroll-y" style={{ overflowY: 'auto', height: '100%' }}>
            <FaqView />
          </div>
        )}

        {activeTab === 'home' && loading && (
          <div className="empty-state" style={{ height: '100%' }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-mute)' }}>Loading roleplay configuration…</div>
          </div>
        )}
        {activeTab === 'home' && !loading && error && (
          <div className="empty-state" style={{ height: '100%' }}>
            <div className="empty-icon">
              <Icon name="faq" size={26} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-ink)' }}>Couldn&apos;t load configuration</div>
            <div style={{ fontSize: 13, color: 'var(--ink-mute)', maxWidth: 340 }}>{error}</div>
          </div>
        )}
        {activeTab === 'home' && !loading && !error && roleplayPersonas.length === 0 && (
          <div className="empty-state" style={{ height: '100%' }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-mute)' }}>No roleplay configuration available yet.</div>
          </div>
        )}

        {activeTab === 'home' && !loading && !error && roleplayPersonas.length > 0 && (
          <RoleplaySetup personas={roleplayPersonas} onStart={startRoleplay} />
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
