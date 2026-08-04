import Link from "next/link";
import { getRep, getScorecard, getFeedback } from "@/lib/admin/data";
import { c, card } from "@/lib/ui";
import FeedbackPanel from "@/components/FeedbackPanel";
import CallTabs from "@/components/CallTabs";
import AdminCallReview from "@/components/admin/AdminCallReview";

/**
 * Admin view of a single call. Nothing here is rebuilt: the transcript +
 * scorecard screen already exists on the rep side and is mounted read-only,
 * with the Feedback tab beside it.
 *
 * next@14 hands `params` and `searchParams` synchronously — the bundle was
 * written against Next 15, where both are Promises.
 */
export default async function CallReviewPage({
  params,
  searchParams,
}: {
  params: { repId: string; callId: string };
  searchParams: { tab?: string };
}) {
  const { repId, callId } = params;
  const { tab } = searchParams;
  const [rep, scorecard, feedback] = await Promise.all([
    getRep(repId),
    getScorecard(callId),
    getFeedback(callId),
  ]);
  const active = tab === "feedback" ? "feedback" : "review";

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Link href={`/admin/reps/${repId}`} style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", border: "1px solid #e9ebee", borderRadius: 9, background: "#fff", fontSize: 13, fontWeight: 650, color: c.body, textDecoration: "none" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2.6} aria-hidden><path d="M14 6l-6 6 6 6" /></svg>
          {rep?.name ?? "Back"}
        </Link>
        {scorecard && (
          <span style={{ fontSize: 13, color: c.muted }}>{scorecard.total}</span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {/* STUBBED: per-call export. */}
          <button style={{ height: 36, padding: "0 14px", border: `1px solid ${c.border}`, borderRadius: 9, background: "#fff", fontSize: 13.5, fontWeight: 650, cursor: "pointer" }}>Export</button>
          {/* STUBBED: coaching-note composer. Needs a notes endpoint. */}
          <button style={{ height: 36, padding: "0 15px", border: "none", borderRadius: 9, background: c.red, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Send coaching note</button>
        </div>
      </header>

      <CallTabs repId={repId} callId={callId} active={active} />

      {active === "review" ? (
        // TRANSCRIPT + SCORECARD — our existing rep-side review screen, read-only.
        // It renders the audio player, transcript, post-call summary, what went
        // well / what to improve, and the detailed scorecard.
        // SessionDetail's root is height:100% and owns its own internal
        // scrolling, so it needs a definite height to lay out against: an
        // auto-height parent collapses its transcript/scorecard split.
        //
        // Block, NOT flex. As a flex item its root sized to its content, so the
        // width it measures for itself came out under SPLIT_BREAKPOINT (872px)
        // and it fell back to the stacked layout — transcript above, review
        // below, needing 760px of height inside a ~700px card. As a block child
        // it fills the card's width and splits side by side as intended.
        <section
          style={{
            ...card,
            overflow: "hidden",
            height: "calc(100vh - 190px)",
            minHeight: 560,
          }}
        >
          <AdminCallReview repId={repId} callId={callId} />
        </section>
      ) : (
        <FeedbackPanel repName={rep?.name ?? ""} feedback={feedback} />
      )}
    </>
  );
}
