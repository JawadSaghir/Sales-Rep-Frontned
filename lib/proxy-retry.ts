// lib/proxy-retry.ts — when the BFF proxy may replay an upstream attempt.
//
// Deliberately import-free and side-effect-free so it can be exercised directly
// (the app has no frontend test runner; scratchpad/check-retry.mjs imports this
// module and walks a truth table). Used by app/api/backend/[...path]/route.ts.

/** What one upstream attempt did, when it did not return a usable response. */
export type Failure = 'unreachable' | 'timeout';

/** Whether a failed upstream attempt is safe AND worth replaying.
 *
 *  The distinction that matters is whether the request can have been PROCESSED,
 *  because POST /api/sessions has a side effect: a replay mints a second LiveKit
 *  room and a second session row.
 *
 *    'unreachable'  fetch threw a connection error — nothing was listening, so
 *                   it never arrived. Safe to replay for any method.
 *    503            Render's edge answers this when no instance is ready, so it
 *                   never reached FastAPI either. Safe for any method.
 *    'timeout'      WE gave up. The API may well have received and processed the
 *                   request already, so this is ambiguous — idempotent only.
 *    502 / 504      The gateway gave up, possibly AFTER the app processed it.
 *                   Also ambiguous — idempotent only.
 *
 *  Anything else (2xx, 4xx, or a 5xx from the app itself) is a real answer and
 *  must be surfaced rather than retried. */
export function shouldRetry(method: string, outcome: number | Failure): boolean {
  if (outcome === 'unreachable' || outcome === 503) return true;
  const idempotent = method === 'GET' || method === 'HEAD';
  if (outcome === 'timeout') return idempotent;
  return idempotent && (outcome === 502 || outcome === 504);
}
