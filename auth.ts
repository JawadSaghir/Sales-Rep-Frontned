import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedAuthEmail, normalizeAuthEmail } from "./lib/auth-utils";

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
  ],
  callbacks: {
    async signIn({ profile, user }) {
      const googleProfile = profile as GoogleProfile | undefined;
      const email = normalizeAuthEmail(googleProfile?.email || user.email);
      const emailVerified = googleProfile?.email_verified;

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
