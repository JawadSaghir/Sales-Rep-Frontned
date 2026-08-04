import Link from "next/link";
import { getAlerts } from "@/lib/admin/data";
import { c, card, label } from "@/lib/ui";

// The bundle's alerts page, unchanged apart from the data import and the empty
// state. Our getAlerts() derives these from the team rather than a stored table,
// and the thresholds in the copy below are the real ones: WATCH_MIN_AVG = 60 and
// IDLE_WATCH_DAYS = 7 in lib/admin/data.ts.
export default async function AlertsPage() {
  const alerts = await getAlerts();

  return (
    <>
      <header>
        <h2 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: "-.02em" }}>Alerts</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280" }}>
          {alerts.length} open · triggered when a rep drops below 60, goes quiet for a week, or leaves a scorecard unreviewed.
        </p>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {alerts.length === 0 && (
          <div style={{ ...card, padding: "26px 20px", textAlign: "center", borderStyle: "dashed" }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>All clear</div>
            <div style={{ fontSize: 13, color: c.muted, marginTop: 5 }}>
              No rep is below the bar, quiet for a week, or waiting on a scorecard.
            </div>
          </div>
        )}

        {alerts.map((a) => {
          const hot = a.severity === "high";
          const body = (
            <div style={{ ...card, border: `1px solid ${hot ? c.redLine : c.line}`, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: hot ? c.redChipSoft : "#f0f2f4", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={hot ? c.red : c.muted} strokeWidth={2.2} aria-hidden>
                  <path d="M12 3 2 20h20L12 3z" /><path d="M12 9v5" /><path d="M12 17h.01" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ ...label, fontSize: 11, color: hot ? c.redInk : c.muted }}>{a.kind}</div>
                <div style={{ fontSize: 15.5, fontWeight: 750, marginTop: 5 }}>{a.title}</div>
                <div style={{ fontSize: 12.5, color: "#7d8489", marginTop: 3 }}>{a.detail}</div>
              </div>
              <div style={{ fontSize: 12.5, color: c.faint, flex: "none" }}>{a.when}</div>
              <div style={{ display: "flex", alignItems: "center", height: 34, padding: "0 13px", borderRadius: 9, background: c.ink, color: "#fff", fontSize: 13, fontWeight: 700, flex: "none" }}>{a.action}</div>
            </div>
          );
          return a.repId ? (
            <Link key={a.id} href={`/admin/reps/${a.repId}`} style={{ textDecoration: "none", color: c.ink }}>{body}</Link>
          ) : (
            // STUBBED: a bulk review queue. Our only non-rep alert is the eval-failure
            // roll-up, which has no single call to open, so it lands on the feedback
            // feed until a flagged-calls list exists.
            <Link key={a.id} href="/admin/feedback" style={{ textDecoration: "none", color: c.ink }}>{body}</Link>
          );
        })}
      </section>
    </>
  );
}
