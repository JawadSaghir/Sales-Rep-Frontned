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
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': req.headers.get('content-type') ?? 'application/json',
        ...(repName ? { 'x-rep-name': repName } : {}),
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
      cache: 'no-store',
    });
  } catch (err) {
    // Distinguished from the 500 above on purpose: the API being down and the
    // proxy being misconfigured look identical in the browser but need opposite
    // fixes. 502 = "the thing behind me is unreachable".
    console.error(`[bff] upstream unreachable at ${target}:`, message(err));
    return fail(502, `cannot reach the API at ${BACKEND} — is it running?`);
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
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
