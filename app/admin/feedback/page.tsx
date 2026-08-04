import Link from "next/link";
import { getFeedbackFeed } from "@/lib/admin/data";
import { c, card, label } from "@/lib/ui";
import Chip from "@/components/Chip";
import StatCard from "@/components/StatCard";

/** Team-wide roll-up of the rep-side Quick feedback form, newest first. */
export default async function FeedbackPage() {
  const feed = await getFeedbackFeed();
  const submitted = feed.filter((f) => f.submitted);
  const top = (key: "hard" | "aiIssues") => {
    const counts: Record<string, number> = {};
    submitted.forEach((f) => f[key].forEach((t) => (counts[t] = (counts[t] ?? 0) + 1)));
    const label = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return { label: label ?? "—", n: label ? counts[label] : 0 };
  };
  const hard = top("hard");
  const ai = top("aiIssues");

  return (
    <>
      <header>
        <h2 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: "-.02em" }}>Rep feedback</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280" }}>
          What reps flagged right after their calls, newest first. Click one to open it next to the scorecard.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {/* `feed` is the newest 25 sessions team-wide, not every session ever — quick
            feedback is only on the per-call detail response, so the feed is bounded.
            See FEEDBACK_FEED_LIMIT in lib/admin/data.ts. */}
        <StatCard title="Submitted" value={submitted.length} sub={`of ${feed.length} recent sessions`} />
        <StatCard title="Hardest, most often" value={hard.label} sub={`picked by ${hard.n} reps`} />
        <StatCard title="Top AI issue" value={ai.label} sub={`flagged on ${ai.n} calls`} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {feed.length === 0 && (
          <div style={{ ...card, padding: "26px 20px", textAlign: "center", borderStyle: "dashed" }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>No feedback yet</div>
            <div style={{ fontSize: 13, color: c.muted, marginTop: 5 }}>Nothing to show until reps finish a roleplay.</div>
          </div>
        )}

        {feed.map((f) => (
          <Link
            key={f.callId}
            href={`/admin/reps/${f.repId}/calls/${f.callId}?tab=feedback`}
            style={{ ...card, padding: "16px 18px", display: "flex", gap: 18, alignItems: "flex-start", textDecoration: "none", color: c.ink }}
          >
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#f0f2f4", color: c.body, fontSize: 12, fontWeight: 750, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{f.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 750 }}>{f.repName}</span>
                <Chip>{f.persona}</Chip>
                <span style={{ fontSize: 12.5, color: c.faint }}>scored {f.score}</span>
              </div>
              {f.submitted && (
                <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {f.hard.map((t) => <Chip key={t} tone="red">{t}</Chip>)}
                  {f.aiIssues.map((t) => <Chip key={t}>{t}</Chip>)}
                </div>
              )}
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: f.submitted && f.note ? c.body : c.faint, marginTop: 9, textWrap: "pretty" }}>
                {f.submitted ? f.note || "No note left." : "Skipped the feedback form."}
              </div>
            </div>
            <div style={{ fontSize: 12, color: c.faint, flex: "none" }}>{f.when}</div>
          </Link>
        ))}
      </section>
    </>
  );
}
