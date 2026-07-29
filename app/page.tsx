'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getSession, signOut } from 'next-auth/react';
import { NAV_ITEMS, FAQS, type Tab } from '../lib/data';
import { Icon, type IconName } from '../lib/icons';
import {
  getMe,
  getPersonas,
  type Persona,
} from '../lib/api';
import { HistoryList } from '../components/HistoryList';
import { PostCallFeedbackModal } from '../components/PostCallFeedbackModal';
import { SessionDetail } from '../components/SessionDetail';
import { RoleplaySetup } from '../components/RoleplaySetup';
import { mapApiPersona, type RoleplayConfig } from '../lib/roleplay';

// v2 was one unscoped key shared by every rep on the machine — safe while
// /api/personas returned only built-ins, but Task 4 made it return the
// caller's own custom personas too (name, business, objection, full scenario
// briefing). Scoped per signed-in identity so a second rep on a shared
// training laptop never has rep A's cache restored on first paint. Bumped to
// v4 because the cached payload shape now also carries persona labels and
// personality traits for the setup cards.
const PERSONA_CACHE_PREFIX = 'istv_personas_v4:';
const LEGACY_PERSONA_CACHE_KEY = 'istv_personas_v1';
const LEGACY_PERSONA_CACHE_KEY_V2 = 'istv_personas_v2';
const HIDDEN_PERSONA_SLUGS = new Set(['charlie-ritenour']);

function personaCacheKey(identity: string): string {
  return `${PERSONA_CACHE_PREFIX}${identity}`;
}

// Best-effort cleanup of every generation of persona cache this browser may
// hold, called on sign-out. Scoping the key by identity already stops one
// rep's cache being *read* by the next signed-in rep; this additionally wipes
// it from disk so it doesn't sit there indefinitely on a shared machine.
function clearAllPersonaCache(): void {
  try {
    localStorage.removeItem(LEGACY_PERSONA_CACHE_KEY);
    localStorage.removeItem(LEGACY_PERSONA_CACHE_KEY_V2);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PERSONA_CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* storage blocked — nothing to clear */
  }
}

