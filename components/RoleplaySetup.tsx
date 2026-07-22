'use client';
// components/RoleplaySetup.tsx — AI Sales Roleplays setup (design 2a).
// Three numbered steps (call type → persona → difficulty) + live dark summary rail,
// with an "Add custom persona" card that opens a modal form.
import { useMemo, useState } from 'react';
import { Icon } from '../lib/icons';
import {
  CALL_TYPES, DIFFICULTIES, MOCK_PERSONAS, draftToPersona, initialsOf,
  type Persona, type PersonaDraft, type RoleplayConfig,
} from '../lib/roleplay';

// The pink/black gradient the user provided. Point this at wherever you drop the
// asset in /public (e.g. /roleplay-hero.png).
const RAIL_BG = '/roleplay-hero.png';

const EMPTY_DRAFT: PersonaDraft = { name: '', business: '', industry: '', objection: '', scenario: '' };

export function RoleplaySetup({
  personas: initial = MOCK_PERSONAS,
  onStart,
  onCreatePersona,
}: {
  personas?: Persona[];
  onStart?: (config: RoleplayConfig) => void;
  onCreatePersona?: (draft: PersonaDraft) => void; // fire your API here if you persist
}) {
  const [personas, setPersonas] = useState<Persona[]>(initial);
  const [callTypeIdx, setCallTypeIdx] = useState(0);
  const [personaIdx, setPersonaIdx] = useState(0);
  const [diffIdx, setDiffIdx] = useState(1);
  const [query, setQuery] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<PersonaDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return personas
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !q || p.name.toLowerCase().includes(q) || p.business.toLowerCase().includes(q));
  }, [personas, query]);

  const callType = CALL_TYPES[callTypeIdx];
  const persona = personas[Math.min(personaIdx, personas.length - 1)];
  const difficulty = DIFFICULTIES[diffIdx];

  const start = () =>
    onStart?.({ callTypeId: callType.id, personaId: persona.id, difficulty: difficulty.level });

  const openForm = () => { setDraft(EMPTY_DRAFT); setFormError(null); setFormOpen(true); };
  const setField = (k: keyof PersonaDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDraft(d => ({ ...d, [k]: e.target.value }));
    setFormError(null);
  };
  const saveForm = () => {
    if (!draft.name.trim() || !draft.scenario.trim()) {
      setFormError('Name and scenario briefing are required.');
      return;
    }
    const created = draftToPersona(draft);
    setPersonas(prev => [...prev, created]);
    setPersonaIdx(personas.length); // select the new one
    onCreatePersona?.(draft);
    setFormOpen(false);
  };

  return (
    <div className="fade-up" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 384px', gridTemplateRows: 'minmax(0, 1fr)', height: '100%' }}>
      {/* -------- setup column -------- */}
      <div className="scroll-y" style={{ minWidth: 0, overflowY: 'auto', padding: '28px 28px 28px 32px' }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--ink)' }}>Set up your roleplay</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-mute)' }}>Three quick choices and you're on the call.</p>
        </div>

        {/* step 1 — call type */}
        <StepLabel n={1} title="Call type" />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 24 }}>
          {CALL_TYPES.map((c, i) => {
            const active = callTypeIdx === i;
            return (
              <button
                key={c.id}
                type="button"
                disabled={c.locked}
                onClick={() => !c.locked && setCallTypeIdx(i)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 9, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  cursor: c.locked ? 'not-allowed' : 'pointer',
                  border: `1px solid ${c.locked ? 'var(--line)' : active ? 'var(--brand)' : 'var(--line-strong)'}`,
                  background: c.locked ? 'var(--surface-3)' : active ? 'var(--brand-soft)' : 'var(--surface)',
                  color: c.locked ? 'var(--ink-faint)' : active ? 'var(--brand-ink)' : 'var(--ink-soft)',
                }}
              >
                {c.locked && <Icon name="lock" size={13} />}
                {c.label}
              </button>
            );
          })}
        </div>

        {/* step 2 — persona */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <StepBadge n={2} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Buyer persona</span>
          <span style={{ flex: 1 }} />
          <div className="field-wrap" style={{ width: 220, marginBottom: 0 }}>
            <span className="field-icon"><Icon name="search" size={13} /></span>
            <input
              className="field"
              style={{ padding: '7px 10px 7px 30px', fontSize: 11.5 }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search personas…"
              aria-label="Search personas"
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
          {filtered.map(({ p, i }) => {
            const active = personaIdx === i;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPersonaIdx(i)}
                className="persona-card"
                style={{
                  border: `1.5px solid ${active ? 'var(--brand)' : 'var(--line)'}`,
                  background: active ? 'var(--brand-tint)' : 'var(--surface)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                  <span className="avatar" style={{ width: 34, height: 34 }}>{initialsOf(p.name)}</span>
                  <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                      {p.name} <span className="tag">AI</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.business} · {p.industry}
                    </span>
                  </span>
                  <span style={{
                    width: 18, height: 18, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff',
                    border: `1.5px solid ${active ? 'var(--brand)' : 'var(--line-strong)'}`,
                    background: active ? 'var(--brand)' : 'var(--surface)',
                  }}>
                    {active && <Icon name="check" size={11} strokeWidth={2.5} />}
                  </span>
                </span>
                <span style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--ink-soft)', background: 'var(--surface-inset)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '7px 10px', display: 'block', textAlign: 'left' }}>
                  {p.objection}
                </span>
              </button>
            );
          })}
          {/* add custom persona */}
          <button type="button" onClick={openForm} className="persona-add">
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
              <Icon name="plus" size={18} strokeWidth={2} />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Add custom persona</span>
            <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>Build your own buyer &amp; scenario</span>
          </button>
        </div>

        {/* step 3 — difficulty */}
        <StepLabel n={3} title="Difficulty" />
        <div style={{ display: 'inline-flex', border: '1px solid var(--line-strong)', borderRadius: 10, background: 'var(--surface)', padding: 3 }}>
          {DIFFICULTIES.map((d, i) => {
            const active = diffIdx === i;
            return (
              <button
                key={d.level}
                type="button"
                onClick={() => setDiffIdx(i)}
                style={{
                  padding: '8px 22px', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  background: active ? 'var(--brand)' : 'transparent',
                  color: active ? '#fff' : 'var(--ink-soft)',
                }}
              >
                {d.level}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-mute)', marginTop: 8 }}>{difficulty.hint}</div>
      </div>

      {/* -------- summary rail -------- */}
      <div className="scroll-y" style={{ minWidth: 0, overflowY: 'auto', background: 'var(--surface)', borderLeft: '1px solid var(--line)', padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            borderRadius: 'var(--r-lg)', padding: '26px 22px 20px', color: '#fff', position: 'relative', overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)', textAlign: 'center',
            background: `linear-gradient(180deg, rgba(16,18,22,.5), rgba(16,18,22,.22) 45%, rgba(16,18,22,.6)), #101216 url(${RAIL_BG}) center/cover no-repeat`,
          }}
        >
          <div style={{ width: 64, height: 64, margin: '0 auto 12px', borderRadius: '50%', background: 'rgba(255,255,255,.1)', border: '3px solid rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700 }}>
            {initialsOf(persona.name)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 16, fontWeight: 700 }}>
            {persona.name} <span className="tag">AI</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.72)', marginTop: 3, marginBottom: 14 }}>
            {persona.business} · {persona.industry}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 18 }}>
            {[callType.label, 'English', difficulty.level].map(t => (
              <span key={t} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.24)', fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 'var(--r-pill)' }}>{t}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={start}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 18px', border: 'none', borderRadius: 9, background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <Icon name="sparkle" size={15} /> Start Roleplay with {persona.name.split(' ')[0]}
          </button>
        </div>

        <div className="panel" style={{ padding: '15px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 7 }}>
            <Icon name="target" size={13} /> Your scenario
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{persona.scenario}</div>
        </div>

        <div style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand-line)', borderRadius: 'var(--r-md)', padding: '15px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--brand-ink)', marginBottom: 7 }}>
            <Icon name="analytics" size={13} /> Recommended drill
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            Your weakest category is <strong style={{ color: 'var(--ink)' }}>pricing objections</strong> (avg 34%). Raj Patel's "price is too high" scenario targets it directly.
          </div>
        </div>
      </div>

      {/* -------- custom persona modal -------- */}
      {formOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', background: 'rgba(20,22,27,.42)', padding: 24 }}>
          <div style={{ position: 'absolute', inset: 0 }} onClick={() => setFormOpen(false)} />
          <div style={{ position: 'relative', width: 460, maxHeight: '100%', overflowY: 'auto', background: 'var(--surface)', borderRadius: 16, boxShadow: '0 24px 60px rgba(20,22,27,.28)', animation: 'fadeUp .22s cubic-bezier(.4,0,.2,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 22px', borderBottom: '1px solid var(--surface-3)' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
                <Icon name="user-plus" size={18} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>New buyer persona</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-mute)' }}>Define who the AI plays and the scenario you'll practice.</div>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} className="icon-btn" aria-label="Close">
                <Icon name="x" size={15} strokeWidth={2} />
              </button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Name" value={draft.name} onChange={setField('name')} placeholder="e.g. Priya Shah" />
                <Field label="Industry" value={draft.industry} onChange={setField('industry')} placeholder="e.g. SaaS" />
              </div>
              <Field label="Business / company" value={draft.business} onChange={setField('business')} placeholder="e.g. Northwind Software" />
              <Field label="Signature objection" value={draft.objection} onChange={setField('objection')} placeholder={'e.g. "We just signed with someone else."'} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>Scenario briefing</span>
                <textarea
                  value={draft.scenario}
                  onChange={setField('scenario')}
                  placeholder="Describe the buyer's mindset, what they care about, and what a win looks like on this call…"
                  style={{ boxSizing: 'border-box', minHeight: 84, resize: 'vertical', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit', color: 'var(--ink)', outline: 'none' }}
                />
              </label>
              {formError && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--brand-ink)' }}>{formError}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--surface-3)', background: 'var(--surface-2)', borderRadius: '0 0 16px 16px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={saveForm}>
                <Icon name="check" size={14} strokeWidth={2} /> Save &amp; select
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--ink)', outline: 'none' }}
      />
    </label>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800 }}>{n}</span>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
      <StepBadge n={n} />
      <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{title}</span>
    </div>
  );
}
