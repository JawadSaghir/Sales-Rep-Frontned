'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NAV_ITEMS, FAQS, type Tab } from '../lib/data';
import { Icon, type IconName } from '../lib/icons';
import {
  getCallTypes,
  getPersonas,
  getDifficulties,
  getReps,
  getTeamWeaknesses,
  type CallType,
  type Persona,
  type Difficulty,
  type RepSummary,
} from '../lib/api';

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
          <span className="brand-name">Magic Mike Bot</span>
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

/* ------------------------------------------------------------ History tab */

function HistoryView({ onStart }: { onStart: () => void }) {
  return (
    <div className="fade-up" style={{ padding: '32px 36px', maxWidth: 960, width: '100%', margin: '0 auto' }}>
      <PageHeader icon="history" title="Roleplay History" subtitle="Your completed practice sessions and reviews." />
      <div className="panel">
        <div className="empty-state">
          <div className="empty-icon">
            <Icon name="clock" size={26} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>No sessions yet</div>
          <div style={{ fontSize: 13, color: 'var(--ink-mute)', maxWidth: 380, lineHeight: 1.6 }}>
            Once you finish an AI roleplay, it lands here with its transcript and score so you can review how
            you handled each objection.
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 6 }} onClick={onStart}>
            <Icon name="sparkle" size={15} />
            Start a roleplay
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- FAQ tab */

