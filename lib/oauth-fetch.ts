// lib/oauth-fetch.ts — bounded, retrying fetch for Auth.js's outbound calls.
//
// WHY THIS EXISTS
//
// The Google provider is `type: "oidc"` with only an `issuer` — it pins no
// endpoints. So @auth/core resolves them from Google's discovery document at
// request time, on BOTH legs:
//
//   authorization-url.js  if (!provider.authorization?.url) -> discoveryRequest()
//   callback/oauth.js     if (!token?.url && !userinfo?.url) -> discoveryRequest()
//
// We pass only `authorization.params`, never a `url`, so every single sign-in
// makes an unpinned GET to accounts.google.com before it can even redirect. That
// call had no timeout and no retry, so one transient DNS or socket failure took
// down the whole sign-in with `TypeError: fetch failed` and bounced the user to
// ?error=Configuration. Observed 2026-08-04.
//
// Pinning the endpoints instead would look tidier and would be wrong: skipping
// discovery leaves the authorization server metadata without `jwks_uri`, and the
// OIDC leg needs it to verify the id_token signature.
//
// So instead we hand @auth/core a fetch that retries and is bounded.
// `customFetch` is its supported hook for this, and lib/utils/providers.js
// copies the symbol onto the normalised provider explicitly (a plain merge would
// drop it).
//
// AGENTS.md invariant 2 — nothing on a user-facing path gets an unbounded
// network call — applies to the sign-in path too, and did not hold here.
import { shouldRetry, type Failure } from './proxy-retry';

// Short: this rides out a blip, it is not a substitute for working DNS.
const RETRY_DELAYS_MS = [300, 900, 2_000];
// Ceiling on ONE attempt. Google's discovery doc answers in ~200-500ms locally.
const ATTEMPT_TIMEOUT_MS = 8_000;

function failureKind(err: unknown): Failure {
  const name = err instanceof Error ? err.name : '';
  // A timeout means WE gave up, so the request may have been processed; a
  // connection error means it never arrived. shouldRetry treats them
  // differently, so the distinction has to survive to there.
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable';
}

/** A body we cannot replay, so an attempt using it must not be retried. */
function isStreamingBody(body: unknown): boolean {
  return typeof body === 'object' && body !== null && typeof (body as ReadableStream).getReader === 'function';
}

/**
 * Drop-in `fetch` for Auth.js. Typed as `typeof fetch` so it stays compatible
 * with what oauth4webapi expects.
 *
 * Retry policy is lib/proxy-retry.ts, unchanged — which is the point. The token
 * exchange is a POST, so it is replayed ONLY when the attempt provably never
 * arrived ('unreachable'). Replaying it after a timeout could spend the
 * authorization code twice and surface as an opaque invalid_grant.
 */
export const resilientOAuthFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase();
  const replayable = !isStreamingBody(init?.body);
  let lastError: unknown;

  for (let attempt = 0; ; attempt++) {
    try {
      // Only supply a deadline when the caller has not — overriding their signal
      // would discard oauth4webapi's own cancellation.
      return await fetch(input, init?.signal ? init : { ...init, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
    } catch (err) {
      lastError = err;
    }

    const failure = failureKind(lastError);
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined || !replayable || !shouldRetry(method, failure)) break;

    console.warn(
      `[auth] ${method} ${String(input)} -> ${failure}; retry ${attempt + 1} in ${delay}ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Out of retries: rethrow the original so Auth.js logs the real cause.
  throw lastError;
};
