"use client";

// Mounts our existing scorecard + transcript review screen in the admin call
// review tab. components/SessionDetail.tsx already renders the audio player,
// transcript, post-call summary, what-went-well / what-to-improve and the
// detailed scorecard — and it already has a read-only feedback mode, which
// the current /admin page uses. So there is nothing to build.
import { useRouter } from "next/navigation";
import { SessionDetail } from "@/components/SessionDetail";

export default function AdminCallReview({
  repId,
  callId,
}: {
  repId: string;
  callId: string;
}) {
  const router = useRouter();
  // An admin has nowhere to "retry" a call to, so both exits go back to the rep.
  const backToRep = () => router.push(`/admin/reps/${repId}`);

  return (
    <SessionDetail
      id={callId}
      onBack={backToRep}
      onRetry={backToRep}
      feedbackMode="readonly"
      readOnly
    />
  );
}
