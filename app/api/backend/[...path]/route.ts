// frontend/app/api/backend/[...path]/route.ts
// BFF proxy: verifies the NextAuth session, mints the 60s internal JWT
// (identity only — role is derived by the API from ADMIN_EMAILS), forwards
// to FastAPI. The browser never talks to FastAPI directly.
import { SignJWT } from 'jose';
import { auth } from '../../../../auth';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';
const AUDIENCE = 'istv-api';

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

async function proxy(req: Request, params: { path: string[] }): Promise<Response> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ success: false, data: null, error: 'signed out' }, { status: 401 });
  const url = new URL(req.url);
  const target = `${BACKEND}/api/${params.path.join('/')}${url.search}`;
  const upstream = await fetch(target, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${await mintToken(email)}`,
      'content-type': req.headers.get('content-type') ?? 'application/json',
    },
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    cache: 'no-store',
  });
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
