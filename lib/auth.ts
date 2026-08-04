// lib/auth.ts — session + admin guard for the admin console.
//
// CONNECT resolved: getSession() reads the real NextAuth session and derives the
// role from the API; requireAdmin() sends reps to our rep home ('/').
//
// The role here is NOT the role the operator picked on the login screen. That
// choice is a routing hint only (see components/LoginPanel.tsx); the effective
// role comes from GET /api/me, which the API derives from ADMIN_EMAILS
// server-side — AGENTS.md invariant 9. A rep who picks "Admin" on the login
// screen gets the admin callbackUrl, lands here, and is redirected straight
// back out.
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth as nextAuthSession } from "@/auth";
import { serverGet } from "@/lib/admin/server-api";
import type { Role } from "./types";

/**
 * Where a signed-in non-admin is sent when they reach an admin route.
 *
 * Back to the sign-in screen WITH a reason, not silently to the rep app. The
 * silent version was actively confusing: an admin whose ADMIN_EMAILS entry was
 * missing in production landed on the rep dashboard with nothing explaining why,
 * and it looked like the console had failed to deploy.
 *
 * The `error` parameter is load-bearing twice over. app/login/page.tsx turns it
 * into the message, and middleware.ts only lets an already-signed-in user stay on
 * a public path when an error is present — without it they would be bounced
 * straight back to `/` and never read this.
 */
export const NO_ADMIN_ACCESS = "/login?error=NotAdmin";

export interface Session {
  userId: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

/** "tobi.adeyemi@insidesuccess.com" -> "Tobi Adeyemi". Mirrors api/routers/admin.py:_label. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .replace(/_/g, ".")
      .split(".")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email
  );
}

/**
 * The signed-in operator, or null when there is no session.
 *
 * Throws if the role lookup itself fails (API asleep, secret misconfigured).
 * That distinction matters: "definitely not an admin" is a redirect, but "could
 * not find out" must not silently demote a real admin to a rep — it surfaces
 * through app/admin/error.tsx instead.
 *
 * cache() keeps the layout and the Sidebar to one /api/me round-trip per request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const session = await nextAuthSession();
  const email = session?.user?.email;
  if (!email) return null;

  const me = await serverGet<{ email: string; is_admin: boolean }>("/api/me");
  const name = session.user?.name?.trim() || nameFromEmail(email);

  return {
    userId: email,
    name,
    initials: initialsOf(name) || email.slice(0, 2).toUpperCase(),
    email,
    role: me.is_admin ? "admin" : "rep",
  };
});

/** Guard for every admin route segment. A non-admin is told why, then sent back. */
export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect(NO_ADMIN_ACCESS);
  return session;
}
