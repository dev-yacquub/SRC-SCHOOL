import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      const session = await verifySessionToken(token);
      if (session?.userId) {
        // Bump lastLoginAt forward so any copied JWT from this session is immediately revoked
        await prisma.user.update({
          where: { id: session.userId },
          data: { lastLoginAt: new Date(Date.now() + 2000) },
        });
      }
    }
  } catch {
    // Ignore DB errors during logout so cookie is always cleared
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", getSessionCookieOptions(0));
  return res;
}

