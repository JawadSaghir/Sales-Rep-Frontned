import { cookies } from "next/headers";
import LoginPanel from "@/components/LoginPanel";
import type { Role } from "@/lib/types";

export const metadata = {
  title: "Sign in | ISTV AI Mock Calls",
  robots: { index: false, follow: false },
};

/**
 * These are not interchangeable, and saying the wrong one sends someone hunting
 * the wrong problem: "Configuration" is a server-side failure (most often the
 * outbound call to Google's discovery endpoint — see lib/oauth-fetch.ts), NOT a
 * rejected account. Telling a valid admin their email is not approved because
 * the network blipped is worse than saying nothing.
 */
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "This Google account is not approved for ISTV AI MOCK Calls. Use your Inside Success TV, Inside Success, Mawer Capital, or Next Level CEO TV email.",
  Configuration: "Sign-in could not reach Google just now. Try again in a moment.",
  DemoExpired: "That demo link has expired. Ask for a fresh one, or sign in with your company account.",
};

const ERROR_FALLBACK = "Sign-in did not complete. Try again.";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function errorMessageFor(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return ERROR_MESSAGES[code] ?? ERROR_FALLBACK;
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
      errorMessage={errorMessageFor(first(searchParams.error))}
    />
  );
}
