import { c, card, label } from "@/lib/ui";
import Chip from "./Chip";
import type { QuickFeedback } from "@/lib/types";

/**
 * Read-only render of the rep-side Quick feedback form:
 * What felt hard? / AI behavior issues / optional note. All fields optional.
 * `feedback` comes from getFeedback() in lib/admin/data.ts, which reads the same
 * rows components/PostCallFeedbackModal.tsx writes — mapping our stored slugs
 * back to these display labels.
 */
export default function FeedbackPanel({ repName, feedback }: { repName: string; feedback: QuickFeedback | null }) {
  if (!feedback || !feedback.submitted) {
    return (
      <section style={{ ...card, padding: "26px 20px", textAlign: "center", borderStyle: "dashed" }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>No quick feedback on this call</div>
        <div style={{ fontSize: 13, color: c.muted, marginTop: 5 }}>{repName} skipped the form — it is optional.</div>
      </section>
    );
  }

  return (
    <section style={{ ...card, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.red} strokeWidth={2} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        <span style={{ fontSize: 16, fontWeight: 750 }}>Quick feedback</span>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: c.faint }}>{repName}</span>
      </div>

      <div style={{ ...label, fontSize: 11, marginTop: 16 }}>What felt hard</div>
      <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {feedback.hard.length ? feedback.hard.map((t) => <Chip key={t} tone="red">{t}</Chip>) : <span style={{ fontSize: 13, color: c.faint }}>Nothing flagged.</span>}
      </div>

      <div style={{ ...label, fontSize: 11, marginTop: 16 }}>AI behavior issues</div>
      <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {feedback.aiIssues.length ? feedback.aiIssues.map((t) => <Chip key={t}>{t}</Chip>) : <span style={{ fontSize: 13, color: c.faint }}>None reported.</span>}
      </div>

      <div style={{ ...label, fontSize: 11, marginTop: 16 }}>Optional note</div>
      <div style={{ marginTop: 9, padding: "12px 14px", border: `1px solid ${c.line}`, borderRadius: 11, background: "#fbfbfc", fontSize: 13.5, lineHeight: 1.6, color: feedback.note ? c.body : c.faint, textWrap: "pretty" }}>
        {feedback.note || "No note left."}
      </div>
    </section>
  );
}
