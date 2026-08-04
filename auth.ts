import NextAuth, { customFetch } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { isAllowedAuthEmail, normalizeAuthEmail } from "./lib/auth-utils";
import { resilientOAuthFetch } from "./lib/oauth-fetch";
// TEMPORARY — demo bypass link. Remove with lib/demo-access.ts.
import { DEMO_EMAIL, DEMO_NAME, isDemoEmail, verifyDemoToken } from "./lib/demo-access";

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  pages: {
    // The admin console's login screen replaced /sign-in. The old page is still
    // on disk and still public in middleware.ts, just no longer referenced.
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
      // Every sign-in resolves Google's endpoints from its discovery document,
      // and that call had no timeout and no retry: one transient network blip
      // failed the whole sign-in with `TypeError: fetch failed` and bounced the
      // user to ?error=Configuration. See lib/oauth-fetch.ts.
      [customFetch]: resilientOAuthFetch,
    }),
    // TEMPORARY — demo bypass link. Delete this provider with lib/demo-access.ts.
    // Never interactive: there is no form, and /api/demo is the only caller.
    Credentials({
      id: "demo-link",
      name: "Demo link",
      credentials: { token: { type: "password" } },
      authorize: async (credentials) => {
        const token = typeof credentials?.token === "string" ? credentials.token : "";
        if (!verifyDemoToken(token)) return null;
        return { id: DEMO_EMAIL, email: DEMO_EMAIL, name: DEMO_NAME };
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, user }) {
      const googleProfile = profile as GoogleProfile | undefined;
      const email = normalizeAuthEmail(googleProfile?.email || user.email);
      const emailVerified = googleProfile?.email_verified;

      // The demo identity sits on an allowed domain, so it would otherwise pass
      // the ordinary check even after the door shuts. Gate it explicitly.
      if (isDemoEmail(email)) return verifyDemoToken(process.env.DEMO_ACCESS_TOKEN);

      return Boolean(email && emailVerified !== false && isAllowedAuthEmail(email));
    },
    async session({ session }) {
      if (session.user?.email) {
        session.user.email = normalizeAuthEmail(session.user.email) || session.user.email;
      }

      return session;
    },
  },
});
