import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  signEdgeSession,
  verifyEdgeSession,
} from "@/lib/jwt-edge";
import { canAccessPath, ROLE_HOME } from "@/lib/role-routes";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/setup",
  "/api/health",
];

const PASSWORD_CHANGE_ALLOWED_PATHS = [
  "/change-password",
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/auth/me",
];

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSameOriginRequest(req: NextRequest): boolean {
  const originHeader = req.headers.get("origin");
  const refererHeader = req.headers.get("referer");
  const sourceUrl = originHeader || refererHeader;
  if (!sourceUrl) {
    // Allow non-browser or same-origin requests that omit Origin/Referer
    return true;
  }
  try {
    const parsedSource = new URL(sourceUrl);
    const expectedHost =
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      req.nextUrl.host;
    return parsedSource.host.toLowerCase() === expectedHost.toLowerCase();
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api/") &&
    STATE_CHANGING_METHODS.has(req.method.toUpperCase()) &&
    !isSameOriginRequest(req)
  ) {
    return NextResponse.json(
      { error: "Forbidden: cross-origin request blocked" },
      { status: 403 }
    );
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const session = await verifyEdgeSession(token);
  if (!session) {
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set(SESSION_COOKIE_NAME, "", getSessionCookieOptions(0));
    return res;
  }

  if (
    session.mustChangePassword &&
    !PASSWORD_CHANGE_ALLOWED_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    )
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Password change required before accessing this resource",
          mustChangePassword: true,
        },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  if (!pathname.startsWith("/api/") && !canAccessPath(session.role, pathname)) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
  }

  const res = NextResponse.next();

  // Refresh idle timeout stamp at most every 2 minutes of activity while preserving sessionStartedAt
  if (Date.now() - session.lastActivityAt > 2 * 60 * 1000) {
    const refreshed = await signEdgeSession({
      userId: session.userId,
      username: session.username,
      fullName: session.fullName,
      role: session.role,
      mustChangePassword: session.mustChangePassword,
      sessionStartedAt: session.sessionStartedAt,
    });
    res.cookies.set(SESSION_COOKIE_NAME, refreshed, getSessionCookieOptions());
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

