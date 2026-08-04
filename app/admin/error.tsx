"use client";

// app/admin/error.tsx — so an asleep API reads as "try again", not a raw 500.
//
// Every admin screen is server-rendered from live API reads, and this API
// cold-starts after an idle gap (memory/api-free-plan-cold-start). Without a
// boundary the first visit after a quiet spell shows Next's unstyled error page.
// It also catches the deliberate throw in lib/auth.ts when the role lookup
// itself fails — "could not verify" must never silently demote an admin.
import { c, card } from "@/lib/ui";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section style={{ ...card, padding: "30px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 750 }}>Couldn&apos;t load this screen</div>
      <div style={{ fontSize: 13.5, color: c.muted, marginTop: 6, lineHeight: 1.6 }}>
        {error.message || "The API did not answer."}
      </div>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 18,
          height: 36,
          padding: "0 16px",
          border: "none",
          borderRadius: 9,
          background: c.red,
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </section>
  );
}