function visiblePersonas(items: Persona[]): Persona[] {
  return items.filter(persona => !HIDDEN_PERSONA_SLUGS.has(persona.slug));
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

/* --------------------------------------------------------------- Sidebar */

function Sidebar({
  active,
  onChange,
  isAdmin,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  isAdmin: boolean;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <Image
            src="/insidesuccess-logo.jpg"
            alt="Inside Success"
            width={44}
            height={44}
            priority
            className="brand-logo-image"
          />
        </div>
        <div className="collapse-hide" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="brand-name">ISTV AI MOCK CALLS</span>
          <span className="brand-sub">SALES REP TRAINING</span>
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

      {isAdmin && (
        <Link href="/admin" className="nav-item">
          <span className="nav-label">
            <Icon name="target" size={18} />
            <span>Admin</span>
          </span>
        </Link>
      )}

      <button
        type="button"
        className="nav-item nav-signout"
        onClick={() => {
          clearAllPersonaCache();
          signOut({ callbackUrl: '/sign-in' });
        }}
      >
        <span className="nav-label">
          <Icon name="log-out" size={18} />
          <span>Sign out</span>
        </span>
      </button>
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
  const sessionParam = params.get('session');
  const feedbackParam = params.get('feedback');
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === 'history' ? 'Roleplay History' : 'home'
  );
  // Which session's detail is open in the History tab (null = show the list).
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(
    tabParam === 'history' ? sessionParam : null
  );
  const [showFeedbackModal, setShowFeedbackModal] = useState(
    tabParam === 'history' && feedbackParam === '1' && Boolean(sessionParam)
  );

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Drives the Admin nav link only (UI courtesy — the API is the real
  // enforcement on every /api/admin/* route). A failed /me fetch just means
  // no admin link, never an error state.
  useEffect(() => {
    getMe()
      .then(me => setIsAdmin(me.is_admin))
      .catch(() => setIsAdmin(false));
  }, []);

  // Personas gate the setup screen — it can't render without them. The free-
  // tier API cold-starts in ~60s after idle, so returning visitors get the
  // last-known catalog from localStorage instantly (stale-while-revalidate)
  // and the fresh fetch swaps in behind it. Only a first-ever visit (nothing
  // cached) still waits on the network.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // getSession() hits NextAuth's own /api/auth/session route, not the
      // FastAPI backend, so it resolves fast even while the API is still
      // cold-starting — the identity lookup doesn't reintroduce the delay
      // the cache exists to hide. Falls back to a shared key only if the
      // session genuinely can't be read (still never surfaces another rep's
      // cache: their entry lives under their own key, not this one).
      const session = await getSession().catch(() => null);
      const identity = session?.user?.email ?? 'unknown';
      const cacheKey = personaCacheKey(identity);

      let cached: Persona[] | null = null;
      try {
        localStorage.removeItem(LEGACY_PERSONA_CACHE_KEY);
        localStorage.removeItem(LEGACY_PERSONA_CACHE_KEY_V2);
        const raw = localStorage.getItem(cacheKey);
        if (raw) cached = visiblePersonas(JSON.parse(raw) as Persona[]);
      } catch {
        cached = null; // corrupt cache — fall through to the network
      }
      if (cancelled) return;
      if (cached && cached.length > 0) {
        setPersonas(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      getPersonas()
        .then((fresh) => {
          if (cancelled) return;
          const visible = visiblePersonas(fresh);
          setPersonas(visible);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(visible));
          } catch {
            /* storage full/blocked — the fetch still rendered */
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          // With a cached catalog on screen, a background refresh failure is
          // not worth an error screen; without one, it is.
          if (!cached || cached.length === 0) {
            setError(e instanceof Error ? e.message : 'Failed to load personas');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // API shape -> the setup screen's Persona shape.
  const roleplayPersonas = useMemo(() => personas.map(mapApiPersona), [personas]);

  // The 2a setup screen has no rep/profile picker. Rep identity now comes from
  // the signed-in session on the server side, not a client-supplied slug.
  const startRoleplay = (config: RoleplayConfig) => {
    const query = new URLSearchParams({
      call_type: config.callTypeId,
      persona_slug: config.personaId,
      difficulty: config.difficulty.toLowerCase(),
    });
    router.push(`/roleplay?${query.toString()}`);
  };

  const clearHistorySessionParam = () => {
    if (params.get('session')) router.replace('/?tab=history');
  };

  const closeFeedbackModal = (sessionId: string | null = historyOpenId) => {
    setShowFeedbackModal(false);
    setActiveTab('Roleplay History');
    setHistoryOpenId(sessionId);
    if (sessionId) {
      router.replace(`/?tab=history&session=${encodeURIComponent(sessionId)}`);
      return;
    }
    router.replace('/?tab=history');
  };

  return (
    <div className="app">
      <Sidebar
        active={activeTab}
        onChange={t => {
          if (t !== 'Roleplay History') setShowFeedbackModal(false);
          if (t === 'Roleplay History') setHistoryOpenId(null); // nav click → list, not a stale detail
          setActiveTab(t);
        }}
        isAdmin={isAdmin}
      />

      <main style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'Roleplay History' && (
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <div
              aria-hidden={showFeedbackModal}
              style={{
                height: '100%',
                filter: showFeedbackModal ? 'blur(5px)' : 'none',
                opacity: showFeedbackModal ? 0.72 : 1,
                transform: showFeedbackModal ? 'scale(0.994)' : 'none',
                transition: 'filter 160ms ease, opacity 160ms ease, transform 160ms ease',
                pointerEvents: showFeedbackModal ? 'none' : 'auto',
              }}
            >
              {historyOpenId ? (
                // SessionDetail owns its own full-height layout + internal scroll.
                <SessionDetail
                  id={historyOpenId}
                  onBack={() => {
                    closeFeedbackModal();
                    clearHistorySessionParam();
                    setHistoryOpenId(null);
                  }}
                  onRetry={() => {
                    closeFeedbackModal();
                    if (params.get('session')) router.replace('/');
                    setHistoryOpenId(null);
                    setActiveTab('home');
                  }}
                />
              ) : (
                <div className="scroll-y" style={{ overflowY: 'auto', height: '100%' }}>
                  <HistoryList onOpen={setHistoryOpenId} onStart={() => setActiveTab('home')} />
                </div>
              )}
            </div>
            {showFeedbackModal && historyOpenId && (
              <PostCallFeedbackModal
                sessionId={historyOpenId}
                onCancel={() => closeFeedbackModal(historyOpenId)}
                onSaved={() => closeFeedbackModal(historyOpenId)}
              />
            )}
          </div>
        )}
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
