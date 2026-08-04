import Link from "next/link";
import { getScenarios } from "@/lib/admin/data";
import { c, card, label } from "@/lib/ui";
import Chip from "@/components/Chip";

export default async function ScenariosPage() {
  const scenarios = await getScenarios();

  return (
    <>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: "-.02em" }}>Scenarios &amp; assignments</h2>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280" }}>Assign personas and call types, then watch completion.</p>
        </div>
        {/* STUBBED: scenario builder. The rep app's persona form is client-side inside
            components/RoleplaySetup.tsx and is not extractable as-is; wiring this needs
            either that form lifted into its own component or a POST /api/personas form here. */}
        <button style={{ height: 38, padding: "0 15px", border: "none", borderRadius: 9, background: c.red, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>New scenario</button>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {scenarios.length === 0 && (
          <div style={{ ...card, padding: "26px 20px", textAlign: "center", borderStyle: "dashed" }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>No scenarios yet</div>
            <div style={{ fontSize: 13, color: c.muted, marginTop: 5 }}>Personas and call types will appear here once the catalog loads.</div>
          </div>
        )}

        {scenarios.map((s) => {
          const pct = s.assignedTo ? Math.round((s.completed / s.assignedTo) * 100) : 0;
          const tone = pct >= 70 ? c.green : pct >= 40 ? "#e0a90f" : c.red;
          return (
            <div key={s.id} style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 750 }}>{s.name}</span>
                    <Chip tone="red">{s.type}</Chip>
                    <Chip>{s.difficulty}</Chip>
                  </div>
                  <div style={{ fontSize: 12.5, color: c.muted, marginTop: 5 }}>
                    Persona: {s.persona} · assigned to {s.assignedTo} reps
                  </div>
                </div>
                <div style={{ width: 200, flex: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 650, color: c.body, marginBottom: 6 }}>
                    <span>{s.completed} of {s.assignedTo} done</span>
                    <span style={{ color: c.muted }}>avg {s.avg}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "#f0f2f4", overflow: "hidden" }}>
                    <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: tone }} />
                  </div>
                </div>
                {/* STUBBED: assignment POST. No assignment model exists in the schema yet,
                    which is why the counts above are zero rather than placeholder. */}
                <button style={{ height: 34, padding: "0 13px", border: `1px solid ${c.border}`, borderRadius: 9, background: "#fff", fontSize: 13, fontWeight: 650, cursor: "pointer", flex: "none" }}>Assign</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                {s.assignees.map((a) => (
                  <Link key={a.repId} href={`/admin/reps/${a.repId}`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", border: `1px solid ${c.line}`, borderRadius: 11, textDecoration: "none", color: c.ink }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#f0f2f4", color: c.body, fontSize: 11, fontWeight: 750, display: "flex", alignItems: "center", justifyContent: "center" }}>{a.initials}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: c.muted }}>{a.state}</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: a.score == null ? "#c0c5cb" : a.score >= 80 ? c.greenInk : c.ink }}>{a.score ?? "—"}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
