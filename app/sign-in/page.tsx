import { redirect } from 'next/navigation';

// The old sign-in screen. Superseded by /login (the admin console's role-picker
// login), which is now NextAuth's pages.signIn and the middleware's redirect
// target. Kept as a forward rather than deleted so existing bookmarks, the demo
// link and any in-flight OAuth redirect still land somewhere useful — and so
// nobody reaches the retired screen and thinks the new one never shipped.
//
// The previous markup is in git history (see the commit that introduced this
// redirect) along with components/google-sign-in-button.tsx, now unused.
export default function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string | string[]; error?: string | string[] };
}) {
  // Carry the query through so ?error= and ?callbackUrl= keep working.
  const params = new URLSearchParams();
  for (const key of ['callbackUrl', 'error'] as const) {
    const raw = searchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) params.set(key, value);
  }
  const query = params.toString();

  redirect(query ? `/login?${query}` : '/login');
}
