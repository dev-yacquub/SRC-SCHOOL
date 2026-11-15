import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }

  if (!pathname.startsWith("/api/") && !canAccessPath(session.role, pathname)) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
  }

  const res = NextResponse.next();

  // Refresh idle timeout stamp at most every 2 minutes of activity
  if (Date.now() - session.lastActivityAt > 2 * 60 * 1000) {
    const refreshed = await signEdgeSession({
      userId: session.userId,
      username: session.username,
      fullName: session.fullName,
      role: session.role,
    });
    res.cookies.set(SESSION_COOKIE_NAME, refreshed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

