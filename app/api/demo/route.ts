// TEMPORARY — demo bypass link. Delete this whole directory with lib/demo-access.ts.
//
// GET /api/demo?k=<token> establishes a real NextAuth session for the fixed
// demo identity and drops the visitor on the dashboard. It deliberately reuses
// the normal session path so the BFF proxy, the internal JWT, and the API's
// role derivation all behave exactly as they do for a signed-in rep.
//
// Lives under /api/* so middleware's matcher leaves it unauthenticated.
import { signIn } from "../../../auth";
import { demoDoorReason, verifyDemoToken } from "../../../lib/demo-access";

function isRedirect(err: unknown): boolean {
  return typeof (err as { digest?: unknown })?.digest === "string"
    && ((err as { digest: string }).digest.startsWith("NEXT_REDIRECT"));
}

/** One body for every rejection: a wrong token and a shut door must look
 *  identical from outside, or the response becomes an oracle. */
function denied(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("k");

  if (!verifyDemoToken(token)) {
    console.warn(`[demo] access denied — ${demoDoorReason()}`);
    return denied();
  }

  try {
    await signIn("demo-link", { token, redirectTo: "/" });
  } catch (err) {
    if (isRedirect(err)) throw err; // the successful path: Next performs the redirect
    console.error("[demo] sign-in failed:", err);
    return denied();
  }

  return denied();
}
