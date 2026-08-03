// TEMPORARY — demo bypass link. Delete this file and its four call sites
// (auth.ts, middleware.ts, app/api/demo/route.ts, app/api/backend/[...path]/route.ts)
// once demo access is no longer needed. See DEMO-ACCESS.md.
//
// The identity is a compile-time constant, NOT a secret: the *token* and the
// *deadline* live in env. That split is deliberate — it lets every checkpoint
// ask "is this the demo user?" independently of "is the door open?", so
// deleting DEMO_ACCESS_TOKEN kills sessions that were already issued instead
// of silently downgrading them to ordinary trusted users.

export const DEMO_EMAIL = "demo@insidesuccess.com";
export const DEMO_NAME = "Demo Access";

export function isDemoEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === DEMO_EMAIL;
}

/** Length is not secret; the token body is. Avoids an early-exit char compare. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function deadline(): number | null {
  const raw = process.env.DEMO_ACCESS_EXPIRES?.trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Both env vars must be present and the deadline unpassed. Fails closed. */
export function isDemoDoorOpen(now: number = Date.now()): boolean {
  const token = process.env.DEMO_ACCESS_TOKEN?.trim();
  if (!token || token.length < 24) return false;
  const expires = deadline();
  return expires !== null && now < expires;
}

/** Why the door is shut — for the operator, never shown to the visitor. */
export function demoDoorReason(now: number = Date.now()): string {
  const token = process.env.DEMO_ACCESS_TOKEN?.trim();
  if (!token) return "DEMO_ACCESS_TOKEN is not set";
  if (token.length < 24) return "DEMO_ACCESS_TOKEN is too short to be a real token";
  const expires = deadline();
  if (expires === null) return "DEMO_ACCESS_EXPIRES is missing or not a valid date";
  if (now >= expires) return `demo access expired at ${new Date(expires).toISOString()}`;
  return "open";
}

export function verifyDemoToken(candidate: string | null | undefined): boolean {
  if (!isDemoDoorOpen()) return false;
  const expected = process.env.DEMO_ACCESS_TOKEN?.trim() ?? "";
  return constantTimeEquals(candidate?.trim() ?? "", expected);
}
