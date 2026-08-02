# TEMPORARY: demo bypass link

A single URL that signs a visitor straight into the dashboard with no Google
account, for demos and testing. **This is an authentication bypass. It is meant
to be deleted.**

Created 2026-08-02. Deadline set by `DEMO_ACCESS_EXPIRES`.

## How it works

The link does not skip auth — it *enters* it. `/api/demo?k=<token>` verifies the
token and then issues a genuine NextAuth session for one fixed identity,
`demo@insidesuccess.com`. Everything downstream is untouched: the BFF proxy
mints the same 60s internal JWT, FastAPI verifies it normally, and sessions are
attributed to that email in `rep_slug`.

The identity (`DEMO_EMAIL`) is a constant in `lib/demo-access.ts`; the token and
deadline are env vars. That split is what makes revocation work — every
checkpoint can recognise the demo user *independently* of whether the door is
open, so clearing the env var locks out sessions that were already issued
instead of quietly promoting them to ordinary trusted users.

`demo@insidesuccess.com` must never be added to `ADMIN_EMAILS`. Role is derived
API-side from that list alone, so leaving it out is what keeps the demo user a
plain rep.

## Setup

Two env vars on the frontend (Vercel → Settings → Environment Variables). Both
are required; either one missing or a passed deadline shuts the door.

```
DEMO_ACCESS_TOKEN=<32 random bytes, base64url>    # min 24 chars or it is rejected
DEMO_ACCESS_EXPIRES=2026-08-16T00:00:00Z          # ISO 8601
```

Generate a token with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Redeploy after setting them (middleware inlines env at build time — see below).
The link is then:

```
https://<your-vercel-domain>/api/demo?k=<DEMO_ACCESS_TOKEN>
```

Treat that URL as the credential it is: anyone holding it is signed in. Send it
over something private, never in a ticket, commit, or screenshot.

## Killing it early

Delete `DEMO_ACCESS_TOKEN` in Vercel. Data access dies on the next request —
the BFF proxy is a Node function and reads env at request time. Redeploy to
close page access too: middleware runs on the edge, where `process.env` is
inlined at build, so it keeps the old value until the next build.

Until that redeploy the app still renders its shell for a stale cookie, but
every API call 401s, so no data is reachable.

## Deleting it for good

1. `frontend/lib/demo-access.ts` — delete
2. `frontend/app/api/demo/` — delete the directory
3. `frontend/DEMO-ACCESS.md` — delete this file
4. `frontend/auth.ts` — drop the `Credentials` import, the `demo-link` provider,
   and the `isDemoEmail` branch in the `signIn` callback
5. `frontend/middleware.ts` — drop the import and the revocation block
6. `frontend/app/api/backend/[...path]/route.ts` — drop the import and the
   `demo access has ended` line
7. Vercel — remove `DEMO_ACCESS_TOKEN` and `DEMO_ACCESS_EXPIRES`
8. `frontend/.env.local` — remove the same two vars
9. Purge the demo's data: rows in the sessions store with
   `rep_slug = 'demo@insidesuccess.com'`

Every code site carries a `TEMPORARY — demo bypass link` comment, so
`grep -rn "demo bypass link" frontend/` finds the full set.

## Verified behaviour

Tested locally 2026-08-02 against `next dev`:

| Case | Result |
|---|---|
| No session, `GET /` | 307 → `/sign-in` |
| Wrong token | 404 (same body as a shut door — no oracle) |
| Correct token | 307 → `/`, session cookie set |
| Demo session, `GET /` | 200 |
| Demo session, BFF proxy | authenticates, forwards upstream |
| Past deadline, `GET /` | 307 → `/sign-in?error=DemoExpired` |
| Past deadline, BFF proxy | 401 `demo access has ended` |
| Past deadline, fresh link | 404 |
