import Link from "next/link";
import { getTeam, getTeamKpis, getAlerts } from "@/lib/admin/data";
import { c, card, label, statusColors, deltaLabel, deltaColor } from "@/lib/ui";
import StatCard from "@/components/StatCard";

// Every `fr` is wrapped in minmax(0, …) — the header and each row are SEPARATE
// grids, and a bare `1.1fr` floors at min-content, so one wide cell resized that
// row's tracks alone and the row stopped lining up with the header and its
// neighbours. minmax(0, …) removes the content floor, so all rows share
// identical track widths and cells clip or ellipsis instead of pushing.
const GRID =
  "minmax(0,2.1fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,.9fr) minmax(0,1.1fr) 20px";

export default async function TeamPage() {
  const [reps, kpis, alerts] = await Promise.all([getTeam(), getTeamKpis(), getAlerts()]);

  return (
    <>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: "-.02em" }}>Team performance</h2>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280" }}>
            {kpis.repCount} sales reps · {kpis.sessions} sessions scored
          </p>
        </div>
        {/* STUBBED: export endpoint (CSV/PDF of the current filter). */}
        <button style={{ height: 38, padding: "0 16px", border: "none", borderRadius: 9, background: c.red, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
          Export report
        </button>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
        <StatCard title="Sessions" value={kpis.sessions} sub="roleplays completed" delta={`+${kpis.sessionsDelta} wk`} deltaTone="up" />
        <StatCard
          title="Avg score"
          value={kpis.avgScore === null ? "—" : kpis.avgScore}
          sub={kpis.avgScore === null ? "nothing scored yet" : "out of 100"}
          delta={kpis.avgScore === null ? undefined : deltaLabel(kpis.avgDelta)}
          deltaTone="up"
        />
        {/* Objection handling is not aggregated per rep yet — see lib/admin/data.ts. */}
        <StatCard
          title="Objection handling"
          value={kpis.objectionPct === null ? "—" : `${kpis.objectionPct}%`}
          sub={kpis.objectionPct === null ? "not aggregated yet" : "criteria met"}
          delta={kpis.objectionDelta === null ? undefined : deltaLabel(kpis.objectionDelta)}
          deltaTone="down"
        />
        <StatCard
          title="Time practiced"
          value={`${kpis.practicedHours}h`}
          sub={kpis.repCount ? `${(kpis.practicedHours / kpis.repCount).toFixed(1)}h per rep` : "no reps yet"}
          delta="team"
        />
      </section>

      <section style={{ ...card, padding: "16px 18px 18px" }}>
        <Link href="/admin/alerts" style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, textDecoration: "none", color: c.ink }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.red} strokeWidth={2.2} aria-hidden>
            <path d="M12 3 2 20h20L12 3z" />
            <path d="M12 9v5" />
            <path d="M12 17h.01" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 750 }}>Needs your attention</span>
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 650, color: c.redInk }}>View all {alerts.length}</span>
        </Link>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{ border: `1px solid ${a.severity === "high" ? c.redLine : c.line}`, background: a.severity === "high" ? "#fef8f7" : "#f9fafb", borderRadius: 11, padding: "13px 14px" }}>
              <div style={{ ...label, fontSize: 11, color: a.severity === "high" ? c.redInk : c.muted }}>{a.kind}</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 6 }}>{a.title}</div>
              <div style={{ fontSize: 12.5, color: "#7d8489", marginTop: 3 }}>{a.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 12, padding: "11px 18px", background: "#fbfbfc", borderBottom: `1px solid ${c.hairline}`, ...label, fontSize: 11 }}>
          <div>Sales rep</div><div>Sessions</div><div style={{ color: c.redInk }}>Avg score</div><div>Score trend</div>
          <div>Objection handling</div><div>Practiced</div><div>Streak</div><div>Status</div><div />
        </div>

        {reps.map((rep) => {
          const status = statusColors(rep.status);
          const barColor = rep.avg === null ? "#9aa1a9" : rep.avg < 60 ? c.red : rep.avg >= 80 ? c.ink : "#9aa1a9";
          const floor = Math.max(0, Math.min(...rep.series) - 6);
          const span = Math.max(6, Math.max(...rep.series) - floor);
          return (
            <Link
              key={rep.id}
              href={`/admin/reps/${rep.id}`}
              style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: `1px solid #f4f5f7`, textDecoration: "none", color: c.ink }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f0f2f4", color: c.body, fontSize: 11.5, fontWeight: 750, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{rep.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rep.name}</div>
                  {/* rep.team carries the rep's email (no team field exists upstream);
                      an address is one unbreakable token, so it needs to truncate
                      rather than widen the row. */}
                  <div style={{ fontSize: 12, color: c.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rep.team}</div>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 650 }}>{rep.sessions}</div>
              {/* Never scored renders "—", not 0: a rep with only abandoned rooms
                  has no average, and 0 read as "failed everything". */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: rep.avg === null ? c.faint : rep.avg < 60 ? c.red : c.ink }}>
                  {rep.avg === null ? "—" : rep.avg}
                </span>
                {rep.delta !== null && (
                  <span style={{ fontSize: 12, fontWeight: 650, color: deltaColor(rep.delta) }}>{deltaLabel(rep.delta)}</span>
                )}
              </div>
              {/* Bars flex rather than taking a fixed 5px each. series is EVERY
                  scored session (that is what makes avg == mean(series)), so an
                  established rep has 30+ points; at a fixed width they needed
                  ~285px in a ~120px track, which forced the fr column wide and
                  knocked the whole row out of alignment with the header.
                  maxWidth keeps a short series looking exactly as designed. */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: rep.series.length > 16 ? 1 : 3, height: 26, minWidth: 0, overflow: "hidden" }}>
                {rep.series.map((v, i) => (
                  <div key={i} style={{ flex: "1 1 0", minWidth: 1, maxWidth: 5, borderRadius: 2, height: Math.max(4, Math.round(6 + ((v - floor) / span) * 18)), background: barColor }} />
                ))}
              </div>
              {rep.objectionPct === null ? (
                // No per-rep objection aggregate exists upstream. An empty bar at 0%
                // would read as "fails every objection", so show nothing instead.
                <div style={{ fontSize: 12.5, fontWeight: 650, color: c.faint }}>—</div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: "#f0f2f4", overflow: "hidden" }}>
                    <div style={{ height: 5, borderRadius: 3, width: `${rep.objectionPct}%`, background: rep.objectionPct >= 70 ? c.green : rep.objectionPct >= 50 ? "#e0a90f" : c.red }} />
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 650, color: c.body, width: 34 }}>{rep.objectionPct}%</span>
                </div>
              )}
              <div style={{ fontSize: 13.5, color: c.body }}>{rep.practicedHours}h</div>
              <div style={{ fontSize: 13.5, fontWeight: 650 }}>{rep.streakDays ? `${rep.streakDays}d` : "—"}</div>
              <div>
                <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: status.fg, background: status.bg }}>{rep.status}</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c0c5cb" strokeWidth={2.4} aria-hidden><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          );
        })}
      </section>
    </>
  );
}