function FaqView() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="fade-up" style={{ padding: '32px 36px', maxWidth: 760, width: '100%', margin: '0 auto' }}>
      <PageHeader icon="faq" title="Ask Sales FAQ" subtitle="How the training platform works." />
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
  const [activeTab, setActiveTab] = useState<Tab>(params.get('tab') === 'analytics' ? 'Analytics' : 'home');

  const [callTypes, setCallTypes] = useState<CallType[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [reps, setReps] = useState<RepSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roleplay, setRoleplay] = useState(0);
  const [persona, setPersona] = useState(0);
  const [profile, setProfile] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [personaSearch, setPersonaSearch] = useState('');
  const [profileSearch, setProfileSearch] = useState('');
  const personaScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getCallTypes(), getPersonas(), getDifficulties(), getReps()])
      .then(([c, p, d, r]) => {
        setCallTypes(c);
        setPersonas(p);
        setDifficulties(d);
        setReps(r);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load configuration'))
      .finally(() => setLoading(false));
  }, []);

  const filteredPersonas = useMemo(() => {
    const q = personaSearch.trim().toLowerCase();
    return personas
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => !q || d.character_name.toLowerCase().includes(q) || d.business_name.toLowerCase().includes(q));
  }, [personas, personaSearch]);

  const filteredProfiles = useMemo(() => {
    const q = profileSearch.trim().toLowerCase();
    return reps.map((d, i) => ({ d, i })).filter(({ d }) => !q || d.name.toLowerCase().includes(q));
  }, [reps, profileSearch]);

  const hasData = callTypes.length > 0 && personas.length > 0 && difficulties.length > 0 && reps.length > 0;
  const selPersona = personas[persona];
  const selRoleplay = callTypes[roleplay];
  const selRep = reps[profile];
  const selDifficulty = difficulties[difficulty];
  const firstName = selPersona ? selPersona.character_name.split(' ')[0] : '';

  const startRoleplay = () => {
    if (!selRep || !selRoleplay || !selPersona || !selDifficulty) return;
    const query = new URLSearchParams({
      rep_slug: selRep.slug,
      call_type: selRoleplay.slug,
      persona_slug: selPersona.slug,
      difficulty: selDifficulty.level,
    });
    router.push(`/roleplay?${query.toString()}`);
  };
  const scrollPersona = (dir: number) => personaScrollRef.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });

  return (
    <div className="app">
      <Sidebar active={activeTab} onChange={setActiveTab} />

      <main style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'Analytics' && (
          <div className="scroll-y" style={{ overflowY: 'auto', height: '100%' }}>
            <AnalyticsView reps={reps} />
          </div>
        )}
        {activeTab === 'Roleplay History' && (
          <div className="scroll-y" style={{ overflowY: 'auto', height: '100%' }}>
            <HistoryView onStart={() => setActiveTab('home')} />
          </div>
        )}
        {activeTab === 'Ask Sales FAQ' && (
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
        {activeTab === 'home' && !loading && !error && !hasData && (
          <div className="empty-state" style={{ height: '100%' }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-mute)' }}>No roleplay configuration available yet.</div>
          </div>
        )}

        {activeTab === 'home' && !loading && !error && hasData && selPersona && selRoleplay && selRep && selDifficulty && (
          <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
            {/* Welcome + feature card */}
            <div
              className="scroll-y hide-lg"
              style={{ width: 480, flexShrink: 0, padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, overflowY: 'auto' }}
            >
              <div style={{ textAlign: 'center' }}>
                <div className="eyebrow">Welcome to</div>
                <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.2, color: 'var(--ink)', marginTop: 4 }}>
                  Inside Success Training
                </div>
              </div>

              <div className="feature-card fade-up">
                <div
                  className="avatar"
                  style={{ width: 72, height: 72, fontSize: 26, margin: '0 auto 14px', background: 'rgba(255,255,255,.1)', color: '#fff', border: '3px solid rgba(255,255,255,.22)' }}
                >
                  {initialsOf(selPersona.character_name)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
                  {selPersona.character_name} <span className="tag">AI</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginBottom: 16 }}>
                  {selPersona.business_name} · {selPersona.industry}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span className="pill">{selRoleplay.label}</span>
                  <span className="pill">English</span>
                  <span className="pill">{selDifficulty.level}</span>
                </div>
                <button type="button" className="btn btn-light btn-block" onClick={startRoleplay}>
                  <Icon name="sparkle" size={15} />
                  Start Roleplay with {firstName}
                </button>
              </div>

              <div className="card" style={{ width: '100%', maxWidth: 420, padding: 16 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                  Your scenario
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                  {selPersona.scenario || selPersona.primary_objection}
                </div>
              </div>
            </div>

            {/* Quick-start config panel */}
            <div style={{ flex: 1, minWidth: 0, padding: '14px 20px 14px 0' }}>
              <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '18px 24px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>
                  <Icon name="sparkle" size={17} style={{ color: 'var(--brand)' }} />
                  Quick Start — Select a Demo AI Roleplay
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-mute)', marginBottom: 14 }}>Preset scenarios ready to run.</div>

                <div className="scroll-y" style={{ flex: 1, overflowY: 'auto', paddingRight: 4, marginRight: -4 }}>
                  <SectionLabel title="Select your roleplay type" hint="Create your own" />
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
                    {callTypes.map((ct, i) =>
                      ct.locked ? (
                        <span key={ct.slug} className="chip chip-locked">
                          <Icon name="lock" size={13} /> {ct.label}
                        </span>
                      ) : (
                        <button
                          key={ct.slug}
                          type="button"
                          className={`chip${roleplay === i ? ' active' : ''}`}
                          onClick={() => setRoleplay(i)}
                        >
                          {ct.label}
                        </button>
                      )
                    )}
                  </div>

                  <SectionLabel title="Select your buyer persona" hint="Customize personas" />
                  <div className="field-wrap">
                    <span className="field-icon">
                      <Icon name="search" size={15} />
                    </span>
                    <input
                      className="field"
                      value={personaSearch}
                      onChange={e => setPersonaSearch(e.target.value)}
                      placeholder="Search personas…"
                      aria-label="Search personas"
                    />
                  </div>
                  <div className="scroller" style={{ marginBottom: 16 }}>
                    <div ref={personaScrollRef} className="no-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
                      {filteredPersonas.map(({ d, i }) => (
                        <button
                          key={d.slug}
                          type="button"
                          className={`select-row${persona === i ? ' selected' : ''}`}
                          style={{ flexShrink: 0, width: 232 }}
                          onClick={() => setPersona(i)}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span className="avatar">{initialsOf(d.character_name)}</span>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                                {d.character_name} <span className="tag">AI</span>
                              </span>
                              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {d.business_name}
                              </span>
                            </span>
                          </span>
                          <span className={`radio${persona === i ? ' on' : ''}`}>
                            {persona === i && <Icon name="check" size={11} />}
                          </span>
                        </button>
                      ))}
                    </div>
                    {filteredPersonas.length > 1 && (
                      <>
                        <button type="button" className="scroll-arrow" style={{ left: -13 }} aria-label="Scroll left" onClick={() => scrollPersona(-1)}>
                          <Icon name="chevron-left" size={16} />
                        </button>
                        <button type="button" className="scroll-arrow" style={{ right: -13 }} aria-label="Scroll right" onClick={() => scrollPersona(1)}>
                          <Icon name="chevron-right" size={16} />
                        </button>
                      </>
                    )}
                  </div>

                  <SectionLabel title="Select your profile" hint={`${reps.length} profiles`} />
                  <div className="field-wrap">
                    <span className="field-icon">
                      <Icon name="search" size={15} />
                    </span>
                    <input
                      className="field"
                      value={profileSearch}
                      onChange={e => setProfileSearch(e.target.value)}
                      placeholder="Search profiles…"
                      aria-label="Search profiles"
                    />
                  </div>
                  <div className="scroll-y" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 186, overflowY: 'auto', paddingRight: 4, marginBottom: 16 }}>
                    {filteredProfiles.map(({ d, i }) => (
                      <button
                        key={d.slug}
                        type="button"
                        className={`select-row${profile === i ? ' selected' : ''}`}
                        onClick={() => setProfile(i)}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span className="avatar">{initialsOf(d.name)}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                              {d.name} <span className="tag tag-brand">REP</span>
                            </span>
                            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.calls} calls{d.grade_normalized ? ` · ${d.grade_normalized}` : ''}
                            </span>
                          </span>
                        </span>
                        <span className={`radio${profile === i ? ' on' : ''}`}>
                          {profile === i && <Icon name="check" size={11} />}
                        </span>
                      </button>
                    ))}
                    {filteredProfiles.length === 0 && (
                      <div style={{ padding: 12, textAlign: 'center', fontSize: 11.5, color: 'var(--ink-mute)' }}>
                        No profiles match &quot;{profileSearch}&quot;
                      </div>
                    )}
                  </div>

                  <SectionLabel title="Select difficulty level" />
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {difficulties.map((d, i) => (
                      <button
                        key={d.level}
                        type="button"
                        className={`chip${difficulty === i ? ' active' : ''}`}
                        onClick={() => setDifficulty(i)}
                      >
                        {d.level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sticky scenario summary + CTA */}
                <div style={{ paddingTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 11, background: 'var(--surface-inset)', border: '1px solid var(--line)', marginBottom: 12 }}>
                    <span className="avatar">{initialsOf(selPersona.character_name)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 2 }}>
                        <Icon name="target" size={13} /> Your scenario
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selRoleplay.label} · {selPersona.character_name} · {selDifficulty.level}
                      </div>
                    </div>
                  </div>
                  <button type="button" className="btn btn-primary btn-block" onClick={startRoleplay}>
                    <Icon name="sparkle" size={15} />
                    Start Roleplay with {firstName}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="section-label">
      <span className="st">{title}</span>
      {hint && <span className="sh">{hint}</span>}
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
