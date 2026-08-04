import Link from "next/link";
import { notFound } from "next/navigation";
import { getRep, repKeyOf } from "@/lib/admin/data";
import { c, card, label, statusColors, activityLabel, deltaLabel, deltaColor } from "@/lib/ui";
import TrendChart from "@/components/TrendChart";
import AdminRepHistory from "@/components/admin/AdminRepHistory";

// next@14 hands `params` synchronously. The bundle was written against Next 15,
// where it is a Promise that has to be awaited.
export default async function RepPage({ params }: { params: { repId: string } }) {
  const { repId } = params;
  const rep = await getRep(repId);
  const repKey = repKeyOf(repId);
  if (!rep || !repKey) notFound();
  const status = statusColors(rep.status);

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Link href="/admin/team" style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", border: `1px solid #e9ebee`, borderRadius: 9, background: "#fff", fontSize: 13, fontWeight: 650, color: c.body, textDecoration: "none" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2.6} aria-hidden><path d="M14 6l-6 6 6 6" /></svg>
          Team overview
        </Link>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f0f2f4", color: c.body, fontSize: 14, fontWeight: 750, display: "flex", alignItems: "center", justifyContent: "center" }}>{rep.initials}</div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.02em" }}>{rep.name}</span>
            <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: status.fg, background: status.bg }}>{rep.status}</span>
          </div>
          <div style={{ fontSize: 13, color: c.muted, marginTop: 3 }}>{rep.team} · {activityLabel(rep.idleDays)}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {/* STUBBED: assign-scenario action. Needs an assignment endpoint — the schema has no assignment model. */}
          <button style={{ height: 36, padding: "0 14px", border: `1px solid ${c.border}`, borderRadius: 9, background: "#fff", fontSize: 13.5, fontWeight: 650, cursor: "pointer" }}>Assign scenario</button>
          {/* STUBBED: coaching-note composer. Needs a notes endpoint. */}
          <button style={{ height: 36, padding: "0 15px", border: "none", borderRadius: 9, background: c.red, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Send coaching note</button>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Kpi title="Sessions" value={rep.sessions} />
        {/* null = never scored, so "—" rather than a 0 that reads as a failure. */}
        <Kpi
          title="Avg score"
          value={rep.avg === null ? "—" : rep.avg}
          sub={rep.delta === null ? (rep.avg === null ? "nothing scored yet" : undefined) : deltaLabel(rep.delta)}
          subColor={rep.delta === null ? undefined : deltaColor(rep.delta)}
        />
        {/* objectionPct stays null until the API exposes a per-rep aggregate. */}
        <Kpi
          title="Objection handling"
          value={rep.objectionPct === null ? "—" : `${rep.objectionPct}%`}
          sub={rep.objectionPct === null ? "not aggregated yet" : "criteria met"}
        />
        <Kpi title="Practiced" value={`${rep.practicedHours}h`} />
        <Kpi title="Streak" value={rep.streakDays ? `${rep.streakDays}d` : "—"} />
      </section>

      <section style={{ ...card, padding: "16px 18px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14.5, fontWeight: 750 }}>Score trend</span>
          <span style={{ fontSize: 12.5, color: c.muted }}>last {rep.series.length} sessions, oldest first</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <TrendChart series={rep.series} />
        </div>
      </section>

      {/*
        ALL CALLS — our existing rep-side Roleplay History, scoped to this rep and
        read-only (no "Start a roleplay"). Each row opens
        /admin/reps/{repId}/calls/{callId}. Nothing rebuilt here.
      */}
      <section style={{ ...card, overflow: "hidden" }}>
        <AdminRepHistory repId={rep.id} repSlug={repKey} />
      </section>
    </>
  );
}

function Kpi({ title, value, sub, subColor }: { title: string; value: string | number; sub?: string; subColor?: string }) {
  return (
    <div style={{ ...card, padding: "15px 16px" }}>
      <div style={{ ...label, fontSize: 11 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 700, color: subColor ?? c.muted }}>{sub}</div>}
    </div>
  );
}
