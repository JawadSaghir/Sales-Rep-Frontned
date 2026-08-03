// frontend/app/api/backend/[...path]/route.ts
// BFF proxy: verifies the NextAuth session, mints the 60s internal JWT
// (identity only — role is derived by the API from ADMIN_EMAILS), forwards
// to FastAPI. The browser never talks to FastAPI directly.
import { SignJWT } from 'jose';
import { auth } from '../../../../auth';
import { shouldRetry, type Failure } from '../../../../lib/proxy-retry';
// TEMPORARY — demo bypass link. Remove with lib/demo-access.ts.
import { isDemoDoorOpen, isDemoEmail } from '../../../../lib/demo-access';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';
const AUDIENCE = 'istv-api';

// Backoff for an API that is asleep or mid-redeploy. Deliberately short: this
// rides out a restart blip, it does NOT cover a full free-plan cold start
// (30-60s) — only taking the API off `plan: free` does that.
const RETRY_DELAYS_MS = [400, 1_200, 2_500];

// Hard ceiling on ONE upstream attempt. Without this the fetch has no timeout at
// all, and Render's edge HOLDS a request open while a free instance spins up —
// so on 2026-08-03 `GET /api/sessions` hung until Vercel killed the invocation
// at 300s ("Vercel Runtime Timeout Error"), four times in eight minutes. History
// polls every 4s, so each poll stacked another 300s invocation. Same rule as
// psycopg's connect_timeout in api/db.py (AGENTS.md invariant 2): nothing on a
// user-facing path gets an unbounded network call.
const ATTEMPT_TIMEOUT_MS = 12_000;
// Ceiling on all attempts together, so the rep gets a readable error in seconds
// rather than minutes. Well inside Vercel's 300s function limit.
const TOTAL_DEADLINE_MS = 30_000;

function displayName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
}

async function mintToken(email: string): Promise<string> {
  const secret = process.env.USER_PROXY_SECRET;
  if (!secret) throw new Error('USER_PROXY_SECRET is not configured');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(new TextEncoder().encode(secret));
}

/** Every response this route returns MUST be the ApiResponse envelope, because
 *  lib/api.ts parses the body as JSON unconditionally. An uncaught throw here
 *  yields Next's own 500 page, whose body is not JSON — so res.json() raises a
 *  SyntaxError and the browser shows a parse failure instead of the real cause.
 *  A misconfiguration has to arrive readable, the same reason CORS wraps the
 *  API's 401s (api/main.py). */
function fail(status: number, error: string): Response {
  return Response.json({ success: false, data: null, error }, { status });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function proxy(req: Request, params: { path: string[] }): Promise<Response> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return fail(401, 'signed out');
  // The real kill switch. This route reads env at request time (Node runtime),
  // so clearing DEMO_ACCESS_TOKEN cuts off data access immediately — unlike
  // middleware, whose env is inlined into the edge bundle at build time.
  if (isDemoEmail(email) && !isDemoDoorOpen()) return fail(401, 'demo access has ended');
  const repName = displayName(session?.user?.name);

  let token: string;
  try {
    token = await mintToken(email);
  } catch (err) {
    // Server-side misconfiguration (missing or unusable USER_PROXY_SECRET), not
    // an upstream problem — 500, and say so in the terminal too.
    console.error('[bff] cannot mint internal token:', message(err));
    return fail(500, message(err));
  }

  const url = new URL(req.url);
  const target = `${BACKEND}/api/${params.path.join('/')}${url.search}`;
  const method = req.method;
  const idempotent = method === 'GET' || method === 'HEAD';
  // Read the body ONCE, before the retry loop: a Request body is a stream and
  // cannot be consumed twice, so this cannot live in the fetch options.
  const body = idempotent ? undefined : await req.text();

  const started = Date.now();
  let upstream: Response | null = null;
  let failure: Failure = 'unreachable';
  let lastErr = '';

  for (let attempt = 0; ; attempt++) {
    upstream = null;
    try {
      upstream = await fetch(target, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': req.headers.get('content-type') ?? 'application/json',
          ...(repName ? { 'x-rep-name': repName } : {}),
        },
        body,
        cache: 'no-store',
        // The whole point: bound the attempt. See ATTEMPT_TIMEOUT_MS.
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      // A timeout means WE gave up, so the API may have processed the request
      // anyway; a connection error means it never arrived. shouldRetry treats
      // those differently, so the distinction has to survive to there.
      const name = err instanceof Error ? err.name : '';
      failure = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable';
      lastErr = `${failure}: ${message(err)}`;
    }

    const outcome: number | Failure = upstream === null ? failure : upstream.status;
    const delay = RETRY_DELAYS_MS[attempt];
    if (!shouldRetry(method, outcome)) break;
    if (delay === undefined) break;
    // Leave room for the replay itself, so we never blow the total deadline.
    if (Date.now() - started + delay + ATTEMPT_TIMEOUT_MS > TOTAL_DEADLINE_MS) break;

    console.warn(`[bff] ${method} ${target} -> ${outcome}; retry ${attempt + 1} in ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  if (upstream === null) {
    // Distinguished from the 500 above on purpose: the API being down and the
    // proxy being misconfigured look identical in the browser but need opposite
    // fixes. 502 = "the thing behind me is unreachable".
    console.error(`[bff] ${method} ${target} failed after ${Date.now() - started}ms:`, lastErr);
    return failure === 'timeout'
      ? fail(504, 'the API did not respond in time — it may be waking up, try again in a moment')
      : fail(502, `cannot reach the API at ${BACKEND} — it may still be waking up`);
  }

  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    // Render's edge serves 502/503 as an HTML page. Passing that through breaks
    // the envelope contract above: lib/api.ts calls res.json() unconditionally,
    // so the rep would see a SyntaxError instead of the real cause.
    console.error(`[bff] non-JSON ${upstream.status} from ${target}`);
    return fail(
      upstream.status,
      upstream.status === 503
        ? 'the API is starting up — give it a few seconds and try again'
        : `the API returned ${upstream.status}`,
    );
  }

  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}

// Next 14 route handlers receive `params` synchronously (not a Promise, as
// in Next 15) — this project pins next@^14.2.0, so no `await ctx.params`.
export async function GET(req: Request, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params);
}
export async function POST(req: Request, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params);
}
export async function DELETE(req: Request, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params);
}
