"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { c } from "@/lib/ui";
import type { Session } from "@/lib/auth";

const NAV = [
  { href: "/admin/team", label: "Team overview", icon: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19H2" /></> },
  { href: "/admin/scenarios", label: "Scenarios", icon: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 10h8M8 14h5" /></> },
  { href: "/admin/alerts", label: "Alerts", icon: <><path d="M12 3a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></> },
  { href: "/admin/feedback", label: "Rep feedback", icon: <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" /> },
];

export default function Sidebar({ user, alertCount }: { user: Session; alertCount: number }) {
  const pathname = usePathname();

  return (
    <div
      style={{
        width: 236,
        flex: "none",
        boxSizing: "border-box",
        background: "rgba(14,15,18,.94)",
        backdropFilter: "blur(14px) saturate(120%)",
        WebkitBackdropFilter: "blur(14px) saturate(120%)",
        borderRight: "1px solid rgba(255,255,255,.06)",
        boxShadow: "inset 1px 0 0 rgba(255,255,255,.04), 0 24px 60px -34px rgba(15,17,21,.55)",
        padding: "22px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 26,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        height: "100vh",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13.5, fontWeight: 800, color: "#fff", padding: "0 8px" }}>
        INS<span style={{ width: 2, height: 13, background: c.red, display: "inline-block", margin: "0 1px" }} />DE&nbsp;SUCCESS
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 9,
                textDecoration: "none",
                background: active ? "rgba(255,255,255,.12)" : "transparent",
                color: active ? "#fff" : "#9aa1a9",
                fontSize: 14,
                fontWeight: 650,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? c.red : "#6b7280"} strokeWidth={2} aria-hidden>
                  {item.icon}
                </svg>
                {item.label}
              </span>
              {item.href === "/admin/alerts" && alertCount > 0 && (
                <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 6, background: c.red, color: "#fff", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sign-out repointed: our NextAuth v5 route rejects a bare form POST to
          /api/auth/signout (no csrfToken in the body). signOut() is what the rep
          sidebar already uses (app/page.tsx). */}
      <div style={{ marginTop: "auto" }}>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 12,
            background: "transparent",
            border: "none",
            borderTop: "1px solid rgba(255,255,255,.1)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {user.initials}
          </span>
          <span>
            <span style={{ display: "block", fontSize: 13, fontWeight: 650, color: "#fff" }}>{user.name}</span>
            <span style={{ display: "block", fontSize: 11.5, color: "#8a9099" }}>Admin · sign out</span>
          </span>
        </button>
      </div>
    </div>
  );
}
