"use client";

import Link from "next/link";
import { c } from "@/lib/ui";

export default function CallTabs({ repId, callId, active }: { repId: string; callId: string; active: "review" | "feedback" }) {
  const tabs = [
    { key: "review", label: "Post-call review", href: `/admin/reps/${repId}/calls/${callId}` },
    { key: "feedback", label: "Rep feedback", href: `/admin/reps/${repId}/calls/${callId}?tab=feedback` },
  ] as const;

  return (
    <div style={{ display: "flex", gap: 4, padding: 4, background: "#f2f4f6", border: "1px solid #e9ebee", borderRadius: 10 }}>
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "9px 10px",
              borderRadius: 7,
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
              background: on ? "#fff" : "transparent",
              color: on ? c.ink : "#6b7280",
              border: `1px solid ${on ? "#e3e6ea" : "transparent"}`,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
