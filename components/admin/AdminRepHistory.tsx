"use client";

// Mounts our existing Roleplay History inside the admin rep detail page.
// Nothing is rebuilt here: components/HistoryList.tsx renders the score ring,
// persona, call type, difficulty, verdict and date already, and it already
// accepts a repSlug for exactly this drill-in.
//
// Read-only comes from omitting onStart, which hides "Start a roleplay" —
// admins do not launch calls as a rep.
//
// Rows navigate with router.push rather than being anchors: HistoryList's rows
// are `.session-row` buttons, and turning them into <a> tags would mean
// restyling a rep-side component.
import { useRouter } from "next/navigation";
import { HistoryList } from "@/components/HistoryList";

export default function AdminRepHistory({
  repId,
  repSlug,
}: {
  /** base64url rep id, for building admin URLs. */
  repId: string;
  /** The rep's email, which is what GET /api/sessions?rep_slug= expects. */
  repSlug: string;
}) {
  const router = useRouter();

  return (
    <HistoryList
      repSlug={repSlug}
      onOpen={(callId) => router.push(`/admin/reps/${repId}/calls/${callId}`)}
    />
  );
}
