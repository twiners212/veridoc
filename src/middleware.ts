import { NextRequest, NextResponse } from "next/server";
import { securityHeaders } from "../next.config";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/documents",
  "/approvals",
  "/to-read",
  "/acknowledgments",
  "/read",
  "/audit",
  "/settings",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const header of securityHeaders) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (isProtectedPath(pathname)) {
    const sessionToken =
      request.cookies.get("better-auth.session_token")?.value ||
      request.cookies.get("__Secure-better-auth.session_token")?.value;

    if (!sessionToken) {
      const signInUrl = new URL("/auth/sign-in", request.url);
      const callbackPath = `${pathname}${search}`;
      signInUrl.searchParams.set("callbackUrl", callbackPath);
      return applySecurityHeaders(NextResponse.redirect(signInUrl));
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files, _next, favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
