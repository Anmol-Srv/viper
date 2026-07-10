import { NextRequest, NextResponse } from "next/server";

// Route protection table (CONTRACT.md "Portal session cookie + route protection"):
//   /login, /api/auth/*   → public (the login flow itself)
//   /api/health           → public (doctor script + uptime checks)
//   /api/deploy           → public here — it's authed by its own deploy-token Bearer check,
//                            never a session (the builder CLI has no browser session)
//   everything else       → requires viper_portal_session
const PUBLIC_EXACT = new Set(["/login", "/api/health", "/api/deploy"]);
const PUBLIC_PREFIX = ["/api/auth/"];

function isPublic(pathname: string) {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = request.cookies.has("viper_portal_session");
  const devBypass = process.env.PORTAL_DEV_BYPASS === "1";
  if (hasSession || devBypass) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
