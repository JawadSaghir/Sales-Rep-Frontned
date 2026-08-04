import { cookies } from "next/headers";
import LoginPanel from "@/components/LoginPanel";
import type { Role } from "@/lib/types";

export const metadata = {
  title: "Sign in | ISTV AI Mock Calls",
  robots: { index: false, follow: false },
};

/** Copy carried over from /sign-in: the dominant failure is a non-approved domain. */
const REJECTED =
  "This Google account is not approved for ISTV AI MOCK Calls. Use your Inside Success TV, Inside Success, Mawer Capital, or Next Level CEO TV email.";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Relative paths only, and never back to a login screen — same rule /sign-in
 * used, so a crafted ?callbackUrl= cannot turn this into an open redirect.
 */
function safeRedirect(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  if (value.startsWith("/login") || value.startsWith("/sign-in")) return undefined;
  return value;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string | string[]; error?: string | string[] };
}) {
  // The remembered role choice, read server-side so the toggle starts where the
  // operator left it with no hydration mismatch and no first-frame flash. This is
  // a routing hint only — see components/LoginPanel.tsx and lib/auth.ts.
  const choice = cookies().get("istv_role_choice")?.value;
  const initialRole: Role = choice === "rep" ? "rep" : "admin";

  return (
    <LoginPanel
      initialRole={initialRole}
      callbackUrl={safeRedirect(first(searchParams.callbackUrl))}
      errorMessage={first(searchParams.error) ? REJECTED : undefined}
    />
  );
}
