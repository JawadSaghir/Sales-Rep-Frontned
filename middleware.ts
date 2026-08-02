import { NextResponse } from "next/server";
import { auth } from "./auth";
// TEMPORARY — demo bypass link. Remove with lib/demo-access.ts.
import { isDemoDoorOpen, isDemoEmail } from "./lib/demo-access";

const PUBLIC_PATHS = new Set(["/sign-in"]);

export default auth((request) => {
  const { nextUrl } = request;

  // Revocation for already-issued demo cookies: an unset token or a passed
  // deadline sends them back to sign-in, where they have no way in. The
  // PUBLIC_PATHS exclusion is load-bearing — without it /sign-in redirects to
  // itself forever, since the stale cookie is still attached.
  if (
    !PUBLIC_PATHS.has(nextUrl.pathname)
    && isDemoEmail(request.auth?.user?.email)
    && !isDemoDoorOpen()
  ) {
    return NextResponse.redirect(new URL("/sign-in?error=DemoExpired", nextUrl));
  }

  if (PUBLIC_PATHS.has(nextUrl.pathname)) {
    if (request.auth?.user && !nextUrl.searchParams.get("error")) {
      return NextResponse.redirect(new URL("/", nextUrl));
    }

    return NextResponse.next();
  }

  if (!request.auth?.user) {
    const signInUrl = new URL("/sign-in", nextUrl);
    signInUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
