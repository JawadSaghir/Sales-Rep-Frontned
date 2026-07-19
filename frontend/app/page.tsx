'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ACCENT, CARD_BG, CTA_BG, NAV_ITEMS } from '../lib/data';
import {
  getCallTypes,
  getPersonas,
  getDifficulties,
  getReps,
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

function HomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [activeTab, setActiveTab] = useState<'home' | 'Analytics' | 'Roleplay History' | 'Ask Sales FAQ'>(
    params.get('tab') === 'analytics' ? 'Analytics' : 'home'
  );

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
      .filter(
        ({ d }) => !q || d.character_name.toLowerCase().includes(q) || d.business_name.toLowerCase().includes(q)
      );
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

  const isHome = activeTab === 'home';
  const isAnalytics = activeTab === 'Analytics';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', borderTop: '4px solid #0a0d12' }}>
      <div style={{ width: 290, flexShrink: 0, background: '#fff', borderRight: '1px solid #e6e8ec', display: 'flex', flexDirection: 'column', padding: '28px 20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px', marginBottom: 26 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(160deg,#2a2d33,#0d0f12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>M</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#14161b', letterSpacing: '-.3px' }}>Magic Mike Bot</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: '#9aa2b0' }}>INSIDE SUCCESS TV</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div onClick={() => setActiveTab('home')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: isHome ? ACCENT.bg : 'transparent', color: isHome ? ACCENT.color : '#5b6270', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', borderLeft: `3px solid ${isHome ? ACCENT.color : 'transparent'}` }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>🏠 AI Sales Roleplays</span><span style={{ fontSize: 13 }}>✦</span>
          </div>
          {NAV_ITEMS.map(item => {
            const active = activeTab === item.label;
            return (
              <div key={item.label} onClick={() => setActiveTab(item.label as any)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 12px 17px', borderRadius: 10, background: active ? ACCENT.bg : 'transparent', color: active ? ACCENT.color : '#5b6270', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', borderLeft: `3px solid ${active ? ACCENT.color : 'transparent'}` }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>{item.icon} {item.label}</span>
                {item.badge && <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT.color, background: ACCENT.bg, padding: '2.5px 7px', borderRadius: 5 }}>NEW</span>}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#f8f9fb', borderRadius: 12, padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#14161b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>IS</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#14161b' }}>Inside Success</div>
          </div>
        </div>
      </div>

      {isHome && loading && (
        <div style={centerPanelStyle}>
          <div style={{ fontSize: 13.5, color: '#5b6270' }}>Loading roleplay configuration…</div>
        </div>
      )}

      {isHome && !loading && error && (
        <div style={centerPanelStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#c0392b', marginBottom: 6 }}>Couldn't load configuration</div>
          <div style={{ fontSize: 12.5, color: '#6b7280', textAlign: 'center', maxWidth: 320 }}>{error}</div>
        </div>
      )}

      {isHome && !loading && !error && !hasData && (
        <div style={centerPanelStyle}>
          <div style={{ fontSize: 13.5, color: '#5b6270' }}>No roleplay configuration available yet.</div>
        </div>
      )}

      {isHome && !loading && !error && hasData && selPersona && selRoleplay && selRep && selDifficulty && (
        <>
          <div style={{ width: 520, flexShrink: 0, padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, overflowY: 'auto', position: 'relative' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: ACCENT.color }}>Welcome to</div>
              <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.5px', lineHeight: 1.2, color: '#14161b', marginTop: 4 }}>Inside Success Training Site</div>
            </div>
            <div style={{ width: '100%', maxWidth: 420, background: CARD_BG, borderRadius: 16, padding: '28px 24px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative', overflow: 'hidden', boxShadow: '0 12px 30px rgba(20,22,27,.14)' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(255,255,255,.3)', marginBottom: 14, background: '#3a3f4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#fff' }}>{initialsOf(selPersona.character_name)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{selPersona.character_name} <span style={{ background: '#2fa8a8', color: '#fff', fontSize: 9.5, fontWeight: 700, padding: '2px 5px', borderRadius: 4 }}>AI</span></div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.75)', marginBottom: 14 }}>{selPersona.business_name} · {selPersona.industry}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={pillStyle}>{selRoleplay.label}</span>
                <span style={pillStyle}>English</span>
                <span style={pillStyle}>{selDifficulty.level}</span>
              </div>
              <button onClick={startRoleplay} style={{ width: '100%', background: '#fff', border: 'none', color: '#14161b', padding: 12, borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>✦ Start Roleplay with {firstName}</button>
            </div>
            <div style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(20,22,27,.04)' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#14161b', marginBottom: 8 }}>What you're selling {firstName}</div>
              <div style={{ fontSize: 12.5, color: '#5b6270', lineHeight: 1.6 }}>{selPersona.primary_objection}</div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 540, padding: '16px 28px', overflow: 'hidden', position: 'relative', border: `1px solid ${ACCENT.panelBorder}`, borderRadius: 15, margin: '10px 20px 14px 0', background: '#fff', boxShadow: '0 1px 3px rgba(20,22,27,.04)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#14161b' }}>Quick Start ✦ Select a Demo AI Roleplay</div>
            <div style={{ fontSize: 11.5, color: '#6b7280', marginBottom: 10 }}>*These are preset scenarios.</div>

            <SectionLabel title="Select your roleplay type" hint="Create your own" />
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              {callTypes.map((ct, i) => ct.locked ? (
                <span key={ct.slug} style={{ ...chipStyle, background: '#f6f7f9', color: '#aeb4bf', borderColor: '#e6e8ec' }}>🔒 {ct.label}</span>
              ) : (
                <span key={ct.slug} onClick={() => setRoleplay(i)} style={{ ...chipStyle, ...(roleplay === i ? activeChip : {}) }}>{ct.label}</span>
              ))}
            </div>

            <SectionLabel title="Select your buyer persona" hint="Customize personas" />
            <input value={personaSearch} onChange={e => setPersonaSearch(e.target.value)} placeholder="Search personas…" style={inputStyle} />
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <div ref={personaScrollRef} style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
                {filteredPersonas.map(({ d, i }) => (
                  <div key={d.slug} onClick={() => setPersona(i)} style={{ flexShrink: 0, width: 230, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 13px', borderRadius: 10, border: `1.5px solid ${persona === i ? ACCENT.color : '#e6e8ec'}`, background: persona === i ? ACCENT.softBg : '#fff', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={avatarStyle}>{initialsOf(d.character_name)}</div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#14161b' }}>{d.character_name} <span style={aiTag}>AI</span></div>
                        <div style={{ fontSize: 10.5, color: '#6b7280' }}>{d.business_name}</div>
                      </div>
                    </div>
                    <div style={{ ...radioStyle, borderColor: persona === i ? ACCENT.color : '#d9dde4', background: persona === i ? ACCENT.color : 'transparent' }}>{persona === i ? '✓' : ''}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => scrollPersona(-1)} style={{ ...arrowBtn, left: -13 }}>‹</button>
              <button onClick={() => scrollPersona(1)} style={{ ...arrowBtn, right: -13 }}>›</button>
            </div>

            <SectionLabel title="Select your profile" hint={`${reps.length} profiles`} />
            <input value={profileSearch} onChange={e => setProfileSearch(e.target.value)} placeholder="Search profiles…" style={inputStyle} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 186, overflowY: 'auto', paddingRight: 4, marginBottom: 12 }}>
              {filteredProfiles.map(({ d, i }) => (
                <div key={d.slug} onClick={() => setProfile(i)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 13px', borderRadius: 10, border: `1.5px solid ${profile === i ? ACCENT.color : '#e6e8ec'}`, background: profile === i ? ACCENT.softBg : '#fff', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={avatarStyle}>{initialsOf(d.name)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#14161b' }}>{d.name} <span style={{ ...aiTag, background: '#2fa8a8' }}>REP</span></div>
                      <div style={{ fontSize: 10.5, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.calls} calls{d.grade_normalized ? ` · ${d.grade_normalized}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ ...radioStyle, borderColor: profile === i ? ACCENT.color : '#d9dde4', background: profile === i ? ACCENT.color : 'transparent' }}>{profile === i ? '✓' : ''}</div>
                </div>
              ))}
              {filteredProfiles.length === 0 && <div style={{ padding: 12, textAlign: 'center', fontSize: 11.5, color: '#8a94a6' }}>No profiles match "{profileSearch}"</div>}
            </div>

            <SectionLabel title="Select difficulty level" />
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              {difficulties.map((d, i) => (
                <span key={d.level} onClick={() => setDifficulty(i)} style={{ ...chipStyle, ...(difficulty === i ? activeChip : {}) }}>{d.level}</span>
              ))}
            </div>

            <div style={{ flex: 1, minHeight: 14 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 11, background: '#f8f9fb', border: '1px solid #eef0f3', marginBottom: 12 }}>
              <div style={avatarStyle}>{initialsOf(selPersona.character_name)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: ACCENT.color, marginBottom: 2 }}>Your scenario</div>
                <div style={{ fontSize: 12.5, color: '#3b3f47', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selRoleplay.label} · {selPersona.character_name} · {selDifficulty.level}</div>
              </div>
            </div>
            <button onClick={startRoleplay} style={{ width: '100%', background: CTA_BG, border: 'none', color: '#fff', padding: 13, borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>✦ Start Roleplay with {firstName}</button>
          </div>
        </>
      )}

      {isAnalytics && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
          <div style={{ fontSize: 40 }}>📈</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#14161b' }}>Analytics</div>
          <div style={{ fontSize: 13, color: '#6b7280', maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>Your last roleplay call has ended. Performance analytics for this session will appear here.</div>
          <button onClick={() => setActiveTab('home')} style={{ marginTop: 8, background: CTA_BG, border: 'none', color: '#fff', padding: '11px 22px', borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Back to Roleplays</button>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#14161b' }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: '#8a94a6' }}>{hint}</div>}
    </div>
  );
}

const centerPanelStyle: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40 };
const pillStyle: React.CSSProperties = { background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.25)', color: '#fff', fontSize: 11.5, fontWeight: 600, padding: '5px 12px', borderRadius: 20 };
const chipStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#fff', color: '#3b3f47', border: '1px solid #d9dde4' };
const activeChip: React.CSSProperties = { background: ACCENT.bg, color: ACCENT.color, borderColor: ACCENT.color };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #d9dde4', background: '#fff', fontSize: 12.5, color: '#14161b', marginBottom: 8 };
const avatarStyle: React.CSSProperties = { width: 34, height: 34, flexShrink: 0, borderRadius: '50%', background: '#d9dde4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#5b6270' };
const aiTag: React.CSSProperties = { background: '#2fa8a8', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 4 };
const radioStyle: React.CSSProperties = { width: 18, height: 18, flexShrink: 0, borderRadius: '50%', border: '1.5px solid #d9dde4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 };
const arrowBtn: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', border: '1px solid #e6e8ec', background: '#fff', color: '#3b3f47', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(20,22,27,.12)', fontSize: 16, lineHeight: 1 };

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
