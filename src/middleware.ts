import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

// NOTE: Middleware runs on the Edge runtime, which can't use the `jsonwebtoken`
// package (it depends on Node's `crypto` module). So here we only check
// "does a token cookie exist" — a cheap, fast gate. The *real* signature
// verification happens in each API route / server component via verifyToken().
// This is a common, intentional pattern: middleware = coarse routing guard,
// route handlers = source of truth for identity.

const PROTECTED_PREFIXES = ["/exams"];
const AUTH_PAGES = ["/login", "/signup"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasToken = Boolean(req.cookies.get(AUTH_COOKIE_NAME)?.value);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (isProtected && !hasToken) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && hasToken) {
    return NextResponse.redirect(new URL("/exams", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/exams/:path*", "/login", "/signup"],
};
