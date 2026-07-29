'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';
import {
  type ReviewMetric,
  type ScorecardCriterion,
  type ScorecardGroup,
  type SessionDetail as Detail,
  scoreColor,
} from '../lib/history';

function Sparkline({ points }: { points: number[] }) {
  const w = 360;
  const h = 40;
  const pad = 4;
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const xy = points.map((point, index) => [
    (index / (points.length - 1)) * w,
    h - pad - ((point - min) / (max - min || 1)) * (h - pad * 2),
  ]);
  const last = xy[xy.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline
        points={xy.map(point => point.join(',')).join(' ')}
        fill="none"
        stroke="#e8695c"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={4} fill="#e8695c" />
    </svg>
  );
}

function statusTone(status: string): {
  bg: string;
  fg: string;
  border: string;
  label: string;
} {
  switch (status) {
    case 'strong':
      return { bg: 'rgba(38, 166, 154, .12)', fg: 'var(--teal)', border: 'rgba(38, 166, 154, .24)', label: 'Strong' };
    case 'mixed':
      return { bg: 'rgba(243, 156, 18, .12)', fg: 'var(--amber)', border: 'rgba(243, 156, 18, .24)', label: 'Mixed' };
    case 'weak':
      return { bg: 'var(--brand-soft)', fg: 'var(--brand-ink)', border: 'var(--brand-line)', label: 'Weak' };
    default:
      return { bg: 'var(--surface-3)', fg: 'var(--ink-mute)', border: 'var(--line)', label: 'Limited' };
  }
}

function MetricRow({ metric }: { metric: ReviewMetric }) {
  const tone = statusTone(metric.status);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid var(--line)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{metric.label}</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 7px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '.5px',
              background: tone.bg,
              color: tone.fg,
              border: `1px solid ${tone.border}`,
              textTransform: 'uppercase',
            }}
          >
            {tone.label}
          </span>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{metric.summary}</div>
      </div>
      <div
        style={{
          alignSelf: 'start',
          padding: '6px 10px',
          borderRadius: 12,
          background: 'var(--surface-inset)',
          border: '1px solid var(--line)',
          fontSize: 12.5,
          fontWeight: 800,
          color: 'var(--ink)',
          minWidth: 46,
          textAlign: 'center',
        }}
      >
        {metric.value}
      </div>
    </div>
  );
}

function CriterionRow({ item }: { item: ScorecardCriterion }) {
  const [open, setOpen] = useState(false);
  const citationText =
    item.citations.length > 0
      ? item.citations
          .map(citation => {
            if (citation.turn && citation.time) return `Turn ${citation.turn} · ${citation.time}`;
            if (citation.turn) return `Turn ${citation.turn}`;
            return citation.time ?? null;
          })
          .filter(Boolean)
      : [];

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${item.passed ? 'rgba(38, 166, 154, .18)' : 'var(--line)'}`,
        background: item.passed ? 'rgba(38, 166, 154, .06)' : 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
          gap: 10,
          alignItems: 'center',
          border: 'none',
          background: 'transparent',
          padding: '12px 14px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: item.passed ? 'rgba(38, 166, 154, .14)' : 'var(--brand-soft)',
            color: item.passed ? 'var(--teal)' : 'var(--brand)',
            border: `1px solid ${item.passed ? 'rgba(38, 166, 154, .22)' : 'var(--brand-line)'}`,
          }}
        >
          <Icon name={item.passed ? 'check' : 'x'} size={12} strokeWidth={2.3} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{item.label}</div>
          {item.sectionLabel && (
            <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 700, color: 'var(--ink-mute)', letterSpacing: '.5px', textTransform: 'uppercase' }}>
              {item.sectionLabel}
            </div>
          )}
        </div>
        <span
          style={{
            padding: '4px 8px',
            borderRadius: 999,
            background: item.passed ? 'rgba(38, 166, 154, .12)' : 'var(--surface-inset)',
            border: `1px solid ${item.passed ? 'rgba(38, 166, 154, .2)' : 'var(--line)'}`,
            color: item.passed ? 'var(--teal)' : 'var(--ink-soft)',
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: '.5px',
            textTransform: 'uppercase',
          }}
        >
          {item.passed ? 'Pass' : 'Miss'}
        </span>
        <Icon
          name="chevron-down"
          size={15}
          style={{
            color: 'var(--ink-mute)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 140ms ease',
          }}
        />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px 46px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', color: 'var(--ink-mute)', textTransform: 'uppercase', marginBottom: 5 }}>
              Why this was scored this way
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{item.why}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', color: 'var(--ink-mute)', textTransform: 'uppercase', marginBottom: 5 }}>
              What to do differently next time
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{item.improve}</div>
          </div>
          {citationText.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', color: 'var(--ink-mute)', textTransform: 'uppercase', marginBottom: 5 }}>
                Evidence
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {citationText.map(text => (
                  <span key={text} className="pill-neutral">{text}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreGroupCard({ group }: { group: ScorecardGroup }) {
  const pct = group.total ? Math.round((group.earned / group.total) * 100) : 0;
  const barColor = scoreColor(pct);
  return (
    <div className="panel" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{group.name}</div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--ink-mute)' }}>{group.earned} of {group.total} points</div>
        </div>
        <div
          style={{
            padding: '7px 10px',
            borderRadius: 12,
            background: 'var(--surface-inset)',
            border: '1px solid var(--line)',
            fontSize: 12,
            fontWeight: 800,
            color: barColor,
          }}
        >
          {pct}%
        </div>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${Math.max(pct, 4)}%`, borderRadius: 999, background: barColor }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {group.items.map(item => (
          <CriterionRow key={`${group.key}:${item.key}`} item={item} />
        ))}
      </div>
    </div>
  );
}

