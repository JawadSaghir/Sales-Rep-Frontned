"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { c } from "@/lib/ui";
import type { Role } from "@/lib/types";
import GoogleMark from "./GoogleMark";

/** How long the remembered role choice sticks around. */
const ROLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const hero = {
  admin: {
    image: "/login-admin.png",
    scrim:
      "linear-gradient(180deg, rgba(10,11,13,.55) 0%, rgba(10,11,13,.15) 45%, rgba(10,11,13,.45) 100%)",
    fg: "#ffffff",
    muted: "rgba(255,255,255,.72)",
    accent: "#ff9d92",
    title: "Reps rehearse the call. You see the tape.",
    body: "Scored roleplays, transcripts and coaching notes for every rep on your team.",
    stats: [
      ["24", "reps onboarded"],
      ["640", "sessions scored"],
    ],
    hint: "Admin access is granted by your workspace owner",
  },
  rep: {
    image: "/login-rep.png",
    scrim:
      "linear-gradient(180deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,.2) 45%, rgba(255,255,255,.45) 100%)",
    fg: "#14161a",
    muted: "rgba(20,22,26,.68)",
    accent: c.redInk,
    title: "Practise the call before it costs you the deal.",
    body: "Run a mock call, get a scorecard in seconds, and see exactly which moment cost you points.",
    stats: [
      ["27", "sessions this month"],
      ["4", "personas to practise"],
    ],
    hint: "Use your company Google account",
  },
} as const;

export default function LoginPanel({
  initialRole = "admin",
  callbackUrl,
  errorMessage,
}: {
  initialRole?: Role;
  /** Where the operator was headed before being bounced here, if anywhere. */
  callbackUrl?: string;
  errorMessage?: string;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const h = hero[role];

  function startSignIn() {
    // The choice is persisted so returning to /login preselects it — app/login/page.tsx
    // reads this cookie server-side and passes it back as initialRole.
    //
    // It is a routing hint and nothing more. It CANNOT grant admin: the effective
    // role comes from GET /api/me, which the API derives from ADMIN_EMAILS
    // (AGENTS.md invariant 9). A rep who picks "Admin" gets sent to /admin/team,
    // where requireAdmin() bounces them straight back to the rep app.
    document.cookie = `istv_role_choice=${role}; path=/; max-age=${ROLE_COOKIE_MAX_AGE}; samesite=lax`;
    // A callbackUrl means middleware bounced them off a specific page — send them
    // back there rather than to the role's landing screen. Validated server-side
    // in app/login/page.tsx.
    void signIn("google", {
      callbackUrl: callbackUrl ?? (role === "admin" ? "/admin/team" : "/"),
    });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 1040,
          background: "#fff",
          border: `1px solid ${c.line}`,
          borderRadius: 18,
          boxShadow: "0 30px 70px -40px rgba(15,17,21,.45)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <div
          style={{
            position: "relative",
            minHeight: 600,
            padding: 44,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundImage: `url(${h.image})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: h.scrim }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 1, fontSize: 15, fontWeight: 800, color: h.fg }}>
            INS<span style={{ width: 2, height: 15, background: c.red, display: "inline-block", margin: "0 1px" }} />DE&nbsp;SUCCESS
          </div>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: h.accent }}>AI Mock Calls</div>
            <div style={{ fontSize: 34, lineHeight: 1.16, fontWeight: 800, letterSpacing: "-.025em", color: h.fg, textWrap: "pretty" }}>{h.title}</div>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: h.muted, maxWidth: 330, textWrap: "pretty" }}>{h.body}</div>
          </div>
          <div style={{ position: "relative", display: "flex", gap: 34 }}>
            {h.stats.map(([n, l]) => (
              <div key={l}>
                <div style={{ fontSize: 22, fontWeight: 800, color: h.fg }}>{n}</div>
                <div style={{ fontSize: 12, color: h.muted }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "44px 46px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Sign in</h1>
            <p style={{ margin: "8px 0 0", fontSize: 15, color: "#6b7280" }}>Pick your role to continue.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RoleCard
              selected={role === "rep"}
              onSelect={() => setRole("rep")}
              title="Sales Rep"
              body="Run roleplays and review your own scorecards."
              icon={
                <>
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
                </>
              }
            />
            <RoleCard
              selected={role === "admin"}
              onSelect={() => setRole("admin")}
              title="Admin"
              body="Track rep performance, review calls, assign scenarios."
              icon={
                <>
                  <path d="M4 19V9" />
                  <path d="M10 19V5" />
                  <path d="M16 19v-7" />
                  <path d="M22 19H2" />
                </>
              }
            />
          </div>

          <button
            onClick={startSignIn}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              height: 52,
              border: "none",
              borderRadius: 11,
              background: c.ink,
              cursor: "pointer",
            }}
          >
            <GoogleMark />
            <span style={{ fontSize: 15.5, fontWeight: 700, color: "#fff" }}>Continue with Google</span>
          </button>

          {/* The hint slot doubles as the error slot: /login is now NextAuth's
              pages.error target, and a rejected domain has to say so — that
              message used to live on /sign-in. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: errorMessage ? c.redInk : "#9aa1a9", fontSize: 13, textAlign: "center", textWrap: "pretty" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={errorMessage ? c.redInk : "#9aa1a9"} strokeWidth={2.2} aria-hidden style={{ flex: "none" }}>
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>{errorMessage ?? h.hint}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  selected,
  onSelect,
  title,
  body,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "16px 18px",
        border: `1.5px solid ${selected ? c.red : "#e9ebee"}`,
        borderRadius: 13,
        background: selected ? c.redSoft : "#fff",
        cursor: "pointer",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: selected ? "#fde9e5" : "#f2f4f6", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={selected ? c.red : "#6b7280"} strokeWidth={2} aria-hidden>
          {icon}
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#7d8489", marginTop: 2 }}>{body}</div>
      </div>
      <div
        style={{
          width: 19,
          height: 19,
          borderRadius: "50%",
          border: `1.5px solid ${selected ? c.red : "#d5d9de"}`,
          background: selected ? c.red : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
          marginTop: 2,
        }}
      >
        {selected && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} aria-hidden>
            <path d="M20 6.5 9.5 17.5 4 12" />
          </svg>
        )}
      </div>
    </div>
  );
}
