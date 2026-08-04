// lib/admin/rep-id.ts — URL-safe rep identifiers.
//
// A rep's canonical key is their email (AGENTS.md invariant 9: rep_slug holds
// the email, the display name is derived and never a key). Emails cannot go
// into a route segment verbatim, and not because of the "@":
//
//   middleware.ts matcher: /((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)
//                                                                  ^^^^^^^^
// That clause skips any path containing a dot, so /admin/reps/a.b@c.com would
// never run middleware at all. requireAdmin() in app/admin/layout.tsx is the
// real gate so nothing was ever exposed, but a route that silently opts out of
// the auth middleware is not a thing to leave lying around.
//
// base64url keeps the id dot-free, reversible, and visible to middleware.

/**
 * Anything we are willing to hand to ?rep_slug=. An email in practice, but
 * api/routers/admin.py groups sessions with no rep_slug under the literal key
 * "unknown", and that row has to stay clickable — so this is a conservative
 * charset check rather than a strict email match. It rejects whitespace, control
 * characters, slashes and anything else that has no business in a query value.
 */
const SAFE_REP_KEY = /^[A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+)?$/;
const MAX_REP_KEY_LENGTH = 254;

export function encodeRepId(repKey: string): string {
  return Buffer.from(repKey, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Reverse of encodeRepId. Returns null for anything that does not decode to a
 * plausible rep key — a bad id should 404, never reach the API as a query
 * parameter.
 */
export function decodeRepId(repId: string): string | null {
  try {
    const base64 = repId.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    if (decoded.length === 0 || decoded.length > MAX_REP_KEY_LENGTH) return null;
    return SAFE_REP_KEY.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
