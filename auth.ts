import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { isAllowedAuthEmail, normalizeAuthEmail } from "./lib/auth-utils";
// TEMPORARY — demo bypass link. Remove with lib/demo-access.ts.
import { DEMO_EMAIL, DEMO_NAME, isDemoEmail, verifyDemoToken } from "./lib/demo-access";

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
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
