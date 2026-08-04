// lib/admin/server-api.ts — how admin Server Components read the API.
//
// The rep-side app reads through lib/api.ts, which fetches the relative URL
// '/api/backend/…'. That works in the browser and nowhere else: a relative URL
// has no origin on the server, so a Server Component cannot use it. The admin
// console is Server Components by design, so it needs its own reader.
//
// This talks to FastAPI directly and mints its own identity token. The BFF
// proxy (app/api/backend/[...path]/route.ts) does the same thing for the
// browser and is deliberately left untouched: it is the single path every rep's
// data already flows through, and it was not worth editing to save ten lines
// here. The cost is that the token contract lives in two places —
// see the NOTE below before changing either.
//
// Server-side only. There is no `server-only` guard because the package is not
// a dependency here; importing this from a Client Component would fail anyway,
// on auth() and on the missing USER_PROXY_SECRET.
import { SignJWT } from 'jose';
import { auth } from '@/auth';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

// NOTE: audience and expiry must stay in step with the minter in
// app/api/backend/[...path]/route.ts — api/user_auth.py verifies both.
const AUDIENCE = 'istv-api';
const TOKEN_TTL = '60s';

// AGENTS.md invariant 2: nothing on a user-facing path gets an unbounded
// network call. Matches the proxy's per-attempt ceiling. No retry loop here —
// an admin page that is slow to load is a far smaller problem than the rep-side
// History poll the proxy's backoff exists for.
const TIMEOUT_MS = 12_000;

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function mintToken(email: string): Promise<string> {
  const secret = process.env.USER_PROXY_SECRET;
  if (!secret) throw new Error('USER_PROXY_SECRET is not configured');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}

/** The signed-in email, or null. Never trusts anything client-supplied. */
export async function currentEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  return typeof email === 'string' && email ? email : null;
}

/**
 * GET an API path (with its /api prefix) as the signed-in user and unwrap the
 * envelope. Throws on every failure mode with a message worth reading — the
 * callers in lib/admin/data.ts decide what degrades and what propagates.
 */
export async function serverGet<T>(path: string): Promise<T> {
  const email = await currentEmail();
  if (!email) throw new Error('not signed in');

  const token = await mintToken(email);
  let res: Response;
  try {
    res = await fetch(`${BACKEND}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(`the API did not respond within ${TIMEOUT_MS / 1000}s — it may be waking up`);
    }
    throw new Error(`cannot reach the API at ${BACKEND}`);
  }

  // Render's edge serves 502/503 as an HTML page. Calling res.json() on that
  // raises a SyntaxError and buries the real cause — the same trap the BFF
  // proxy documents.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error(
      res.status === 503
        ? 'the API is starting up — give it a few seconds and try again'
        : `the API returned ${res.status}`,
    );
  }

  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `request failed: ${path}`);
  }
  return body.data;
}