function ListCard({
  title,
  icon,
  accent,
  items,
  empty,
}: {
  title: string;
  icon: 'check' | 'target';
  accent: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="panel" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name={icon} size={16} style={{ color: accent }} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{title}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-mute)' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <div key={item} style={{ display: 'flex', gap: 9, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
              <Icon name={icon} size={14} strokeWidth={2.1} style={{ color: accent, flexShrink: 0, marginTop: 2 }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  caption,
  aside,
}: {
  eyebrow: string;
  title: string;
  caption?: string;
  aside?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: '.9px',
            color: 'var(--ink-mute)',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {eyebrow}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
        {caption && (
          <div style={{ marginTop: 3, fontSize: 12, color: 'var(--ink-mute)' }}>{caption}</div>
        )}
      </div>
      {aside}
    </div>
  );
}

export function SessionReviewWorkspace({
  detail,
  feedbackCard,
  paneWidth,
}: {
  detail: Detail;
  feedbackCard?: ReactNode;
  paneWidth: number;
}) {
  const totalEarned = detail.scorecard.reduce((sum, group) => sum + group.earned, 0);
  const totalPossible = detail.scorecard.reduce((sum, group) => sum + group.total, 0);
  const delta = detail.trend.length > 1 ? detail.score - detail.trend[detail.trend.length - 2] : null;
  const ringC = 2 * Math.PI * 32;
  const twoColumn = paneWidth >= 560;
  const wideColumn = paneWidth >= 760;
  const cardGridTemplate = twoColumn ? 'repeat(2, minmax(0, 1fr))' : '1fr';
  const stageGridTemplate = wideColumn ? 'repeat(2, minmax(0, 1fr))' : '1fr';

  return (
    <div className="scroll-y" style={{ minWidth: 0, background: 'var(--surface-inset)', overflowY: 'auto' }}>
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            background: 'linear-gradient(158deg, var(--deep-1), var(--deep-2))',
            borderRadius: 'var(--r-lg)',
            padding: 20,
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: 'linear-gradient(90deg, var(--brand-strong), var(--brand), #e8695c)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
              <svg width="76" height="76" viewBox="0 0 76 76">
                <circle cx="38" cy="38" r="32" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={6} />
                <circle
                  cx="38"
                  cy="38"
                  r="32"
                  fill="none"
                  stroke="#e8695c"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={`${(detail.score / 100) * ringC} ${ringC}`}
                  transform="rotate(-90 38 38)"
                />
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 21, fontWeight: 800 }}>{detail.score}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.4px', color: 'rgba(255,255,255,.6)' }}>POST-CALL REVIEW</div>
              <div style={{ marginTop: 2, fontSize: 16, fontWeight: 800 }}>{detail.grade}</div>
              <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,.82)' }}>
                {detail.reviewAnalysis.callSummary}
              </div>
              {delta !== null && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, fontWeight: 700, color: '#3ddbc4' }}>
                  <Icon name="analytics" size={12} strokeWidth={2.2} />
                  {delta >= 0 ? '+' : ''}
                  {delta} vs your last {detail.callType}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                SCORECARD TOTAL
              </div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{totalEarned} of {totalPossible} points</div>
            </div>
            <div style={{ minWidth: 140, flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                LAST {detail.trend.length} SESSIONS
              </div>
              <Sparkline points={detail.trend} />
            </div>
          </div>
        </div>

        <SectionHeader
          eyebrow="Review summary"
          title="Score breakdown and coaching"
          caption="The transcript stays on the left. Everything used to score the call lives here on the right."
          aside={
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-mute)' }}>
              {totalEarned} / {totalPossible} points
            </span>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: cardGridTemplate, gap: 16, alignItems: 'start' }}>
          <div className="panel" style={{ padding: '16px 18px', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Icon name="sparkle" size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Call summary</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-soft)' }}>
              {detail.reviewAnalysis.callSummary}
            </div>
          </div>

          <ListCard
            title="What went well"
            icon="check"
            accent="var(--teal)"
            items={detail.wentWell}
            empty="No strengths were captured for this call."
          />

          <ListCard
            title="What to improve"
            icon="target"
            accent="var(--brand)"
            items={detail.toImprove}
            empty="No improvement notes were captured for this call."
          />

          {feedbackCard}
        </div>

        <SectionHeader
          eyebrow="Scorecard"
          title="Detailed scorecard"
          caption="Every scored item stays expandable, including passes."
        />
        <div style={{ display: 'grid', gridTemplateColumns: cardGridTemplate, gap: 14, alignItems: 'start' }}>
          {detail.scorecard.map(group => (
            <ScoreGroupCard key={group.key} group={group} />
          ))}
        </div>

        <SectionHeader
          eyebrow="Analytics"
          title="Stage performance and conversation signals"
          caption="The evaluator’s read on how the call moved across opener, discovery, proof, takeaway, and close."
        />

        <div className="panel" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="analytics" size={16} style={{ color: 'var(--brand)' }} />
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Stage performance</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: stageGridTemplate, gap: 10 }}>
            {detail.reviewAnalysis.stageSnapshots.map(stage => {
              const tone = statusTone(stage.status);
              return (
                <div
                  key={stage.key}
                  style={{
                    borderRadius: 14,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    padding: '13px 14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{stage.label}</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '.5px',
                        background: tone.bg,
                        color: tone.fg,
                        border: `1px solid ${tone.border}`,
                        textTransform: 'uppercase',
                      }}
                    >
                      {tone.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{stage.summary}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="target" size={16} style={{ color: 'var(--brand)' }} />
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Conversation metrics</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: stageGridTemplate, gap: 10 }}>
            {detail.reviewAnalysis.metrics.map(metric => (
              <MetricRow key={metric.key} metric={metric} />
            ))}
          </div>
        </div>

        {detail.reviewAnalysis.analysisLimits.length > 0 && (
          <div className="panel" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Icon name="faq" size={16} style={{ color: 'var(--amber)' }} />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Analysis limits</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detail.reviewAnalysis.analysisLimits.map(item => (
                <div key={item} style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        <SectionHeader
          eyebrow="Objections"
          title="Buyer objection map"
          caption="What the buyer pushed on, what the rep asked, and where momentum was either protected or lost."
        />

        <div style={{ display: 'grid', gridTemplateColumns: cardGridTemplate, gap: 16, alignItems: 'start' }}>
          <div className="panel" style={{ padding: '16px 18px', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Icon name="target" size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Buyer objection summary</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-soft)' }}>
              {detail.reviewAnalysis.objections.summary}
            </div>
          </div>

          <div className="panel" style={{ padding: '16px 18px', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="analytics" size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Rep asked…</span>
            </div>
            {detail.reviewAnalysis.objections.repQuestions.length === 0 ? (
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-mute)' }}>
                No clear rep questions were identified in the transcript.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {detail.reviewAnalysis.objections.repQuestions.map(question => (
                  <div key={`${question.turn}:${question.time}`} style={{ padding: '11px 12px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-mute)', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 5 }}>
                      Turn {question.turn} · {question.time}
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{question.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ListCard
            title="Missed opportunities"
            icon="target"
            accent="var(--brand)"
            items={detail.reviewAnalysis.objections.missedOpportunities}
            empty="No missed opportunities were captured for this call."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: cardGridTemplate, gap: 16, alignItems: 'start' }}>
          {detail.reviewAnalysis.objections.moments.map((moment, index) => (
            <div key={`${moment.label}:${index}`} className="panel" style={{ padding: '16px 18px', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{moment.label}</div>
                  {moment.citation?.time && (
                    <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--ink-mute)' }}>
                      Turn {moment.citation.turn} · {moment.citation.time}
                    </div>
                  )}
                </div>
                <span className="pill-neutral">Buyer objection</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', color: 'var(--ink-mute)', textTransform: 'uppercase', marginBottom: 5 }}>
                    Buyer said
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{moment.buyerText}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', color: 'var(--ink-mute)', textTransform: 'uppercase', marginBottom: 5 }}>
                    Rep response
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                    {moment.repText || 'No clear response captured.'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 5 }}>
                    What worked
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{moment.whatWorked}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', color: 'var(--brand)', textTransform: 'uppercase', marginBottom: 5 }}>
                    What was missed
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{moment.whatWasMissed}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
