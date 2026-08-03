// frontend/app/api/backend/[...path]/route.ts
// BFF proxy: verifies the NextAuth session, mints the 60s internal JWT
// (identity only — role is derived by the API from ADMIN_EMAILS), forwards
// to FastAPI. The browser never talks to FastAPI directly.
import { SignJWT } from 'jose';
import { auth } from '../../../../auth';
// TEMPORARY — demo bypass link. Remove with lib/demo-access.ts.
import { isDemoDoorOpen, isDemoEmail } from '../../../../lib/demo-access';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';
const AUDIENCE = 'istv-api';

// Backoff for an API that is asleep or mid-redeploy. Deliberately short: this
// rides out a restart blip, it does NOT cover a full free-plan cold start
// (30-60s) — only taking the API off `plan: free` does that.
const RETRY_DELAYS_MS = [400, 1_200, 2_500];
// Vercel's default function ceiling is 10s. Stop well short so a slow upstream
// yields our own JSON error rather than the platform's timeout page, which
// would break the envelope contract described above.
const RETRY_BUDGET_MS = 6_000;

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

/** Whether a failed upstream attempt is safe AND worth replaying.
 *
 *  `status === null` means fetch threw, i.e. nothing was listening — the request
 *  never reached FastAPI. Render's edge answers 503 when no instance is ready,
 *  which likewise means it never arrived. Neither can have had a side effect, so
 *  replaying is safe even for POST /api/sessions, where a duplicate would mint a
 *  second LiveKit room and a second session row.
 *
 *  A 502/504 *status* is the ambiguous case: the gateway may have given up AFTER
 *  the app processed the request. Those are replayed only for GET/HEAD, where a
 *  duplicate costs nothing. Everything else (4xx, 5xx from the app itself) is a
 *  real answer and must be surfaced, not retried.
 *
 *  Exported for verification: this file has no unit-test runner, so the truth
 *  table is checked directly against this function. */
export function shouldRetry(method: string, status: number | null): boolean {
  if (status === null || status === 503) return true;
  const idempotent = method === 'GET' || method === 'HEAD';
  return idempotent && (status === 502 || status === 504);
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
      });
    } catch (err) {
      lastErr = message(err);
    }

    const delay = RETRY_DELAYS_MS[attempt];
    if (!shouldRetry(method, upstream === null ? null : upstream.status)) break;
    if (delay === undefined || Date.now() - started + delay > RETRY_BUDGET_MS) break;

    console.warn(
      `[bff] ${method} ${target} unavailable (${upstream ? upstream.status : lastErr}); ` +
        `retry ${attempt + 1} in ${delay}ms`,
    );
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  if (upstream === null) {
    // Distinguished from the 500 above on purpose: the API being down and the
    // proxy being misconfigured look identical in the browser but need opposite
    // fixes. 502 = "the thing behind me is unreachable".
    console.error(`[bff] upstream unreachable at ${target}:`, lastErr);
    return fail(502, `cannot reach the API at ${BACKEND} — it may still be waking up`);
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
